/**
 * Step 4 — Plan Summary: show summary card and "Plan" button.
 * Confirms intent before running AI generation.
 */

import React, { useMemo } from "react";
import { View, Text, StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { SparklesIcon } from "@/components/ui/WinklyAISpark";
import { useAppTheme, type AppTheme } from "@/constants/design-system";
import { Card, PrimaryButton, TextButton } from "@/components/ds";
import type { ActivityDetails } from "@/lib/ai/conciergePlanningFlow";
import { useNormalizedLocation } from "@/lib/location/useLocationDisplay";
import { translateCatalogText } from "@/lib/ai/conciergeCatalogI18n";
import { useAppLocaleTag } from "@/lib/i18n/appLocale";
import { formatMoney } from "@/lib/i18n/format";

function dayKey(d: Date, locale: string): string {
  return d.toLocaleDateString(locale, { weekday: "short", month: "short", day: "numeric" });
}

function sameCalendarDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export type ConciergeSummaryStepProps = {
  activityLabel: string | null;
  details: Partial<ActivityDetails>;
  whoLabel?: string; // e.g. "2 people", "Just me"
  onGenerate: () => void;
  onBack: () => void;
  loading?: boolean;
  showInlineBack?: boolean;
};

export function ConciergeSummaryStep({
  activityLabel,
  details,
  whoLabel,
  onGenerate,
  onBack,
  loading = false,
  showInlineBack = true,
}: ConciergeSummaryStepProps) {
  const { t } = useTranslation();
  const appLocale = useAppLocaleTag();
  const theme = useAppTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const locationDisplay = useNormalizedLocation(details.location);
  const dateStr =
    details.date && details.singleDay === false && details.dateEnd && !sameCalendarDay(details.date, details.dateEnd)
      ? t("concierge.summary.dateRange", { start: dayKey(details.date, appLocale), end: dayKey(details.dateEnd, appLocale) })
      : details.date
        ? dayKey(details.date, appLocale)
        : "";
  const timeLabel =
    details.exactTimeHm && /^\d{2}:\d{2}$/.test(details.exactTimeHm)
      ? details.exactTimeHm
      : details.timeOfDay && details.timeOfDay !== "any"
        ? t(`concierge.timeOfDay.${details.timeOfDay}`)
        : "";
  const budgetStr =
    details.budgetAmount && details.budgetCurrency
      ? formatMoney(details.budgetAmount, details.budgetCurrency, appLocale)
      : details.budgetCurrency
        ? details.budgetCurrency
        : "";

  return (
    <View style={styles.wrap}>
      {showInlineBack ? (
        <TextButton
          title={t("common.back")}
          icon={<Ionicons name="arrow-back" size={20} color={theme.colors.primary} />}
          onPress={onBack}
          style={styles.backRow}
        />
      ) : null}

      <Text style={styles.title}>{t("concierge.summary.title")}</Text>
      <Text style={styles.subtitle}>{t("concierge.summary.subtitle")}</Text>

      <Card style={styles.card} elevation={1}>
        {dateStr ? (
          <View style={styles.row}>
            <Ionicons name="calendar-outline" size={20} color={theme.colors.textSecondary} />
            <Text style={styles.cardText}>
              {dateStr}
              {timeLabel ? ` · ${timeLabel}` : ""}
            </Text>
          </View>
        ) : null}
        {locationDisplay ? (
          <View style={styles.row}>
            <Ionicons name="location-outline" size={20} color={theme.colors.textSecondary} />
            <Text style={styles.cardText} numberOfLines={1}>{locationDisplay}</Text>
          </View>
        ) : null}
        {budgetStr ? (
          <View style={styles.row}>
            <Ionicons name="wallet-outline" size={20} color={theme.colors.textSecondary} />
            <Text style={styles.cardText}>{t("concierge.summary.budget", { budget: budgetStr })}</Text>
          </View>
        ) : null}
        {details.cuisine ? (
          <View style={styles.row}>
            <Ionicons name="restaurant-outline" size={20} color={theme.colors.textSecondary} />
            <Text style={styles.cardText}>{t("concierge.summary.cuisine", { cuisine: details.cuisine })}</Text>
          </View>
        ) : null}
        {whoLabel ? (
          <View style={styles.row}>
            <Ionicons name="people-outline" size={20} color={theme.colors.textSecondary} />
            <Text style={styles.cardText}>{whoLabel}</Text>
          </View>
        ) : null}
        {activityLabel ? (
          <View style={[styles.row, styles.rowLast]}>
            <SparklesIcon size={20} color={theme.colors.primary} />
            <Text style={[styles.cardText, styles.activityText]}>{translateCatalogText(t, activityLabel)}</Text>
          </View>
        ) : null}
      </Card>

      <PrimaryButton title={t("concierge.summary.plan")} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onGenerate(); }} loading={loading} />
    </View>
  );
}

function makeStyles(theme: AppTheme) {
  return StyleSheet.create({
    wrap: { flex: 1, paddingHorizontal: theme.spacing.xl, paddingBottom: theme.spacing.xxl },
    backRow: { alignSelf: "flex-start", marginBottom: theme.spacing.lg, paddingLeft: 0 },
    title: { ...theme.type.h3, color: theme.colors.textPrimary, marginBottom: theme.spacing.sm },
    subtitle: { ...theme.type.caption, color: theme.colors.textSecondary, marginBottom: theme.spacing.xxl },
    card: {
      marginBottom: theme.spacing.xxl,
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.md,
      marginBottom: theme.spacing.md,
    },
    rowLast: { marginBottom: 0 },
    cardText: { ...theme.type.body, color: theme.colors.textPrimary, flex: 1 },
    activityText: { fontWeight: "600", color: theme.colors.primary },
  });
}
