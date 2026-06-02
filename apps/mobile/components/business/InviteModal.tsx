import React, { useState } from "react";
import {
  Modal,
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
} from "react-native";
import * as Haptics from "expo-haptics";
import { Colors, Typography, Layout, FontFamily } from "@/constants/tokens";
import { useModeContext } from "@/providers";
import { canUseAIFeature } from "@/lib/ai/aiFeatureGate";
import { getChatStrategicHostTopics } from "@/lib/ai/strategicHost";
import {
  connectionErrorMessage,
  sendBusinessInvite,
} from "@/lib/access/businessConnections";
import { trackBusinessInviteSent } from "@/lib/analytics/businessEvents";
import type { BusinessPersonItem } from "@/lib/business/homeFeed";

const TEMPLATES = [
  "Why I'm reaching out: ",
  "Shared interest in ",
  "I saw your work on ",
];

type Props = {
  visible: boolean;
  target: BusinessPersonItem;
  onClose: () => void;
  onSent: () => void;
};

export function InviteModal({ visible, target, onClose, onSent }: Props) {
  const { context } = useModeContext();
  const tier = context.subscription_tier ?? "free";
  const canAi = canUseAIFeature(tier, "chat_opener");
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);

  const len = note.length;
  const canSend = len >= 20 && len <= 200;

  const handleSend = async () => {
    if (!canSend) return;
    setSending(true);
    try {
      const result = await sendBusinessInvite(target.id, note);
      if (!result.ok) {
        Alert.alert("Connect", connectionErrorMessage(result.error));
        return;
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      trackBusinessInviteSent({
        note_length: len,
        ai_written: false,
        tier,
      });
      setNote("");
      onSent();
      onClose();
    } catch (e) {
      Alert.alert("Connect", e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setSending(false);
    }
  };

  const handleAiDraft = async () => {
    if (!canAi) {
      Alert.alert("Super feature", "Upgrade to Super or Premium to use AI note writing.");
      return;
    }
    setAiLoading(true);
    try {
      const topics = await getChatStrategicHostTopics({
        mode: "business",
        participantUserIds: [target.id],
      });
      const pitch = topics[0]?.pitch?.trim();
      if (pitch) setNote(pitch.slice(0, 200));
    } catch {
      Alert.alert("AI", "Could not generate a draft. Try again or write your own note.");
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.overlay}
      >
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={styles.sheet}>
          <Text style={styles.title}>Connect with {target.name}</Text>
          <Text style={styles.subtitle} numberOfLines={1}>
            {target.subtitle ?? "Professional"}
          </Text>

          <TextInput
            style={styles.input}
            multiline
            value={note}
            onChangeText={setNote}
            placeholder="Introduce yourself and why you'd like to connect…"
            placeholderTextColor={Colors.gray500}
            maxLength={200}
          />
          <Text style={styles.counter}>
            {len} / 200
          </Text>

          <View style={styles.templateRow}>
            {TEMPLATES.map((t) => (
              <Pressable key={t} style={styles.templateChip} onPress={() => setNote(t)}>
                <Text style={styles.templateText} numberOfLines={1}>
                  {t.replace(/: $/, "")}
                </Text>
              </Pressable>
            ))}
          </View>

          <Pressable onPress={handleAiDraft} disabled={aiLoading}>
            <Text style={[styles.aiLink, !canAi && styles.aiLinkDisabled]}>
              {aiLoading ? "Writing…" : canAi ? "Write with AI" : "Super feature — upgrade to use"}
            </Text>
          </Pressable>

          <Pressable
            style={[styles.primaryBtn, !canSend && styles.primaryDisabled]}
            onPress={handleSend}
            disabled={!canSend || sending}
          >
            {sending ? (
              <ActivityIndicator color={Colors.white} />
            ) : (
              <Text style={styles.primaryText}>Send invite</Text>
            )}
          </Pressable>
          <Pressable onPress={onClose} style={styles.cancelBtn}>
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: "flex-end" },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.4)" },
  sheet: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 32,
  },
  title: { ...Typography.h3, fontFamily: FontFamily.headingBold, color: Colors.textPrimary },
  subtitle: { ...Typography.caption, color: Colors.gray600, marginBottom: 12 },
  input: {
    minHeight: 100,
    borderWidth: 1,
    borderColor: Colors.gray200,
    borderRadius: Layout.radii.control,
    padding: 12,
    fontSize: 15,
    color: Colors.textPrimary,
    textAlignVertical: "top",
  },
  counter: { ...Typography.caption, color: Colors.gray500, marginTop: 4, textAlign: "right" },
  templateRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 },
  templateChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: Colors.gray100,
  },
  templateText: { fontSize: 12, color: Colors.textPrimary },
  aiLink: {
    marginTop: 12,
    fontSize: 14,
    fontWeight: "600",
    color: Colors.business.primary,
  },
  aiLinkDisabled: { color: Colors.gray500 },
  primaryBtn: {
    marginTop: 16,
    backgroundColor: Colors.business.primary,
    borderRadius: Layout.radii.control,
    paddingVertical: 14,
    alignItems: "center",
  },
  primaryDisabled: { opacity: 0.5 },
  primaryText: { color: Colors.white, fontWeight: "700", fontSize: 16 },
  cancelBtn: { marginTop: 12, alignItems: "center" },
  cancelText: { color: Colors.gray600, fontWeight: "600" },
});
