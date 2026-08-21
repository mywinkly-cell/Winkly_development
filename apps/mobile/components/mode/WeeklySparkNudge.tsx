/**
 * Weekly Spark nudge — an additive, tasteful banner shown on the mode-selection screen
 * ONLY when the user has an unseen weekly Spark (see lib/ai/weeklySpark.ts).
 *
 * It pulls the user toward the Planner ("we've picked something for you") without
 * overriding navigation: the mode grid stays primary. Visual language mirrors
 * WeeklySparkCard (white card, left accent, Sparkles badge) so the Spark reads
 * consistently across surfaces. A subtle pulsing halo signals "something new";
 * when there is nothing new the banner is simply not rendered.
 */

import React, { useEffect, useRef } from "react";
import { Animated, Easing, Pressable, StyleSheet, Text, View } from "react-native";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { SparklesIcon } from "@/components/ui/WinklyAISpark";
import { Colors, Typography } from "@/constants/tokens";
import { WEEKLY_SPARK_LABEL_KEY } from "@/lib/ai/weeklySpark";

export type WeeklySparkNudgeProps = {
  /** Tap handler — should route to the Planner Spark section. */
  onPress: () => void;
  /** Accent color for the badge/border. Defaults to Winkly violet. */
  accentColor?: string;
  /** Optional testID for the pressable. */
  testID?: string;
};

export function WeeklySparkNudge({
  onPress,
  accentColor = Colors.primaryViolet,
  testID,
}: WeeklySparkNudgeProps) {
  const { t } = useTranslation();
  const glow = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(glow, {
          toValue: 1,
          duration: 1100,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(glow, {
          toValue: 0,
          duration: 1100,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [glow]);

  const haloOpacity = glow.interpolate({ inputRange: [0, 1], outputRange: [0, 0.45] });
  const haloScale = glow.interpolate({ inputRange: [0, 1], outputRange: [1, 1.025] });

  const label = t(WEEKLY_SPARK_LABEL_KEY);
  const text = t("modeSelection.sparkNudge.text");
  const cta = t("modeSelection.sparkNudge.cta");

  return (
    <View style={styles.wrap}>
      {/* Pulsing accent halo behind the card — the "something new" highlight. */}
      <Animated.View
        pointerEvents="none"
        style={[
          styles.halo,
          { borderColor: accentColor, opacity: haloOpacity, transform: [{ scale: haloScale }] },
        ]}
      />
      <Pressable
        testID={testID}
        onPress={() => {
          Haptics.selectionAsync();
          onPress();
        }}
        accessibilityRole="button"
        accessibilityLabel={`${label}. ${text}`}
        style={[styles.card, { borderLeftColor: accentColor }]}
      >
        <View style={[styles.badge, { backgroundColor: accentColor + "18" }]}>
          <SparklesIcon size={16} color={accentColor} />
          <Text style={[styles.badgeText, { color: accentColor }]} numberOfLines={1}>
            {label}
          </Text>
        </View>
        <Text style={styles.text}>{text}</Text>
        <View style={styles.ctaRow}>
          <Text style={[styles.ctaText, { color: accentColor }]}>{cta}</Text>
          <Ionicons name="arrow-forward" size={16} color={accentColor} />
        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: 20,
    position: "relative",
  },
  halo: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 16,
    borderWidth: 2,
  },
  card: {
    backgroundColor: Colors.white,
    borderRadius: 16,
    padding: 16,
    borderLeftWidth: 4,
    borderLeftColor: Colors.primaryViolet,
    borderWidth: 1,
    borderColor: Colors.gray200,
    shadowColor: "#1C1C1E",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 3,
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 6,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 12,
    marginBottom: 10,
  },
  badgeText: {
    ...Typography.caption,
    fontWeight: "700",
  },
  text: {
    ...Typography.body,
    color: Colors.textPrimary,
    fontWeight: "600",
  },
  ctaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 10,
  },
  ctaText: {
    ...Typography.caption,
    fontWeight: "800",
  },
});
