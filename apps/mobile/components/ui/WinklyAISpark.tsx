// apps/mobile/components/ui/WinklyAISpark.tsx
// Winkly AI Spark: SVG sparkles in Winkly violet (or grey when locked). Same icon everywhere.

import React from "react";
import { TouchableOpacity, Alert, StyleSheet, ViewStyle, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { useRouter } from "expo-router";
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

const FEATURE_UPSELL_MESSAGES: Record<
  AIFeature,
  { title: string; message: string }
> = {
  smart_matching:
    {
      title: "Smart AI matching",
      message:
        "Winkly AI analyses profiles and surfaces better matches for you. Upgrade to Super or Premium to use it.",
    },
  event_suggestions:
    {
      title: "AI event suggestions",
      message:
        "Get event suggestions that fit your interests and location. Upgrade to Super or Premium.",
    },
  planning_ideas:
    {
      title: "AI planning ideas",
      message:
        "You've used your free AI plan. Upgrade to Super or Premium for unlimited planning ideas.",
    },
  chat_opener:
    {
      title: "AI chat opener",
      message:
        "Get a suggested first message to break the ice. Upgrade to Super or Premium.",
    },
  match_bridge:
    {
      title: "AI Match Bridge",
      message:
        "See the AI date idea Winkly created for you and your match — based on your shared interests. Upgrade to Premium to unlock it.",
    },
  concierge:
    {
      title: "Winkly AI concierge",
      message:
        "Get a full 5-star date plan with weather check, venues, and backup options. Upgrade to Premium for the complete experience.",
    },
};

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
  const router = useRouter();
  const { context } = useModeContext();
  const tier = context.subscription_tier;
  const hasAccess = canUseAIFeature(tier, feature);
  const upsell = FEATURE_UPSELL_MESSAGES[feature];

  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (hasAccess) {
      onPress?.();
    } else {
      Alert.alert(upsell.title, upsell.message, [
        { text: "Cancel", style: "cancel" },
        {
          text: "See plans",
          onPress: () => router.push("/account/subscription"),
        },
      ]);
    }
  };

  const iconColor = hasAccess ? Colors.primaryViolet : Colors.gray400;

  return (
    <TouchableOpacity
      onPress={handlePress}
      activeOpacity={0.8}
      style={[styles.touchTarget, { minWidth: size + 16, minHeight: size + 16 }, style]}
      accessibilityLabel={accessibilityLabel ?? (hasAccess ? "Use Winkly AI" : "Winkly AI — upgrade to use")}
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
