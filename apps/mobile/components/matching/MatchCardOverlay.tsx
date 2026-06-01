// ────────────────────────────────────────────────
// MatchCardOverlay — Shared match card info (Romance & Friends)
// Same layout: name (+ age), city, occupation, tags; optional AI hint for paid users.
// Mode-specific coloring only.
// ────────────────────────────────────────────────

import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { Colors, Typography, FontFamily } from "@/constants/tokens";
import { normalizeLocationDisplayString } from "@/lib/location/countryDisplay";
import { SparklesIcon } from "@/components/ui/WinklyAISpark";

const CARD_RADIUS = 24;

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
  mode: MatchCardMode;
  /** Shown only for paid subscribers: compatibility score + short tags */
  aiHint?: { score: number; tags: string[] } | null;
  /** Rounded, privacy-safe distance label (e.g. "~3 km away"). */
  distanceLabel?: string | null;
  /** Border radius of the card (default 24) */
  cardRadius?: number;
};

const modePrimary = (mode: MatchCardMode) =>
  mode === "romance" ? Colors.romance.primary : Colors.friends.primary;

export function MatchCardOverlay({
  name,
  age,
  city,
  occupation,
  chipItems,
  mode,
  aiHint,
  distanceLabel,
  cardRadius = CARD_RADIUS,
}: MatchCardOverlayProps) {
  const { i18n } = useTranslation();
  const accent = modePrimary(mode);
  const nameAgeLine = age != null && age > 0 ? `${name}, ${age}` : name;
  const cityLine = city?.trim()
    ? normalizeLocationDisplayString(city, i18n?.language ?? "en")
    : "";

  return (
    <View
      style={[
        styles.infoOverlay,
        {
          borderBottomLeftRadius: cardRadius,
          borderBottomRightRadius: cardRadius,
        },
      ]}
    >
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
          {chipItems.slice(0, 3).map((i) => (
            <View key={i} style={[styles.chipOverlay, { borderColor: "rgba(255,255,255,0.35)" }]}>
              <Text style={styles.chipTextOverlay}>{i}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  infoOverlay: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 18,
    paddingTop: 32,
    paddingBottom: 18,
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  nameAge: {
    ...Typography.h2,
    fontSize: 24,
    fontFamily: FontFamily.heading,
    color: Colors.white,
    marginBottom: 4,
    textShadowColor: "rgba(0,0,0,0.3)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  cityOverlay: {
    ...Typography.body,
    fontSize: 15,
    color: "rgba(255,255,255,0.92)",
    marginBottom: 2,
  },
  distanceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginBottom: 4,
  },
  distanceText: {
    ...Typography.caption,
    fontSize: 13,
    color: "rgba(255,255,255,0.92)",
  },
  occupationOverlay: {
    ...Typography.caption,
    color: "rgba(255,255,255,0.85)",
    marginBottom: 10,
  },
  aiHintRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 10,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: 1,
    alignSelf: "flex-start",
    maxWidth: "100%",
  },
  aiHintText: {
    ...Typography.caption,
    fontSize: 12,
    fontWeight: "700",
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    alignItems: "center",
  },
  chipOverlay: {
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.22)",
    borderWidth: 1,
  },
  chipTextOverlay: {
    ...Typography.caption,
    fontSize: 12,
    color: Colors.white,
  },
});
