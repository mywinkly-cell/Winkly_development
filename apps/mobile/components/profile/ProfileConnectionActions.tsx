import React from "react";
import { PrimaryButton } from "@/components/ds";
import { useAppTheme, type AppTheme } from "@/constants/design-system";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
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
  const theme = useAppTheme();
  const styles = createStyles(theme);
  const chatLabel = hasChat ? "Chat" : "Start chat";

  return (
    <View style={styles.container}>
      <PrimaryButton
        title={chatLabel}
        onPress={onChat}
        disabled={busy}
        style={{ backgroundColor: primaryColor }}
        icon={<Ionicons name="chatbubble-outline" size={20} color={theme.colors.onPrimary} />}
      />

      <TouchableOpacity
        onPress={onRemove}
        disabled={busy}
        style={{ ...styles.removeBtn, ...(busy ? styles.disabled : null) }}
        activeOpacity={0.9}
      >
        <Ionicons name="person-remove-outline" size={20} color={theme.colors.error} />
        <Text style={styles.removeText}>{removeLabel(mode)}</Text>
      </TouchableOpacity>
    </View>
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
    container: {
      gap: theme.spacing.md,
      paddingTop: theme.spacing.lg,
      paddingBottom: theme.spacing.xxl,
    },
    removeBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: theme.spacing.sm,
      borderRadius: theme.radii.md,
      paddingVertical: theme.spacing.md,
      borderWidth: 1,
      borderColor: theme.colors.errorBorder,
      backgroundColor: theme.colors.surface,
    },
    removeText: {
      ...theme.type.button,
      fontFamily: theme.type.button.fontFamily,
      color: theme.colors.error,
    },
    disabled: { opacity: 0.6 },
  });
}
