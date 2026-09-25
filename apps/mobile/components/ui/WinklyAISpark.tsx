// apps/mobile/components/ui/WinklyAISpark.tsx
// Winkly AI Spark: SVG sparkles in Winkly violet (or grey when locked). Same icon everywhere.

import React from "react";
import { TouchableOpacity, Alert, StyleSheet, ViewStyle, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import * as Haptics from "expo-haptics";
import { Colors } from "@/constants/tokens";
import { useModeContext } from "@/providers/ModeContextProvider";
import { canUseAIFeature, type AIFeature } from "@/lib/ai/aiFeatureGate";

/** SVG sparkles icon in Winkly violet (or any color). Export for use anywhere in the app. */
export function SparklesIcon({ size, color }: { size: number; color: string }) {
  const s = size;
  return (
    <Svg width={s} height={s} viewBox="0 0 24 24" fill="none">
      {/* Main 4-point star (center) */}
      <Path
        d="M12 2l2.5 7.5L22 12l-7.5 2.5L12 22l-2.5-7.5L2 12l7.5-2.5L12 2z"
        fill={color}
      />
      {/* Small spark top-right */}
      <Path
        d="M19 4l.8 2.4L23 7.2l-2.4.8L19 10.4l-.8-2.4L15.8 7.2l2.4-.8L19 4z"
        fill={color}
        opacity={0.9}
      />
      {/* Small spark bottom-left */}
      <Path
        d="M5 14l.8 2.4L8.2 17l-2.4.8L5 20.4l-.8-2.4L1.8 17l2.4-.8L5 14z"
        fill={color}
        opacity={0.8}
      />
    </Svg>
  );
}

/** Upsell copy per feature: i18n keys paywall.aiFeature.<feature>.title / .message */
const FREE_DAILY_AI_PLANS = 3;

export type WinklyAISparkProps = {
  /** Which AI feature this Spark unlocks. Determines access and upsell copy. */
  feature: AIFeature;
  /** Called when user taps and has access. Use to open AI flow (e.g. suggest, concierge). */
  onPress?: () => void;
  /** Icon size in px. Use HEADER.iconSize for top headers. */
  size?: number;
  /** Optional container style. */
  style?: ViewStyle;
  /** Accessibility label. */
  accessibilityLabel?: string;
};

/**
 * Renders the Winkly AI Spark (sparkles icon in Winkly violet when active, grey when locked).
 * Same icon everywhere for a premium, consistent UI.
 */
export function WinklyAISpark({
  feature,
  onPress,
  size = 24,
  style,
  accessibilityLabel,
}: WinklyAISparkProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const { context } = useModeContext();
  const tier = context.subscription_tier;
  const hasAccess = canUseAIFeature(tier, feature);

  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (hasAccess) {
      onPress?.();
    } else {
      Alert.alert(
        t(`paywall.aiFeature.${feature}.title`),
        t(`paywall.aiFeature.${feature}.message`, { count: FREE_DAILY_AI_PLANS }),
        [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("paywall.limit.seePlans"),
          onPress: () => router.push("/account/subscription"),
        },
        ],
      );
    }
  };

  const iconColor = hasAccess ? Colors.primaryViolet : Colors.gray400;

  return (
    <TouchableOpacity
      onPress={handlePress}
      activeOpacity={0.8}
      style={[styles.touchTarget, { minWidth: size + 16, minHeight: size + 16 }, style]}
      accessibilityLabel={accessibilityLabel ?? (hasAccess ? t("paywall.aiFeature.useA11y") : t("paywall.aiFeature.lockedA11y"))}
      accessibilityRole="button"
    >
      <View style={styles.iconWrap}>
        <SparklesIcon size={size} color={iconColor} />
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  touchTarget: {
    alignItems: "center",
    justifyContent: "center",
  },
  iconWrap: {
    alignItems: "center",
    justifyContent: "center",
  },
});
