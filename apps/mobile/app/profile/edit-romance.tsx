// apps/mobile/app/profile/edit-romance.tsx
// Winkly – Profile: Edit Romance. Persists to profiles_mode (mode = romance).

import React, { useState, useEffect, useRef } from "react";
import { View, Text, ScrollView, TouchableOpacity, TextInput, StyleSheet, Alert, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { AudioModule, RecordingPresets, setAudioModeAsync, useAudioRecorder, useAudioRecorderState } from "expo-audio";
import { useAuth } from "@/providers";
import { getOwnProfileMode, upsertOwnProfileMode } from "@/lib/access/profiles";
import { Colors, Typography, Layout } from "@/constants/tokens";
import { supabase } from "@/lib/supabase";
import { pickAndUploadVideo } from "@/lib/uploadMedia";

export default function EditRomance() {
  const router = useRouter();
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [goal, setGoal] = useState("");
  const [aboutLove, setAboutLove] = useState("");
  const [dealbreakers, setDealbreakers] = useState("");
  const [lifestyleTags, setLifestyleTags] = useState("");
  const [voiceUrl, setVoiceUrl] = useState<string | null>(null);
  const [voiceSeconds, setVoiceSeconds] = useState<number | null>(null);
  const [videoBioUrl, setVideoBioUrl] = useState<string | null>(null);
  const audioRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(audioRecorder);
  const lastRecordedUriRef = useRef<string | null>(null);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    (async () => {
      const profile = await getOwnProfileMode(user.id, "romance");
      if (cancelled) return;
      const meta = (profile?.meta as Record<string, unknown>) ?? {};
      setGoal((meta.relationship_goal as string) ?? "");
      setAboutLove((meta.what_you_value as string) ?? "");
      setDealbreakers((meta.dealbreakers as string) ?? "");
      const tags = (profile as { lifestyle_tags?: string[] | null })?.lifestyle_tags;
      setLifestyleTags(Array.isArray(tags) ? tags.join(", ") : "");
      setVoiceUrl((profile as { voice_prompt_url?: string | null })?.voice_prompt_url ?? null);
      setVoiceSeconds((profile as { voice_prompt_seconds?: number | null })?.voice_prompt_seconds ?? null);
      setVideoBioUrl((profile as { video_bio_url?: string | null })?.video_bio_url ?? null);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [user?.id]);

  useEffect(() => {
    (async () => {
      try {
        const status = await AudioModule.requestRecordingPermissionsAsync();
        if (!status.granted) return;
        await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true });
      } catch {
        // Ignore: user can still use the rest of the screen.
      }
    })();
  }, []);

  const save = async () => {
    if (!user?.id) return;
    setSaving(true);
    const tags = lifestyleTags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean)
      .slice(0, 12);
    const { error } = await upsertOwnProfileMode(user.id, "romance", {
      lifestyle_tags: tags.length ? tags : null,
      voice_prompt_url: voiceUrl,
      voice_prompt_seconds: voiceSeconds,
      video_bio_url: videoBioUrl,
      meta: {
        relationship_goal: goal.trim() || null,
        what_you_value: aboutLove.trim() || null,
        dealbreakers: dealbreakers.trim() || null,
      },
    });
    setSaving(false);
    if (error) {
      Alert.alert("Error", "Could not save profile. Please try again.");
      return;
    }
    router.back();
  };

  if (!user) return null;
  if (loading) {
    return (
      <View style={[styles.screen, styles.centered]}>
        <ActivityIndicator size="large" color={Colors.primaryViolet} />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Header title="Edit romance" onBack={() => router.back()} onSave={save} saving={saving} />

        <View style={styles.card}>
          <Text style={styles.title}>Romance</Text>
          <Text style={styles.subtitle}>Your dating intentions and preferences.</Text>

          <Label text="Relationship goal" />
          <TextInput
            value={goal}
            onChangeText={setGoal}
            placeholder="e.g. serious relationship, long-term, etc."
            placeholderTextColor={Colors.gray500}
            style={styles.input}
          />

          <Label text="What you value" />
          <TextInput
            value={aboutLove}
            onChangeText={setAboutLove}
            placeholder="e.g. honesty, growth, emotional maturity…"
            placeholderTextColor={Colors.gray500}
            style={[styles.input, { minHeight: 110, textAlignVertical: "top" }]}
            multiline
          />

          <Label text="Dealbreakers (optional)" />
          <TextInput
            value={dealbreakers}
            onChangeText={setDealbreakers}
            placeholder="e.g. smoking, disrespect, etc."
            placeholderTextColor={Colors.gray500}
            style={[styles.input, { minHeight: 90, textAlignVertical: "top" }]}
            multiline
            editable={!saving}
          />
        </View>

        <View style={[styles.card, { marginTop: 16 }]}>
          <Text style={styles.title}>Rich profile</Text>
          <Text style={styles.subtitle}>Lifestyle tags, a short voice prompt, and optional video intro.</Text>

          <Label text="Lifestyle tags (comma-separated)" />
          <TextInput
            value={lifestyleTags}
            onChangeText={setLifestyleTags}
            placeholder="e.g. gym, foodie, travel, early bird"
            placeholderTextColor={Colors.gray500}
            style={styles.input}
            editable={!saving}
          />

          <Label text="Voice prompt" />
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 12 }}>
            <TouchableOpacity
              style={[styles.secondaryBtn, recorderState.isRecording && { backgroundColor: Colors.errorRed + "22" }]}
              onPress={async () => {
                if (!user?.id) return;
                if (recorderState.isRecording) {
                  try {
                    await audioRecorder.stop();
                    const uri = audioRecorder.uri ?? lastRecordedUriRef.current;
                    const durSec =
                      recorderState.durationMillis != null ? Math.round(recorderState.durationMillis / 1000) : null;
                    lastRecordedUriRef.current = uri ?? null;
                    if (!uri) return;
                    const resp = await fetch(uri);
                    const blob = await resp.blob();
                    const path = `${user.id}/romance/voice_${Date.now()}.m4a`;
                    const { error: upErr } = await supabase.storage.from("user-videos").upload(path, blob, {
                      contentType: "audio/mp4",
                      upsert: true,
                    });
                    if (upErr) throw upErr;
                    const { data } = supabase.storage.from("user-videos").getPublicUrl(path);
                    setVoiceUrl(data.publicUrl);
                    setVoiceSeconds(durSec);
                  } catch (e) {
                    Alert.alert("Voice", e instanceof Error ? e.message : "Upload failed");
                  }
                  return;
                }
                const perm = await AudioModule.requestRecordingPermissionsAsync();
                if (!perm.granted) {
                  Alert.alert("Microphone", "Permission is required to record.");
                  return;
                }
                await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true });
                await audioRecorder.prepareToRecordAsync();
                audioRecorder.record();
              }}
              disabled={saving}
            >
              <Text style={styles.secondaryBtnText}>{recorderState.isRecording ? "Stop & upload" : "Record voice prompt"}</Text>
            </TouchableOpacity>
            {voiceUrl ? (
              <Text style={{ ...Typography.caption, color: Colors.gray600, flex: 1 }} numberOfLines={2}>
                Saved voice clip
              </Text>
            ) : null}
          </View>

          <Label text="Video bio (short clip)" />
          <TouchableOpacity
            style={styles.secondaryBtn}
            onPress={async () => {
              if (!user?.id) return;
              const url = await pickAndUploadVideo(user.id, "romance");
              if (url) setVideoBioUrl(url);
            }}
            disabled={saving}
          >
            <Text style={styles.secondaryBtnText}>{videoBioUrl ? "Replace video bio" : "Pick video from library"}</Text>
          </TouchableOpacity>
          {videoBioUrl ? (
            <Text style={{ ...Typography.caption, color: Colors.gray600, marginTop: 8 }} numberOfLines={1}>
              Video added
            </Text>
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}

function Header({
  title,
  onBack,
  onSave,
  saving,
}: { title: string; onBack: () => void; onSave: () => void; saving?: boolean }) {
  return (
    <View style={styles.headerRow}>
      <TouchableOpacity onPress={onBack} style={styles.backBtn} activeOpacity={0.9} accessibilityLabel="Back" disabled={saving}>
        <Ionicons name="arrow-back" size={24} color={Colors.textPrimary} />
      </TouchableOpacity>
      <Text style={styles.headerTitle}>{title}</Text>
      <TouchableOpacity onPress={onSave} style={[styles.saveBtn, saving && styles.saveBtnDisabled]} activeOpacity={0.9} disabled={saving}>
        <Text style={styles.saveText}>{saving ? "Saving…" : "Save"}</Text>
      </TouchableOpacity>
    </View>
  );
}

function Label({ text }: { text: string }) {
  return <Text style={styles.label}>{text}</Text>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.backgroundLight },
  scroll: { padding: 20, paddingBottom: 40 },

  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.gray100,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#1C1C1E",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
  },
  headerTitle: { ...Typography.headerTitle, color: Colors.textPrimary },
  saveBtn: { width: 70, paddingVertical: 8, borderRadius: 10, backgroundColor: Colors.primaryViolet, alignItems: "center" },
  saveText: { ...Typography.caption, color: Colors.accentYellow },

  card: { backgroundColor: "#FFF", borderRadius: Layout.radii.card, borderWidth: 1, borderColor: Colors.gray200, padding: 16 },
  title: { ...Typography.h2, color: Colors.textPrimary, marginBottom: 6 },
  subtitle: { ...Typography.body, color: Colors.gray700, marginBottom: 14 },

  label: { ...Typography.caption, color: Colors.gray600, marginBottom: 6 },
  centered: { justifyContent: "center", alignItems: "center" },
  saveBtnDisabled: { opacity: 0.7 },
  input: {
    borderWidth: 1,
    borderColor: Colors.gray300,
    borderRadius: Layout.radii.control,
    backgroundColor: "#FFF",
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: Colors.textPrimary,
    marginBottom: 12,
  },
  secondaryBtn: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: Layout.radii.control,
    borderWidth: 1,
    borderColor: Colors.primaryViolet,
    backgroundColor: Colors.primaryViolet + "10",
  },
  secondaryBtnText: { ...Typography.caption, color: Colors.primaryViolet, fontWeight: "600" },

});
