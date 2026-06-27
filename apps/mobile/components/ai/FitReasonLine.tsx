/**
 * FitReasonLine — the single "Why this fits you" subtitle used on EVERY plan/option
 * card (Concierge, Proactive, Group consensus, Romance proposal).
 *
 * The line that separates "a listing" from "someone planned this for me" is the reason.
 * This component is that reason: a prominent, human sentence that cites the user's own
 * signals (a shared interest, their neighbourhood, budget band, a language in common,
 * an open-hours match). One component, one style — never re-implement this per screen.
 *
 * Resolve a reason with `resolveFitReason(option)`, which reads `fit_reason` first and
 * falls back through the legacy fields so older payloads keep working.
 */

import React from "react";
import { View, Text, StyleSheet, type StyleProp, type ViewStyle } from "react-native";
import { SparklesIcon } from "@/components/ui/WinklyAISpark";
import { Colors, Typography } from "@/constants/tokens";
import { resolveFitReason, FIT_REASON_FALLBACK } from "@/lib/ai/fitReason";

// Re-exported so existing imports of these from this component keep working, while
// the pure logic lives in a RN-free module that plain helpers can import too.
export { resolveFitReason, FIT_REASON_FALLBACK };

export type FitReasonLineProps = {
  /** The resolved reason. When empty/absent, the graceful fallback is shown instead. */
  reason?: string | null;
  /** Accent for the spark icon (e.g. mode color). Defaults to Winkly violet. */
  accentColor?: string;
  /** Max lines before truncation. Defaults to 2. */
  numberOfLines?: number;
  /** Extra container styling (e.g. margins to slot into a card). */
  style?: StyleProp<ViewStyle>;
};

/**
 * Renders the "Why this fits you" subtitle: a spark icon + one human sentence.
 * Always renders something (graceful fallback) so the card never loses its reason.
 */
export function FitReasonLine({
  reason,
  accentColor = Colors.primaryViolet,
  numberOfLines = 2,
  style,
}: FitReasonLineProps) {
  const text = reason && reason.trim() ? reason.trim() : FIT_REASON_FALLBACK;
  return (
    <View
      style={[styles.row, style]}
      accessibilityLabel={`Why this fits you: ${text}`}
    >
      <View style={styles.iconWrap}>
        <SparklesIcon size={13} color={accentColor} />
      </View>
      <Text style={styles.text} numberOfLines={numberOfLines}>
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
  },
  iconWrap: {
    // Nudge the icon down so it baselines with the first text line.
    paddingTop: 2,
  },
  text: {
    flex: 1,
    ...Typography.caption,
    color: Colors.gray700,
    lineHeight: 17,
    fontWeight: "500",
  },
});
