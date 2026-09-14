/**
 * Step 1 — Intent: sectioned cards (All = neutral groups; mode = boosted + tail).
 */

import React, { useMemo } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { GestureScrollView } from "@/components/ui/GestureScrollView";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { useAppTheme, type AppTheme } from "@/constants/design-system";
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

function accentForSection(theme: AppTheme, labelStyle: IntentSection["labelStyle"]): string {
  switch (labelStyle) {
    case "romance":
      return theme.modeAccent("romance").primary;
    case "friends":
      return theme.modeAccent("friends").primary;
    case "business":
      return theme.modeAccent("business").primary;
    case "boosted":
      return theme.colors.primary;
    case "muted":
      return theme.colors.textMuted;
    default:
      return theme.colors.border;
  }
}

export function ConciergeIntentStep({
  mode,
  sections,
  onContinue,
}: ConciergeIntentStepProps) {
  const theme = useAppTheme();
  const derived = useMemo(() => sections ?? [], [sections]);

  return (
    <GestureScrollView style={styles.scroll} contentContainerStyle={{ paddingHorizontal: theme.spacing.xl, paddingBottom: theme.spacing.xxl }}>
      <Text style={[theme.type.h3, { color: theme.colors.textPrimary, fontFamily: theme.type.h3.fontFamily, marginBottom: theme.spacing.sm }]}>
        What would you like to plan?
      </Text>

      {derived.map((section) => {
        const accent = accentForSection(theme, section.labelStyle);
        return (
          <View
            key={section.key}
            style={{
              marginBottom: theme.spacing.xxl,
              paddingLeft: theme.spacing.md,
              borderLeftWidth: 4,
              borderLeftColor: accent,
            }}
          >
            <Text
              style={[
                theme.type.overline,
                {
                  fontFamily: theme.type.overline.fontFamily,
                  color: section.labelStyle ? accent : theme.colors.textSecondary,
                  marginBottom: theme.spacing.sm,
                },
              ]}
            >
              {section.label}
            </Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.md }}>
              {section.cards.map((card) => (
                <CardButton
                  key={`${section.key}-${card.key}`}
                  card={card}
                  theme={theme}
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
        );
      })}
    </GestureScrollView>
  );
}

const CardButton = React.memo(function CardButton({
  card,
  theme,
  onPress,
}: {
  card: RankedCard;
  theme: AppTheme;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={{
        width: "47%",
        minWidth: 140,
        backgroundColor: theme.colors.surface,
        borderRadius: theme.radii.lg,
        paddingVertical: theme.spacing.xl,
        paddingHorizontal: theme.spacing.lg,
        borderWidth: 1,
        borderColor: theme.colors.border,
        alignItems: "center",
        justifyContent: "center",
        ...theme.elevation(1),
      }}
      onPress={onPress}
      activeOpacity={0.85}
      accessibilityLabel={card.label}
    >
      <View
        style={{
          width: 52,
          height: 52,
          borderRadius: 26,
          backgroundColor: theme.colors.backgroundMuted,
          alignItems: "center",
          justifyContent: "center",
          marginBottom: theme.spacing.md,
        }}
      >
        <Ionicons name={card.icon as never} size={28} color={theme.colors.primary} />
      </View>
      <Text
        numberOfLines={2}
        style={[theme.type.caption, { color: theme.colors.textPrimary, fontFamily: theme.type.caption.fontFamily, fontWeight: "600", textAlign: "center" }]}
      >
        {card.label}
      </Text>
      {card.boosted && card.boostReason ? (
        <Text
          numberOfLines={2}
          style={[
            theme.type.caption,
            {
              fontFamily: theme.type.caption.fontFamily,
              fontSize: 11,
              color: theme.colors.primary,
              textAlign: "center",
              marginTop: theme.spacing.xs,
              fontWeight: "500",
            },
          ]}
        >
          {card.boostReason}
        </Text>
      ) : null}
    </TouchableOpacity>
  );
});

const styles = StyleSheet.create({
  scroll: { flex: 1 },
});
