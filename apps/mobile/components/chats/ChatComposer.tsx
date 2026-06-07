/**
 * Full-width chat message composer: text input, attach, always-visible Send,
 * and voice record → review (play/delete) → send.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  ActivityIndicator,
  StyleSheet,
  Platform,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
  useAudioRecorder,
  useAudioRecorderState,
} from "expo-audio";
import { Colors, Typography } from "@/constants/tokens";
import { RecordingWaveform } from "@/components/chats/RecordingWaveform";

const MAX_VOICE_SECONDS = 180;

type VoicePhase = "idle" | "recording" | "preview";

function formatDurationMs(ms: number) {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function VoiceDraftPlayer({
  uri,
  accentColor,
  durationMs,
}: {
  uri: string;
  accentColor: string;
  durationMs: number;
}) {
  const player = useAudioPlayer(uri);
  const status = useAudioPlayerStatus(player);

  const toggle = useCallback(() => {
    if (status.playing) player.pause();
    else player.play();
  }, [player, status.playing]);

  const posMs = (status.currentTime ?? 0) * 1000;
  const totalMs = status.duration > 0 ? status.duration * 1000 : durationMs;
  const label =
    status.duration > 0
      ? `${formatDurationMs(posMs)} / ${formatDurationMs(totalMs)}`
      : formatDurationMs(durationMs);

  return (
    <View style={styles.previewPlayer}>
      <Pressable
        onPress={toggle}
        style={[styles.previewPlayBtn, { backgroundColor: accentColor + "22" }]}
        accessibilityLabel={status.playing ? "Pause preview" : "Play preview"}
      >
        {status.isBuffering ? (
          <ActivityIndicator size="small" color={accentColor} />
        ) : (
          <Ionicons name={status.playing ? "pause" : "play"} size={22} color={accentColor} />
        )}
      </Pressable>
      <View style={styles.previewWaveTrack}>
        <View style={[styles.previewWaveFill, { width: `${totalMs > 0 ? Math.min(100, (posMs / totalMs) * 100) : 0}%`, backgroundColor: accentColor }]} />
      </View>
      <Text style={styles.previewDuration}>{label}</Text>
    </View>
  );
}

export type ChatComposerProps = {
  draft: string;
  onChangeDraft: (text: string) => void;
  onFocus?: () => void;
  onBlur?: () => void;
  accentColor: string;
  sending: boolean;
  replyPreview?: string | null;
  onClearReply?: () => void;
  onSendText: () => void;
  onSendVoice: (uri: string, durationMs: number) => Promise<void>;
  onAttachPress: () => void;
  inputRef?: React.RefObject<TextInput | null>;
};

export function ChatComposer({
  draft,
  onChangeDraft,
  onFocus,
  onBlur,
  accentColor,
  sending,
  replyPreview,
  onClearReply,
  onSendText,
  onSendVoice,
  onAttachPress,
  inputRef,
}: ChatComposerProps) {
  const insets = useSafeAreaInsets();
  const localInputRef = useRef<TextInput>(null);
  const mergedRef = inputRef ?? localInputRef;
  const recordUriRef = useRef<string | null>(null);

  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder);

  const [voicePhase, setVoicePhase] = useState<VoicePhase>("idle");
  const [voiceDraftUri, setVoiceDraftUri] = useState<string | null>(null);
  const [voiceDraftDurationMs, setVoiceDraftDurationMs] = useState(0);
  const [voiceSending, setVoiceSending] = useState(false);

  const isRecording = voicePhase === "recording" && recorderState.isRecording;
  const isPreview = voicePhase === "preview" && !!voiceDraftUri;
  const hasText = draft.trim().length > 0;
  const canSendText = hasText && !isRecording && !isPreview;
  const canSendVoice = isPreview && !!voiceDraftUri && !voiceSending;
  const canSend = canSendText || canSendVoice;
  const busy = sending || voiceSending;

  const discardVoiceDraft = useCallback(() => {
    setVoiceDraftUri(null);
    setVoiceDraftDurationMs(0);
    setVoicePhase("idle");
    recordUriRef.current = null;
  }, []);

  const stopRecordingToPreview = useCallback(async () => {
    try {
      const durMs = recorderState.durationMillis ?? 0;
      await recorder.stop();
      const uri = recorder.uri ?? recordUriRef.current;
      if (!uri || durMs < 400) {
        Alert.alert("Voice message", "Recording was too short. Try again.");
        setVoicePhase("idle");
        return;
      }
      if (durMs > (MAX_VOICE_SECONDS + 1) * 1000) {
        Alert.alert("Voice message", `Please keep voice messages under ${MAX_VOICE_SECONDS} seconds.`);
        setVoicePhase("idle");
        return;
      }
      recordUriRef.current = uri;
      setVoiceDraftUri(uri);
      setVoiceDraftDurationMs(durMs);
      setVoicePhase("preview");
    } catch {
      setVoicePhase("idle");
      Alert.alert("Voice message", "Could not save the recording. Try again.");
    }
  }, [recorder, recorderState.durationMillis]);

  useEffect(() => {
    if (!isRecording) return;
    const id = setInterval(() => {
      const ms = recorderState.durationMillis ?? 0;
      if (ms > (MAX_VOICE_SECONDS + 1) * 1000) {
        void stopRecordingToPreview();
      }
    }, 400);
    return () => clearInterval(id);
  }, [isRecording, recorderState.durationMillis, stopRecordingToPreview]);

  const startRecording = useCallback(async () => {
    if (busy || isPreview) return;
    const perm = await AudioModule.requestRecordingPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Microphone", "Permission is required to record a voice message.");
      return;
    }
    discardVoiceDraft();
    recordUriRef.current = null;
    try {
      await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      setVoicePhase("recording");
    } catch {
      setVoicePhase("idle");
      Alert.alert("Voice message", "Could not start recording.");
    }
  }, [busy, isPreview, discardVoiceDraft, recorder]);

  const handleMicPress = useCallback(() => {
    if (isRecording) void stopRecordingToPreview();
    else void startRecording();
  }, [isRecording, stopRecordingToPreview, startRecording]);

  const handleSendPress = useCallback(async () => {
    if (busy) return;
    if (canSendVoice && voiceDraftUri) {
      setVoiceSending(true);
      try {
        await onSendVoice(voiceDraftUri, voiceDraftDurationMs);
        discardVoiceDraft();
      } finally {
        setVoiceSending(false);
      }
      return;
    }
    if (canSendText) onSendText();
  }, [busy, canSendVoice, canSendText, voiceDraftUri, voiceDraftDurationMs, onSendVoice, onSendText, discardVoiceDraft]);

  const recordingMs = recorderState.durationMillis ?? 0;

  return (
    <View
      style={[
        styles.root,
        {
          paddingBottom: Math.max(insets.bottom, 10),
          shadowColor: Platform.OS === "ios" ? "#1C1C1E" : "#000",
        },
      ]}
    >
      {replyPreview ? (
        <View style={styles.replyStrip}>
          <View style={[styles.replyAccent, { backgroundColor: accentColor }]} />
          <Text style={styles.replyText} numberOfLines={1}>
            Replying to: {replyPreview}
          </Text>
          <Pressable onPress={onClearReply} hitSlop={10} accessibilityLabel="Cancel reply">
            <Ionicons name="close-circle" size={22} color={Colors.gray500} />
          </Pressable>
        </View>
      ) : null}

      <View style={styles.bar}>
        <Pressable
          onPress={onAttachPress}
          style={styles.attachBtn}
          disabled={busy || isRecording}
          accessibilityLabel="More actions"
        >
          <Ionicons name="add" size={26} color={Colors.primaryViolet} />
        </Pressable>

        <View style={styles.inputColumn}>
          {isRecording ? (
            <View style={styles.recordingRow}>
              <View style={styles.recordingDot} />
              <Text style={styles.recordingTime}>{formatDurationMs(recordingMs)}</Text>
              <RecordingWaveform active={isRecording} accentColor={accentColor} />
              <Pressable
                onPress={() => void stopRecordingToPreview()}
                style={styles.recordingStopBtn}
                accessibilityLabel="Stop recording"
              >
                <Ionicons name="stop" size={18} color="#FFF" />
              </Pressable>
            </View>
          ) : isPreview && voiceDraftUri ? (
            <View style={styles.previewRow}>
              <VoiceDraftPlayer uri={voiceDraftUri} accentColor={accentColor} durationMs={voiceDraftDurationMs} />
              <Pressable
                onPress={discardVoiceDraft}
                style={styles.discardBtn}
                accessibilityLabel="Delete voice message"
              >
                <Ionicons name="trash-outline" size={22} color={Colors.errorRed} />
              </Pressable>
            </View>
          ) : (
            <View style={styles.textInputShell}>
              <TextInput
                ref={mergedRef}
                value={draft}
                onChangeText={onChangeDraft}
                onFocus={onFocus}
                onBlur={onBlur}
                placeholder="Message"
                placeholderTextColor={Colors.gray500}
                multiline
                maxLength={4000}
                style={styles.textInput}
                editable={!busy}
              />
              {!hasText && !busy ? (
                <Pressable
                  onPress={handleMicPress}
                  style={styles.micInlineBtn}
                  accessibilityLabel="Record voice message"
                >
                  <Ionicons name="mic-outline" size={22} color={Colors.gray600} />
                </Pressable>
              ) : null}
            </View>
          )}
        </View>

        <Pressable
          onPress={() => void handleSendPress()}
          disabled={!canSend || busy}
          style={[
            styles.sendBtn,
            { backgroundColor: accentColor },
            (!canSend || busy) && styles.sendBtnDisabled,
          ]}
          accessibilityLabel="Send message"
        >
          {busy ? (
            <ActivityIndicator size="small" color="#FFF" />
          ) : (
            <Text style={styles.sendLabel}>Send</Text>
          )}
        </Pressable>
      </View>

      {isPreview ? (
        <Text style={styles.hint}>Listen to your message, then Send or delete it.</Text>
      ) : isRecording ? (
        <Text style={styles.hint}>Tap stop when you are done — you can review before sending.</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    width: "100%",
    backgroundColor: Colors.white,
    paddingTop: 8,
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 12,
  },
  replyStrip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginHorizontal: 12,
    marginBottom: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: Colors.gray100,
    borderRadius: 12,
  },
  replyAccent: {
    width: 3,
    alignSelf: "stretch",
    borderRadius: 2,
  },
  replyText: {
    flex: 1,
    fontSize: 13,
    color: Colors.gray700,
  },
  bar: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 10,
    paddingHorizontal: 12,
  },
  attachBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: Colors.primaryViolet + "14",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2,
  },
  inputColumn: {
    flex: 1,
    minHeight: 44,
  },
  textInputShell: {
    flexDirection: "row",
    alignItems: "flex-end",
    minHeight: 44,
    maxHeight: 120,
    backgroundColor: Colors.gray100,
    borderRadius: 22,
    paddingLeft: 16,
    paddingRight: 8,
    paddingVertical: Platform.OS === "ios" ? 10 : 8,
  },
  textInput: {
    flex: 1,
    fontSize: 16,
    lineHeight: 22,
    color: Colors.textPrimary,
    maxHeight: 96,
    paddingVertical: 0,
  },
  micInlineBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 1,
  },
  recordingRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 44,
    backgroundColor: Colors.errorRed + "12",
    borderRadius: 22,
    paddingHorizontal: 14,
  },
  recordingDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.errorRed,
  },
  recordingTime: {
    fontSize: 13,
    fontWeight: "600",
    color: Colors.textPrimary,
    fontVariant: ["tabular-nums"],
    minWidth: 44,
  },
  recordingStopBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: Colors.errorRed,
    alignItems: "center",
    justifyContent: "center",
  },
  previewRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minHeight: 44,
    backgroundColor: Colors.gray100,
    borderRadius: 22,
    paddingLeft: 10,
    paddingRight: 10,
    paddingVertical: 6,
  },
  previewPlayer: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  previewPlayBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  previewWaveTrack: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.gray200,
    overflow: "hidden",
  },
  previewWaveFill: {
    height: "100%",
    borderRadius: 2,
  },
  previewDuration: {
    fontSize: 12,
    fontWeight: "600",
    color: Colors.gray600,
    minWidth: 52,
    textAlign: "right",
    fontVariant: ["tabular-nums"],
  },
  discardBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  sendBtn: {
    minWidth: 72,
    height: 44,
    borderRadius: 22,
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2,
  },
  sendBtnDisabled: {
    opacity: 0.42,
  },
  sendLabel: {
    ...Typography.button,
    color: "#FFF",
    fontWeight: "700",
    fontSize: 15,
  },
  hint: {
    fontSize: 12,
    color: Colors.gray500,
    textAlign: "center",
    marginTop: 6,
    paddingHorizontal: 16,
  },
});
