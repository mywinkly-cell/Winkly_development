// ────────────────────────────────────────────────
// MatchCardOverlay — Shared match card info (Romance & Friends)
// Same layout: name (+ age), city, occupation, tags; optional AI hint for paid users.
// Mode-specific coloring only.
// ────────────────────────────────────────────────

import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useAppTheme, type AppTheme } from "@/constants/design-system";
import { normalizeLocationDisplayString } from "@/lib/location/countryDisplay";
import { SparklesIcon } from "@/components/ui/WinklyAISpark";

export type MatchCardMode = "romance" | "friends";

export type MatchCardOverlayProps = {
  /** Display name (e.g. first name or display_name) */
  name: string;
  /** Age in years; optional (Friends may omit) */
  age?: number | null;
  /** City or location */
  city: string;
  /** Job / occupation */
  occupation?: string | null;
  /** Up to 3 tags (interests, vibe, goals) */
  chipItems: string[];
  /** Subset of chipItems that are shared with the viewer — highlighted as "in common". */
  highlightItems?: string[];
  mode: MatchCardMode;
  /** Shown only for paid subscribers: compatibility score + short tags */
  aiHint?: { score: number; tags: string[] } | null;
  /** Rounded, privacy-safe distance label (e.g. "~3 km away"). */
  distanceLabel?: string | null;
  /** Someone sent you a chat invite (pre-match). */
  hasIncomingMessage?: boolean;
  /** Border radius of the card (default 24) */
  cardRadius?: number;
};

export function MatchCardOverlay({
  name,
  age,
  city,
  occupation,
  chipItems,
  highlightItems = [],
  mode,
  aiHint,
  distanceLabel,
  hasIncomingMessage = false,
  cardRadius,
}: MatchCardOverlayProps) {
  const { i18n } = useTranslation();
  const theme = useAppTheme();
  const styles = createStyles(theme);
  const accent = theme.modeAccent(mode).primary;
  const resolvedRadius = cardRadius ?? theme.radii.lg;
  const highlightSet = new Set(highlightItems.map((h) => h.trim().toLowerCase()));
  const nameAgeLine = age != null && age > 0 ? `${name}, ${age}` : name;
  const cityLine = city?.trim()
    ? normalizeLocationDisplayString(city, i18n?.language ?? "en")
    : "";

  return (
    <View
      style={[
        styles.infoOverlay,
        {
          borderBottomLeftRadius: resolvedRadius,
          borderBottomRightRadius: resolvedRadius,
        },
      ]}
    >
      {hasIncomingMessage ? (
        <View style={styles.envelopeBadge}>
          <Ionicons name="mail" size={16} color="#fff" />
          <Text style={styles.envelopeBadgeText}>Message for you</Text>
        </View>
      ) : null}
      <Text style={styles.nameAge}>{nameAgeLine}</Text>
      <Text style={styles.cityOverlay}>{cityLine || "—"}</Text>
      {distanceLabel ? (
        <View style={styles.distanceRow}>
          <Ionicons name="location-outline" size={13} color="rgba(255,255,255,0.92)" />
          <Text style={styles.distanceText}>{distanceLabel}</Text>
        </View>
      ) : null}
      {occupation ? (
        <Text style={styles.occupationOverlay}>{occupation}</Text>
      ) : null}
      {aiHint && (aiHint.tags.length > 0 || aiHint.score > 0) ? (
        <View style={[styles.aiHintRow, { borderColor: accent + "66" }]}>
          <SparklesIcon size={14} color={accent} />
          <Text style={[styles.aiHintText, { color: accent }]} numberOfLines={1}>
            {aiHint.score > 0 ? `${aiHint.score}% match` : ""}
            {aiHint.score > 0 && aiHint.tags.length > 0 ? " · " : ""}
            {aiHint.tags.slice(0, 2).join(", ")}
          </Text>
        </View>
      ) : null}
      {chipItems.length > 0 ? (
        <View style={styles.chipRow}>
          {chipItems.slice(0, 3).map((i) => {
            const shared = highlightSet.has(i.trim().toLowerCase());
            return (
              <View
                key={i}
                style={[
                  styles.chipOverlay,
                  shared
                    ? { backgroundColor: accent, borderColor: accent }
                    : { borderColor: "rgba(255,255,255,0.35)" },
                ]}
              >
                {shared ? (
                  <Ionicons name="sparkles" size={11} color="#fff" style={{ marginRight: 4 }} />
                ) : null}
                <Text style={styles.chipTextOverlay}>{i}</Text>
              </View>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
    infoOverlay: {
      position: "absolute",
      left: 0,
      right: 0,
      bottom: 0,
      paddingHorizontal: theme.spacing.xl,
      paddingTop: theme.spacing.xxl,
      paddingBottom: theme.spacing.xl,
      backgroundColor: "rgba(0,0,0,0.45)",
    },
    envelopeBadge: {
      flexDirection: "row",
      alignItems: "center",
      alignSelf: "flex-start",
      gap: theme.spacing.xs,
      backgroundColor: theme.modeAccent("romance").primary,
      paddingHorizontal: theme.spacing.sm,
      paddingVertical: theme.spacing.xs,
      borderRadius: theme.radii.pill,
      marginBottom: theme.spacing.sm,
    },
    envelopeBadgeText: {
      color: "#fff",
      fontSize: 12,
      fontWeight: "700",
    },
    nameAge: {
      ...theme.type.h2,
      fontSize: 24,
      fontFamily: theme.type.h2.fontFamily,
      color: "#FFFFFF",
      marginBottom: theme.spacing.xxs,
      textShadowColor: "rgba(0,0,0,0.3)",
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 2,
    },
    cityOverlay: {
      ...theme.type.body,
      fontFamily: theme.type.body.fontFamily,
      fontSize: 15,
      color: "rgba(255,255,255,0.92)",
      marginBottom: 2,
    },
    distanceRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.xxs,
      marginBottom: theme.spacing.xxs,
    },
    distanceText: {
      ...theme.type.caption,
      fontFamily: theme.type.caption.fontFamily,
      fontSize: 13,
      color: "rgba(255,255,255,0.92)",
    },
    occupationOverlay: {
      ...theme.type.caption,
      fontFamily: theme.type.caption.fontFamily,
      color: "rgba(255,255,255,0.85)",
      marginBottom: theme.spacing.sm,
    },
    aiHintRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.xs,
      marginBottom: theme.spacing.sm,
      paddingVertical: theme.spacing.xs,
      paddingHorizontal: theme.spacing.sm,
      borderRadius: theme.radii.sm,
      borderWidth: 1,
      alignSelf: "flex-start",
      maxWidth: "100%",
    },
    aiHintText: {
      ...theme.type.caption,
      fontFamily: theme.type.caption.fontFamily,
      fontSize: 12,
      fontWeight: "700",
    },
    chipRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: theme.spacing.sm,
      alignItems: "center",
    },
    chipOverlay: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: 5,
      paddingHorizontal: theme.spacing.md,
      borderRadius: theme.radii.sm,
      backgroundColor: "rgba(255,255,255,0.22)",
      borderWidth: 1,
    },
    chipTextOverlay: {
      ...theme.type.caption,
      fontFamily: theme.type.caption.fontFamily,
      fontSize: 12,
      color: "#FFFFFF",
    },
  });
}
