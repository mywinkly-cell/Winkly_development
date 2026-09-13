// ────────────────────────────────────────────────
// CardPlanHint — per-person Winkly AI planning nudge, anchored to the profile
// card currently in view. Always names the person on the card and never asks
// the user to re-pick who or what mode — tapping jumps straight into the
// concierge for that person in the current mode.
// ────────────────────────────────────────────────

import React from "react";
import { View, Text, Pressable, StyleSheet, type ViewStyle, type StyleProp } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Colors, Typography } from "@/constants/tokens";
import { SparklesIcon } from "@/components/ui/WinklyAISpark";

export type CardPlanHintMode = "friends" | "romance" | "business";

/** First token of a display name, e.g. "Alex Müller" → "Alex". Falls back for empty names. */
export function firstNameFrom(name?: string | null): string {
  const trimmed = (name ?? "").trim();
  if (!trimmed) return "them";
  return trimmed.split(/\s+/)[0];
}

const HINT_LABEL: Record<CardPlanHintMode, (firstName: string) => string> = {
  friends: (firstName) => `Plan a coffee with ${firstName}?`,
  romance: (firstName) => `Plan a date with ${firstName}?`,
  business: (firstName) => `Plan a meeting with ${firstName}?`,
};

function accentFor(mode: CardPlanHintMode): string {
  if (mode === "romance") return Colors.romance.primary;
  if (mode === "business") return Colors.business.primary;
  return Colors.friends.primary;
}

export type CardPlanHintProps = {
  mode: CardPlanHintMode;
  /** Full display name of the person on the card currently in view. */
  personName: string;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
};

/** A pill anchored directly above the card, with a small connector pointing down into it. */
export function CardPlanHint({ mode, personName, onPress, style }: CardPlanHintProps) {
  const accent = accentFor(mode);
  const label = HINT_LABEL[mode](firstNameFrom(personName));

  return (
    <View style={[styles.wrap, style]} pointerEvents="box-none">
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [styles.chip, { borderColor: accent }, pressed && styles.chipPressed]}
        accessibilityRole="button"
        accessibilityLabel={label}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <SparklesIcon size={14} color={accent} />
        <Text style={[styles.chipText, { color: accent }]} numberOfLines={1}>
          {label}
        </Text>
        <Ionicons name="chevron-forward" size={14} color={accent} />
      </Pressable>
      <View style={[styles.connector, { borderTopColor: accent }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: "center",
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    maxWidth: "94%",
    backgroundColor: Colors.white,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    borderWidth: 1.5,
    shadowColor: "#1C1C1E",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  chipPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
  },
  chipText: {
    ...Typography.caption,
    fontWeight: "700",
    flexShrink: 1,
  },
  connector: {
    width: 0,
    height: 0,
    borderLeftWidth: 7,
    borderRightWidth: 7,
    borderTopWidth: 8,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    marginTop: -1,
  },
});
