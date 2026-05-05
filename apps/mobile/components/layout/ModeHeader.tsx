// ModeHeader — Shared header for mode screens (Discover, Chats, etc.)
// Placeholder (left) | Winkly (center) | Right slot (filters or filter only).
// No profile or settings — profile and settings only at Mode Selection.

import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { Colors, Layout, Shadow, Typography, FontFamily, HEADER } from "@/constants/tokens";

type RightSlot = "settings" | "filterSettings" | "filters";
type LeftSlot = "filters";
type ModeKey = "romance" | "friends" | "business" | "events";
export type HeaderVariant = "default" | "planner";

type ModeHeaderProps = {
  currentMode: ModeKey;
  leftSlot?: LeftSlot;
  rightSlot?: RightSlot;
  variant?: HeaderVariant;
  onFilterPress?: () => void;
  onSettingsPress?: () => void;
};

export function ModeHeader({
  currentMode,
  leftSlot,
  rightSlot = "settings",
  variant = "default",
  onFilterPress,
}: ModeHeaderProps) {
  const router = useRouter();
  const isPlannerHeader = variant === "planner";

  const onFilterPressDefault = () => {
    Haptics.selectionAsync();
    router.push("/planner");
  };

  const handleFilterPress = () => {
    Haptics.selectionAsync();
    if ((rightSlot === "filterSettings" || isPlannerHeader) && onFilterPress) {
      onFilterPress();
    } else {
      onFilterPressDefault();
    }
  };

  const handleFiltersOnlyPress = () => {
    Haptics.selectionAsync();
    if (onFilterPress) {
      onFilterPress();
    }
  };

  // Planner variant: Filter (left) | Winkly (center) | placeholder (no settings)
  if (isPlannerHeader) {
    return (
      <View style={styles.container}>
        <TouchableOpacity
          onPress={handleFilterPress}
          style={styles.rightBtn}
          activeOpacity={0.8}
          accessibilityLabel="Planner filters"
        >
          <Ionicons name="filter" size={HEADER.iconSize} color={Colors.textPrimary} />
        </TouchableOpacity>
        <View style={styles.centerTitleWrap}>
          <Text style={styles.centerTitle}>Winkly</Text>
        </View>
        <View style={styles.placeholder} />
      </View>
    );
  }

  const filterIconColor =
    currentMode === "romance"
      ? Colors.romance.primary
      : currentMode === "friends"
        ? Colors.friends.primary
        : currentMode === "business"
          ? Colors.business.primary
          : Colors.textPrimary;

  const filterButton = (
    <TouchableOpacity
      onPress={handleFiltersOnlyPress}
      style={styles.rightBtn}
      accessibilityLabel="Filtering"
    >
      <Ionicons name="options-outline" size={HEADER.iconSize} color={filterIconColor} />
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      {leftSlot === "filters" && onFilterPress ? filterButton : <View style={styles.placeholder} />}

      <View style={styles.centerTitleWrap}>
        <Text style={styles.centerTitle}>Winkly</Text>
      </View>

      {leftSlot === "filters" ? (
        <View style={styles.placeholder} />
      ) : rightSlot === "filterSettings" ? (
        <TouchableOpacity
          onPress={handleFilterPress}
          style={styles.rightBtn}
          accessibilityLabel="Planner filters"
        >
          <Ionicons name="filter" size={HEADER.iconSize} color={Colors.textPrimary} />
        </TouchableOpacity>
      ) : rightSlot === "filters" ? (
        filterButton
      ) : (
        <View style={styles.placeholder} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    ...Layout.topHeaderBar,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray200,
    ...Shadow.card,
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
    color: Colors.primaryViolet,
    fontFamily: FontFamily.headingBold,
    textAlign: "center",
  },
  rightBtn: {
    width: HEADER.buttonSize,
    height: HEADER.buttonSize,
    borderRadius: HEADER.buttonSize / 2,
    backgroundColor: Colors.gray100,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#1C1C1E",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
  },
});
