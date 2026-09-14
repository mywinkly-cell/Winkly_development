/**
 * TopPicksSection — the default landing state for a discover surface: ≤3 ranked,
 * reasoned picks instead of a long scroll list. Each pick shows a photo, a title,
 * an optional sub-line, and the canonical <FitReasonLine /> "why this fits you".
 *
 * The component is presentational: callers supply already-ranked picks (people
 * from the local compatibility pool, events from the concierge) and a fit reason
 * per pick. It renders a "See all" affordance so the full list stays one tap away.
 */

import React from "react";
import { View, Text, Image, TouchableOpacity, ActivityIndicator, StyleSheet } from "react-native";
import { FitReasonLine } from "@/components/ai/FitReasonLine";
import { useAppTheme, type AppTheme } from "@/constants/design-system";

export type TopPickCard = {
  id: string;
  title: string;
  /** Secondary line: age, or date · city for events. */
  subtitle?: string | null;
  photoUrl?: string | null;
  fitReason: string;
  /** Optional corner badge text (e.g. a price or "💖"). */
  badge?: string | null;
};

type Props = {
  picks: TopPickCard[];
  loading: boolean;
  primaryColor: string;
  heading?: string;
  subheading?: string;
  /** Shown when not loading and there are no picks. */
  emptyText?: string;
  /** Emoji used when a pick has no photo. */
  placeholderEmoji?: string;
  onPressPick: (id: string) => void;
  onSeeAll: () => void;
  seeAllLabel?: string;
};

export function TopPicksSection({
  picks,
  loading,
  primaryColor,
  heading = "Top 3 for you",
  subheading = "Hand-picked so you don't have to scroll.",
  emptyText = "No picks right now — tap See all to browse everything.",
  placeholderEmoji = "✨",
  onPressPick,
  onSeeAll,
  seeAllLabel = "See all",
}: Props) {
  const theme = useAppTheme();
  const styles = createStyles(theme);

  return (
    <View style={styles.wrap}>
      <Text style={{ ...styles.heading, color: primaryColor }}>{heading}</Text>
      <Text style={styles.subheading}>{subheading}</Text>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={primaryColor} />
        </View>
      ) : picks.length === 0 ? (
        <Text style={styles.emptyText}>{emptyText}</Text>
      ) : (
        <View style={styles.list}>
          {picks.map((p) => (
            <TouchableOpacity
              key={p.id}
              activeOpacity={0.9}
              onPress={() => onPressPick(p.id)}
              style={styles.card}
              accessibilityRole="button"
              accessibilityLabel={`${p.title}. Why this fits you: ${p.fitReason}`}
            >
              <View style={styles.photoWrap}>
                {p.photoUrl ? (
                  <Image source={{ uri: p.photoUrl }} style={styles.photo} />
                ) : (
                  <View style={[styles.photo, styles.placeholder]}>
                    <Text style={styles.placeholderEmoji}>{placeholderEmoji}</Text>
                  </View>
                )}
                {p.badge ? (
                  <View style={styles.badge} pointerEvents="none">
                    <Text style={styles.badgeText}>{p.badge}</Text>
                  </View>
                ) : null}
              </View>

              <View style={styles.body}>
                <Text style={styles.cardTitle} numberOfLines={1}>
                  {p.title}
                </Text>
                {p.subtitle ? (
                  <Text style={styles.cardSubtitle} numberOfLines={1}>
                    {p.subtitle}
                  </Text>
                ) : null}
                <FitReasonLine reason={p.fitReason} accentColor={primaryColor} style={styles.reason} />
              </View>
            </TouchableOpacity>
          ))}
        </View>
      )}

      <TouchableOpacity
        onPress={onSeeAll}
        activeOpacity={0.85}
        style={{ ...styles.seeAll, borderColor: primaryColor }}
        accessibilityRole="button"
        accessibilityLabel={seeAllLabel}
      >
        <Text style={{ ...styles.seeAllText, color: primaryColor }}>{seeAllLabel}</Text>
      </TouchableOpacity>
    </View>
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
    wrap: { paddingHorizontal: theme.spacing.xl },
    heading: { ...theme.type.h3, fontFamily: theme.type.h3.fontFamily, fontWeight: "800", marginBottom: theme.spacing.xxs },
    subheading: { ...theme.type.caption, fontFamily: theme.type.caption.fontFamily, color: theme.colors.textSecondary, marginBottom: theme.spacing.lg },
    center: { paddingVertical: theme.spacing.huge, alignItems: "center", justifyContent: "center" },
    emptyText: { ...theme.type.body, fontFamily: theme.type.body.fontFamily, color: theme.colors.textSecondary, paddingVertical: theme.spacing.md },
    list: { gap: theme.spacing.md },
    card: {
      flexDirection: "row",
      gap: theme.spacing.md,
      backgroundColor: theme.colors.surface,
      borderRadius: theme.radii.lg,
      borderWidth: 1,
      borderColor: theme.colors.border,
      padding: theme.spacing.md,
    },
    photoWrap: {
      width: 76,
      height: 76,
      borderRadius: theme.radii.md,
      overflow: "hidden",
      backgroundColor: theme.colors.border,
    },
    photo: { width: "100%", height: "100%" },
    placeholder: { alignItems: "center", justifyContent: "center" },
    placeholderEmoji: { fontSize: 30 },
    badge: {
      position: "absolute",
      top: 4,
      right: 4,
      backgroundColor: "rgba(0,0,0,0.55)",
      borderRadius: theme.radii.pill,
      paddingHorizontal: 7,
      paddingVertical: 2,
    },
    badgeText: { ...theme.type.caption, fontFamily: theme.type.caption.fontFamily, color: "#FFFFFF", fontWeight: "700", fontSize: 11 },
    body: { flex: 1, justifyContent: "center" },
    cardTitle: { ...theme.type.body, fontFamily: theme.type.body.fontFamily, fontWeight: "800", color: theme.colors.textPrimary },
    cardSubtitle: { ...theme.type.caption, fontFamily: theme.type.caption.fontFamily, color: theme.colors.textSecondary, marginTop: 1 },
    reason: { marginTop: theme.spacing.xs },
    seeAll: {
      marginTop: theme.spacing.lg,
      borderWidth: 1.5,
      borderRadius: theme.radii.md,
      paddingVertical: theme.spacing.md,
      alignItems: "center",
    },
    seeAllText: { ...theme.type.button, fontFamily: theme.type.button.fontFamily, fontWeight: "800" },
  });
}
