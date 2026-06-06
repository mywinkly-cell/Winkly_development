// PlannerHeader — Used on every Planner screen only
// Left: Filter | Center: Winkly | Right: Winkly AI Spark (concierge) only.
// Settings live only at Mode Selection (General settings) to avoid overwhelming users.

import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useRouter, usePathname } from "expo-router";
import { getModeHubFromPathname, plannerRoutes } from "@/lib/navigation/modeHub";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { Colors, Layout, Shadow, Typography, FontFamily, HEADER } from "@/constants/tokens";
import { WinklyAISpark } from "@/components/ui/WinklyAISpark";

type PlannerHeaderProps = {
  /** Open filter modal (e.g. standalone planner); if not set, navigates to /planner */
  onFilterPress?: () => void;
  /** When user taps Spark and has concierge access, open the "Ask AI" flow (e.g. modal). Only used on hub. */
  onAIPress?: () => void;
};

export function PlannerHeader({ onFilterPress, onAIPress }: PlannerHeaderProps) {
  const router = useRouter();
  const plannerHub = getModeHubFromPathname(usePathname() ?? "");

  const handleFilterPress = () => {
    Haptics.selectionAsync();
    if (onFilterPress) {
      onFilterPress();
    } else {
      router.push(plannerRoutes.index(plannerHub));
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
        <Ionicons name="filter" size={HEADER.iconSize} color={Colors.primaryViolet} />
      </TouchableOpacity>
      <View style={styles.centerTitleWrap}>
        <Text style={styles.centerTitle}>Winkly</Text>
      </View>
      <View style={styles.rightRow}>
        {onAIPress != null ? (
          <View style={styles.aiButton3D}>
            <WinklyAISpark
              feature="concierge"
              onPress={onAIPress}
              size={HEADER.iconSize}
              style={styles.sparkBtn}
              accessibilityLabel="Winkly AI Agent"
            />
          </View>
        ) : (
          <View style={styles.placeholder} />
        )}
      </View>
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
  rightRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  aiButton3D: {
    width: HEADER.buttonSize,
    height: HEADER.buttonSize,
    borderRadius: HEADER.buttonSize / 2,
    backgroundColor: Colors.gray100,
    shadowColor: "#1C1C1E",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  sparkBtn: {
    width: HEADER.buttonSize,
    height: HEADER.buttonSize,
    marginRight: 0,
  },
  iconBtn: {
    width: HEADER.buttonSize,
    height: HEADER.buttonSize,
    borderRadius: HEADER.buttonRadius,
    backgroundColor: Colors.gray100,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#1C1C1E",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
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
});
