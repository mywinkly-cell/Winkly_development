import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAppTheme, type AppTheme } from "@/constants/design-system";
import { PROFILE_INVITE_LABEL } from "@/lib/profile/profilePlanInvite";
import type { Mode } from "@/types";

type RightSlot = "planner" | "menu" | "none";

type Props = {
  onBack: () => void;
  rightSlot?: RightSlot;
  mode?: Mode;
  onMenuPress?: () => void;
  onPlannerPress?: () => void;
};

const ICON_SIZE = 24;
const BUTTON_SIZE = 44;

export function ProfileViewHeader({
  onBack,
  rightSlot = "planner",
  mode = "romance",
  onMenuPress,
  onPlannerPress,
}: Props) {
  const theme = useAppTheme();
  const styles = createStyles(theme);
  const inviteLabel = PROFILE_INVITE_LABEL[mode];

  return (
    <View style={styles.container}>
      <TouchableOpacity onPress={onBack} style={styles.iconBtn} activeOpacity={0.8} accessibilityLabel="Go back">
        <Ionicons name="arrow-back" size={ICON_SIZE} color={theme.colors.textPrimary} />
      </TouchableOpacity>

      <View style={styles.centerTitleWrap}>
        <Text style={styles.centerTitle}>Winkly</Text>
      </View>

      {rightSlot === "planner" ? (
        <TouchableOpacity
          onPress={onPlannerPress}
          style={styles.iconBtn}
          activeOpacity={0.8}
          accessibilityLabel={inviteLabel}
        >
          <Ionicons name="calendar-outline" size={ICON_SIZE} color={theme.colors.primary} />
        </TouchableOpacity>
      ) : rightSlot === "menu" ? (
        <TouchableOpacity
          onPress={onMenuPress}
          style={styles.iconBtn}
          activeOpacity={0.8}
          accessibilityLabel="More options"
        >
          <Ionicons name="ellipsis-vertical" size={ICON_SIZE} color={theme.colors.textPrimary} />
        </TouchableOpacity>
      ) : (
        <View style={styles.placeholder} />
      )}
    </View>
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
    container: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: theme.spacing.xl,
      paddingTop: theme.spacing.sm,
      paddingBottom: theme.spacing.md,
      minHeight: 56,
      backgroundColor: theme.colors.surface,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border,
      ...theme.elevation(1),
    },
    iconBtn: {
      width: BUTTON_SIZE,
      height: BUTTON_SIZE,
      borderRadius: theme.radii.pill,
      backgroundColor: theme.colors.backgroundMuted,
      alignItems: "center",
      justifyContent: "center",
    },
    placeholder: {
      width: BUTTON_SIZE,
      height: BUTTON_SIZE,
    },
    centerTitleWrap: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
    },
    centerTitle: {
      ...theme.type.h2,
      fontFamily: theme.type.h2.fontFamily,
      color: theme.colors.primary,
      textAlign: "center",
    },
  });
}
