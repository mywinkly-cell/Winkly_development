// PlannerHeader — Used on every Planner screen only
// Left: Filter | Center: Winkly | Right: Settings (no profile)

import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { Colors, Layout, Shadow, Typography, FontFamily } from "@/constants/tokens";

type PlannerHeaderProps = {
  /** Open filter modal (e.g. standalone planner); if not set, navigates to /planner */
  onFilterPress?: () => void;
  /** Navigate to planner settings; if not set, navigates to /planner/settings */
  onSettingsPress?: () => void;
};

export function PlannerHeader({ onFilterPress, onSettingsPress }: PlannerHeaderProps) {
  const router = useRouter();

  const handleFilterPress = () => {
    Haptics.selectionAsync();
    if (onFilterPress) {
      onFilterPress();
    } else {
      router.push("/planner");
    }
  };

  const handleSettingsPress = () => {
    Haptics.selectionAsync();
    if (onSettingsPress) {
      onSettingsPress();
    } else {
      router.push("/planner/settings");
    }
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity
        onPress={handleFilterPress}
        style={styles.iconBtn}
        activeOpacity={0.8}
        accessibilityLabel="Planner filters"
      >
        <Ionicons name="filter" size={22} color={Colors.textPrimary} />
      </TouchableOpacity>
      <View style={styles.centerTitleWrap}>
        <Text style={styles.centerTitle}>Winkly</Text>
      </View>
      <TouchableOpacity
        onPress={handleSettingsPress}
        style={styles.iconBtn}
        activeOpacity={0.8}
        accessibilityLabel="Planner settings"
      >
        <Ionicons name="settings" size={24} color={Colors.textPrimary} />
      </TouchableOpacity>
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
  iconBtn: {
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
});
