/**
 * Step 1 — Intent: sectioned cards (All = neutral groups; mode = boosted + tail).
 */

import React, { useMemo } from "react";
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from "react-native";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { Colors, Typography, Layout } from "@/constants/tokens";
import type { Mode } from "@/types";
import type { IntentSection, RankedCard } from "@/lib/ai/conciergePlanningFlow";

export type IntentContinuePayload = {
  key: string;
  label: string;
  /** The section/group title the card was selected from (used for UI context). */
  sectionLabel: string;
  /** Planning mode for the rest of the flow (generic catalogue picks parent section). */
  flowMode: Mode;
};

export type ConciergeIntentStepProps = {
  mode: Mode;
  sections: IntentSection[];
  onContinue: (payload: IntentContinuePayload) => void;
};

export function ConciergeIntentStep({
  mode,
  sections,
  onContinue,
}: ConciergeIntentStepProps) {
  const derived = useMemo(() => sections ?? [], [sections]);

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.title}>What would you like to plan?</Text>

      {derived.map((section) => (
        <View
          key={section.key}
          style={[
            styles.section,
            section.labelStyle === "romance"
              ? { borderLeftColor: Colors.romance.primary }
              : section.labelStyle === "friends"
                ? { borderLeftColor: Colors.friends.primary }
                : section.labelStyle === "business"
                  ? { borderLeftColor: Colors.business.primary }
                  : section.labelStyle === "boosted"
                    ? { borderLeftColor: Colors.primaryViolet }
                    : { borderLeftColor: Colors.gray300 },
          ]}
        >
          <Text
            style={[
              styles.sectionTitle,
              section.labelStyle === "muted" ? { color: Colors.gray600 } : undefined,
              section.labelStyle === "boosted" ? { color: Colors.primaryViolet } : undefined,
              section.labelStyle === "romance" ? { color: Colors.romance.primary } : undefined,
              section.labelStyle === "friends" ? { color: Colors.friends.primary } : undefined,
              section.labelStyle === "business" ? { color: Colors.business.primary } : undefined,
            ]}
          >
            {section.label}
          </Text>
          <View style={styles.grid}>
            {section.cards.map((card) => (
              <CardButton
                key={`${section.key}-${card.key}`}
                card={card}
                onPress={() => {
                  Haptics.selectionAsync();
                  onContinue({
                    key: card.key,
                    label: card.label,
                    sectionLabel: section.label,
                    flowMode: mode,
                  });
                }}
              />
            ))}
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

function CardButton({
  card,
  onPress,
}: {
  card: RankedCard;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.button]}
      onPress={onPress}
      activeOpacity={0.85}
      accessibilityLabel={card.label}
    >
      <View style={styles.iconWrap}>
        <Ionicons name={card.icon as never} size={28} color={Colors.primaryViolet} />
      </View>
      <Text style={styles.buttonLabel} numberOfLines={2}>
        {card.label}
      </Text>
      {card.boosted && card.boostReason ? (
        <Text style={styles.boostHint} numberOfLines={2}>
          {card.boostReason}
        </Text>
      ) : null}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: {
    paddingHorizontal: Layout.spacing.xl,
    paddingBottom: Layout.spacing.xxl,
  },
  title: {
    ...Typography.h3,
    fontFamily: "Poppins_600SemiBold",
    color: Colors.textPrimary,
    marginBottom: 8,
  },
  section: {
    marginBottom: 20,
    paddingLeft: 12,
    borderLeftWidth: 4,
    borderLeftColor: Colors.gray300,
  },
  sectionTitle: {
    ...Typography.caption,
    fontWeight: "700",
    color: Colors.gray600,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 10,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginBottom: 4,
  },
  button: {
    width: "47%",
    minWidth: 140,
    backgroundColor: Colors.white,
    borderRadius: 20,
    paddingVertical: 20,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: Colors.gray200,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#1C1C1E",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 3,
  },
  iconWrap: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: Colors.gray100,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  buttonLabel: {
    ...Typography.caption,
    fontWeight: "600",
    color: Colors.textPrimary,
    textAlign: "center",
  },
  boostHint: {
    ...Typography.caption,
    fontSize: 11,
    color: Colors.primaryViolet,
    textAlign: "center",
    marginTop: 6,
    fontWeight: "500",
  },
});
