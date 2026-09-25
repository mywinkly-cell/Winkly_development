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
import { useTranslation } from "react-i18next";
import { SparklesIcon } from "@/components/ui/WinklyAISpark";
import { useAppTheme } from "@/constants/design-system";
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
  accentColor,
  numberOfLines = 2,
  style,
}: FitReasonLineProps) {
  const { t } = useTranslation();
  const theme = useAppTheme();
  const raw = reason && reason.trim() ? reason.trim() : FIT_REASON_FALLBACK;
  const text = raw === FIT_REASON_FALLBACK ? t("concierge.fitReasonFallback") : raw;
  return (
    <View
      style={[styles.row, { gap: theme.spacing.xs }, style]}
      accessibilityLabel={t("concierge.fitReasonA11y", { reason: text })}
    >
      <View style={styles.iconWrap}>
        <SparklesIcon size={13} color={accentColor ?? theme.colors.primary} />
      </View>
      <Text
        style={[theme.type.caption, { flex: 1, color: theme.colors.textSecondary, lineHeight: 17, fontWeight: "500" }]}
        numberOfLines={numberOfLines}
      >
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  iconWrap: {
    // Nudge the icon down so it baselines with the first text line.
    paddingTop: 2,
  },
});
