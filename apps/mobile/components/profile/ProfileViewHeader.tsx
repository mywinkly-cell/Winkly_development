import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Colors, Typography, Layout, FontFamily, HEADER, Shadow } from "@/constants/tokens";
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

export function ProfileViewHeader({
  onBack,
  rightSlot = "planner",
  mode = "romance",
  onMenuPress,
  onPlannerPress,
}: Props) {
  const inviteLabel = PROFILE_INVITE_LABEL[mode];

  return (
    <View style={styles.container}>
      <TouchableOpacity onPress={onBack} style={styles.iconBtn} activeOpacity={0.8} accessibilityLabel="Go back">
        <Ionicons name="arrow-back" size={HEADER.iconSize} color={Colors.textPrimary} />
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
          <Ionicons name="calendar-outline" size={HEADER.iconSize} color={Colors.primaryViolet} />
        </TouchableOpacity>
      ) : rightSlot === "menu" ? (
        <TouchableOpacity
          onPress={onMenuPress}
          style={styles.iconBtn}
          activeOpacity={0.8}
          accessibilityLabel="More options"
        >
          <Ionicons name="ellipsis-vertical" size={HEADER.iconSize} color={Colors.textPrimary} />
        </TouchableOpacity>
      ) : (
        <View style={styles.placeholder} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Layout.screenPadding,
    ...Layout.topHeaderBar,
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray200,
    ...Shadow.card,
  },
  iconBtn: {
    width: HEADER.buttonSize,
    height: HEADER.buttonSize,
    borderRadius: HEADER.buttonRadius,
    backgroundColor: Colors.gray100,
    alignItems: "center",
    justifyContent: "center",
  },
  placeholder: {
    width: HEADER.buttonSize,
    height: HEADER.buttonSize,
  },
  centerTitleWrap: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  centerTitle: {
    ...Typography.headerWinklyTitle,
    fontFamily: FontFamily.headingBold,
    color: Colors.primaryViolet,
    textAlign: "center",
  },
});
