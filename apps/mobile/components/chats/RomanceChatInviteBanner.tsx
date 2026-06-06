import React, { useState } from "react";
import { View, Text, Pressable, ActivityIndicator, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Colors, Typography } from "@/constants/tokens";
import {
  acceptRomanceChatInvite,
  declineRomanceChatInvite,
} from "@/lib/romance/chatInvites";

type RomanceChatInviteBannerProps = {
  conversationId: string;
  partnerName: string;
  previewMessage?: string | null;
  onAccepted: () => void;
  onDeclined: () => void;
};

export function RomanceChatInviteBanner({
  conversationId,
  partnerName,
  previewMessage,
  onAccepted,
  onDeclined,
}: RomanceChatInviteBannerProps) {
  const [busy, setBusy] = useState<"accept" | "decline" | null>(null);

  const handleAccept = async () => {
    if (busy) return;
    setBusy("accept");
    try {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      const res = await acceptRomanceChatInvite(conversationId);
      if (res.ok) onAccepted();
    } finally {
      setBusy(null);
    }
  };

  const handleDecline = async () => {
    if (busy) return;
    setBusy("decline");
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      const res = await declineRomanceChatInvite(conversationId);
      if (res.ok) onDeclined();
    } finally {
      setBusy(null);
    }
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.iconRow}>
        <Ionicons name="mail" size={22} color={Colors.romance.primary} />
        <Text style={styles.title}>Chat invite from {partnerName}</Text>
      </View>
      <Text style={styles.body}>
        {previewMessage?.trim()
          ? `"${previewMessage.trim()}"`
          : `${partnerName} wants to start a conversation with you.`}
      </Text>
      <Text style={styles.hint}>Accept to match and keep chatting, or decline to remove this chat.</Text>
      <View style={styles.actions}>
        <Pressable
          onPress={handleDecline}
          disabled={!!busy}
          style={[styles.btn, styles.declineBtn]}
        >
          {busy === "decline" ? (
            <ActivityIndicator color={Colors.gray700} />
          ) : (
            <Text style={styles.declineText}>Decline</Text>
          )}
        </Pressable>
        <Pressable
          onPress={handleAccept}
          disabled={!!busy}
          style={[styles.btn, styles.acceptBtn]}
        >
          {busy === "accept" ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.acceptText}>Accept</Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginHorizontal: 12,
    marginTop: 8,
    marginBottom: 4,
    padding: 14,
    borderRadius: 16,
    backgroundColor: Colors.romance.primary + "12",
    borderWidth: 1,
    borderColor: Colors.romance.primary + "35",
  },
  iconRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  title: { ...Typography.body, fontWeight: "700", color: Colors.romance.primary, flex: 1 },
  body: { ...Typography.body, color: Colors.textPrimary, marginBottom: 6 },
  hint: { ...Typography.caption, color: Colors.gray600, marginBottom: 12 },
  actions: { flexDirection: "row", gap: 10 },
  btn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
  },
  declineBtn: { backgroundColor: Colors.gray100, borderWidth: 1, borderColor: Colors.gray200 },
  acceptBtn: { backgroundColor: Colors.romance.primary },
  declineText: { fontWeight: "600", color: Colors.gray700 },
  acceptText: { fontWeight: "700", color: "#fff" },
});
