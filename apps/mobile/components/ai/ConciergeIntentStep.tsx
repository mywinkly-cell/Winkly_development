/**
 * Step 1 — Intent: sectioned cards (All = neutral groups; mode = boosted + tail).
 */

import React, { useMemo } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";
import { GestureScrollView } from "@/components/ui/GestureScrollView";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { useAppTheme, type AppTheme, type ModeName } from "@/constants/design-system";
import type { Mode } from "@/types";
import type { IntentSection, RankedCard } from "@/lib/ai/conciergePlanningFlow";
import { translateCatalogText } from "@/lib/ai/conciergeCatalogI18n";

const BOOST_MARK = "✦ ";

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
  const { t } = useTranslation();
  const theme = useAppTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const derived = useMemo(() => sections ?? [], [sections]);

  const sectionAccent = (labelStyle: IntentSection["labelStyle"]): string => {
    if (labelStyle === "romance" || labelStyle === "friends" || labelStyle === "business") {
      return theme.modeAccent(labelStyle as ModeName).primary;
    }
    if (labelStyle === "boosted") return theme.colors.primary;
    if (labelStyle === "muted") return theme.colors.textSecondary;
    return theme.colors.border;
  };

  return (
    <GestureScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      <Text style={styles.title}>{t("concierge.intent.title")}</Text>

      {derived.map((section) => (
        <View
          key={section.key}
          style={[styles.section, { borderLeftColor: sectionAccent(section.labelStyle) }]}
        >
          <Text style={[styles.sectionTitle, { color: sectionAccent(section.labelStyle) }]}>
            {section.label.startsWith(BOOST_MARK)
              ? BOOST_MARK + translateCatalogText(t, section.label.slice(BOOST_MARK.length))
              : translateCatalogText(t, section.label)}
          </Text>
          <View style={styles.grid}>
            {section.cards.map((card) => (
              <CardButton
                key={`${section.key}-${card.key}`}
                card={card}
                theme={theme}
                styles={styles}
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
    </GestureScrollView>
  );
}

const CardButton = React.memo(function CardButton({
  card,
  theme,
  styles,
  onPress,
}: {
  card: RankedCard;
  theme: AppTheme;
  styles: ReturnType<typeof makeStyles>;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  const label = translateCatalogText(t, card.label);
  return (
    <TouchableOpacity
      style={styles.button}
      onPress={onPress}
      activeOpacity={0.85}
      accessibilityLabel={label}
    >
      <View style={styles.iconWrap}>
        <Ionicons name={card.icon as never} size={28} color={theme.colors.primary} />
      </View>
      <Text style={styles.buttonLabel} numberOfLines={3}>
        {label}
      </Text>
      {card.boosted && card.boostInterest ? (
        <Text style={styles.boostHint} numberOfLines={2}>
          {t("concierge.intent.bothLove", { interest: card.boostInterest })}
        </Text>
      ) : null}
    </TouchableOpacity>
  );
});

function makeStyles(theme: AppTheme) {
  return StyleSheet.create({
    scroll: { flex: 1 },
    content: {
      paddingHorizontal: theme.spacing.xl,
      paddingBottom: theme.spacing.xxl,
    },
    title: {
      ...theme.type.h3,
      color: theme.colors.textPrimary,
      marginBottom: theme.spacing.sm,
    },
    section: {
      marginBottom: theme.spacing.xl,
      paddingLeft: theme.spacing.md,
      borderLeftWidth: 4,
      borderLeftColor: theme.colors.border,
    },
    sectionTitle: {
      ...theme.type.caption,
      fontWeight: "700",
      color: theme.colors.textSecondary,
      textTransform: "uppercase",
      letterSpacing: 0.6,
      marginBottom: theme.spacing.sm,
    },
    grid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: theme.spacing.md,
      marginBottom: theme.spacing.xs,
    },
    button: {
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
    },
    iconWrap: {
      width: 52,
      height: 52,
      borderRadius: 26,
      backgroundColor: theme.colors.backgroundMuted,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: theme.spacing.md,
    },
    buttonLabel: {
      ...theme.type.caption,
      fontWeight: "600",
      color: theme.colors.textPrimary,
      textAlign: "center",
    },
    boostHint: {
      ...theme.type.caption,
      fontSize: 11,
      color: theme.colors.primary,
      textAlign: "center",
      marginTop: theme.spacing.xs,
      fontWeight: "500",
    },
  });
}
