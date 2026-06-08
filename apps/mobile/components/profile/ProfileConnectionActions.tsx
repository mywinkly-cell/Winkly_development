import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Colors, Typography, Layout } from "@/constants/tokens";
import type { ProfileSwipeMode } from "./ProfileSwipeActions";

type Props = {
  mode: ProfileSwipeMode;
  primaryColor: string;
  busy?: boolean;
  /** When false, primary action reads "Start chat" (connected but no thread yet). */
  hasChat?: boolean;
  onChat: () => void;
  onRemove: () => void;
};

function removeLabel(mode: ProfileSwipeMode) {
  return mode === "romance" ? "Unmatch" : "Remove contact";
}

export function ProfileConnectionActions({
  mode,
  primaryColor,
  busy = false,
  hasChat = true,
  onChat,
  onRemove,
}: Props) {
  const chatLabel = hasChat ? "Chat" : "Start chat";

  return (
    <View style={styles.container}>
      <TouchableOpacity
        onPress={onChat}
        disabled={busy}
        style={[styles.chatBtn, { backgroundColor: primaryColor }, busy && styles.disabled]}
        activeOpacity={0.9}
        accessibilityLabel={chatLabel}
      >
        <Ionicons name="chatbubble-outline" size={20} color={Colors.white} />
        <Text style={styles.chatText}>{chatLabel}</Text>
      </TouchableOpacity>

      <TouchableOpacity
        onPress={onRemove}
        disabled={busy}
        style={[styles.removeBtn, busy && styles.disabled]}
        activeOpacity={0.9}
      >
        <Ionicons name="person-remove-outline" size={20} color={Colors.errorRed} />
        <Text style={styles.removeText}>{removeLabel(mode)}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 12,
    paddingTop: 16,
    paddingBottom: 28,
  },
  chatBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: Layout.radii.control,
    paddingVertical: 14,
  },
  chatText: {
    ...Typography.button,
    color: Colors.white,
  },
  removeBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: Layout.radii.control,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: Colors.errorRed + "55",
    backgroundColor: Colors.white,
  },
  removeText: {
    ...Typography.button,
    color: Colors.errorRed,
  },
  disabled: { opacity: 0.6 },
});
