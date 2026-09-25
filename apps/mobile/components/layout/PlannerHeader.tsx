// PlannerHeader — Used on every Planner screen only
// Left: Filter | Center: Winkly | Right: Weekly Sparks (calendar spark, toggle) + Winkly AI (sparkles, opens concierge).
// The two right buttons use different icons on purpose: Sparks = ready-made weekly ideas, AI = plan on request.
// Settings live only at Mode Selection (General settings) to avoid overwhelming users.

import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useRouter, usePathname } from "expo-router";
import { useTranslation } from "react-i18next";
import { getModeHubFromPathname, plannerRoutes } from "@/lib/navigation/modeHub";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { Colors, Layout, Shadow, Typography, FontFamily, HEADER } from "@/constants/tokens";
import { WinklyAISpark } from "@/components/ui/WinklyAISpark";
import { WeeklySparksIcon } from "@/components/ui/WeeklySparksIcon";

type PlannerHeaderProps = {
  /** Open filter modal (e.g. standalone planner); if not set, navigates to /planner */
  onFilterPress?: () => void;
  /** Show / reopen Weekly Sparks (3 cards). */
  onWeeklySparkPress?: () => void;
  /** When Sparks section is visible — accents the header spark button. */
  weeklySparkActive?: boolean;
  /** When user taps AI Spark and has concierge access, open the "Ask AI" flow. */
  onAIPress?: () => void;
};

export function PlannerHeader({
  onFilterPress,
  onWeeklySparkPress,
  weeklySparkActive = false,
  onAIPress,
}: PlannerHeaderProps) {
  const { t } = useTranslation();
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
        accessibilityLabel={t("common.plannerFilters")}
      >
        <Ionicons name="filter" size={HEADER.iconSize} color={Colors.primaryViolet} />
      </TouchableOpacity>
      <View style={styles.centerTitleWrap}>
        <Text style={styles.centerTitle}>Winkly</Text>
      </View>
      <View style={styles.rightRow}>
        {onWeeklySparkPress != null ? (
          <TouchableOpacity
            onPress={() => {
              Haptics.selectionAsync();
              onWeeklySparkPress();
            }}
            style={[styles.iconBtn, weeklySparkActive && styles.iconBtnActive]}
            activeOpacity={0.8}
            accessibilityLabel={
              weeklySparkActive ? t("weeklySpark.hideA11y") : t("weeklySpark.showA11y")
            }
            accessibilityState={{ selected: weeklySparkActive }}
          >
            <WeeklySparksIcon
              size={HEADER.iconSize}
              color={weeklySparkActive ? Colors.white : Colors.primaryViolet}
            />
          </TouchableOpacity>
        ) : null}
        {onAIPress != null ? (
          <View style={styles.aiButton3D}>
            <WinklyAISpark
              feature="planning_ideas"
              onPress={onAIPress}
              size={HEADER.iconSize}
              style={styles.sparkBtn}
              accessibilityLabel={t("planner.askWinklyA11y")}
            />
          </View>
        ) : onWeeklySparkPress == null ? (
          <View style={styles.placeholder} />
        ) : null}
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
    minWidth: HEADER.buttonSize,
    justifyContent: "flex-end",
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
  iconBtnActive: {
    backgroundColor: Colors.primaryViolet,
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
