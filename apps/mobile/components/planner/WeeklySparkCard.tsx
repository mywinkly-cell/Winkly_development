/**
 * Weekly Spark card — one verified, ready-to-go plan (solo/date/meetup) at the top of the Planner.
 * Marked with the spark icon + the shared label constant. fit_reason is the hero subtitle; place,
 * time, distance and price come from the verified plan data (never the model's guess).
 *
 * Per-slot primary CTA (the viral loop): SOLO "Add to my plan"; DATE "Invite someone";
 * MEETUP "Invite friends". Supports source='sponsored' with a clear disclosure label (rails OFF
 * at launch — see config/flags#SPARK_SPONSORED_ENABLED).
 */

import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { SparklesIcon } from "@/components/ui/WinklyAISpark";
import { Colors, Typography } from "@/constants/tokens";
import { WEEKLY_SPARK_LABEL_KEY, type WeeklySparkPlan, type SparkSlot } from "@/lib/ai/weeklySpark";

export type WeeklySparkCardProps = {
  plan: WeeklySparkPlan;
  /** Accent for the card border/badge/CTA (per-slot mode color). */
  accentColor?: string;
  /** Distance user→venue in km (computed by the section from device coords); null/undefined hides it. */
  distanceKm?: number | null;
  /** Locale tag for date/number formatting (e.g. "de-DE"). */
  locale?: string;
  /** Primary CTA: SOLO add-to-plan; DATE/MEETUP invite. */
  onPrimary: (plan: WeeklySparkPlan) => void;
  /** Tap the title/venue to open details (maps / booking). */
  onOpen?: (plan: WeeklySparkPlan) => void;
};

const CTA_KEY: Record<SparkSlot, string> = {
  solo: "weeklySpark.addToMyPlan",
  date: "weeklySpark.inviteSomeone",
  meetup: "weeklySpark.inviteFriends",
};

const CTA_ICON: Record<SparkSlot, keyof typeof Ionicons.glyphMap> = {
  solo: "add",
  date: "person-add-outline",
  meetup: "people-outline",
};

const SLOT_KEY: Record<SparkSlot, string> = {
  solo: "weeklySpark.slotSolo",
  date: "weeklySpark.slotDate",
  meetup: "weeklySpark.slotMeetup",
};

function formatWhen(startsAt: string | null, locale: string): string | null {
  if (!startsAt) return null;
  const d = new Date(startsAt);
  if (Number.isNaN(d.getTime())) return null;
  const day = d.toLocaleDateString(locale, { weekday: "short", day: "numeric", month: "short" });
  const time = d.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
  return `${day} · ${time}`;
}

function formatPrice(
  cents: number | null,
  currency: string | null,
  locale: string,
  t: (k: string) => string,
): string | null {
  if (cents === null) return null;
  if (cents === 0) return t("weeklySpark.free");
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: currency || "EUR",
      maximumFractionDigits: 0,
    }).format(cents / 100);
  } catch {
    return `${Math.round(cents / 100)} ${currency || "EUR"}`;
  }
}

export function WeeklySparkCard({
  plan,
  accentColor = Colors.primaryViolet,
  distanceKm,
  locale = "en",
  onPrimary,
  onOpen,
}: WeeklySparkCardProps) {
  const { t } = useTranslation();
  const when = formatWhen(plan.startsAt, locale);
  const price = formatPrice(plan.approxPriceCents, plan.currency, locale, t);
  const distance =
    typeof distanceKm === "number"
      ? distanceKm < 1
        ? t("common.kmAway")
        : t("common.kmAwayN", { count: Math.round(distanceKm) })
      : null;
  const disclosure = plan.sponsored ? plan.sponsorDisclosureLabel ?? t("weeklySpark.partnerPick") : null;

  return (
    <View style={[styles.card, { borderLeftColor: accentColor }]}>
      <View style={styles.header}>
        <View style={[styles.badge, { backgroundColor: accentColor + "18" }]}>
          <SparklesIcon size={16} color={accentColor} />
          <Text style={[styles.badgeText, { color: accentColor }]} numberOfLines={1}>
            {t(WEEKLY_SPARK_LABEL_KEY)}
          </Text>
        </View>
        <View style={styles.headerRight}>
          {disclosure && (
            <View style={styles.disclosureChip} accessibilityLabel={disclosure}>
              <Ionicons name="pricetag-outline" size={11} color={Colors.gray600} />
              <Text style={styles.disclosureText} numberOfLines={1}>{disclosure}</Text>
            </View>
          )}
          <View style={[styles.slotChip, { borderColor: accentColor }]}>
            <Text style={[styles.slotChipText, { color: accentColor }]}>{t(SLOT_KEY[plan.slot])}</Text>
          </View>
        </View>
      </View>

      <TouchableOpacity
        activeOpacity={onOpen ? 0.85 : 1}
        onPress={() => { if (onOpen) { Haptics.selectionAsync(); onOpen(plan); } }}
        accessibilityRole={onOpen ? "button" : undefined}
      >
        <Text style={styles.title}>{plan.title}</Text>
        {/* fit_reason is the hero subtitle (the honest, personal "why this"). */}
        <Text style={styles.fitReason}>{plan.fitReason}</Text>

        <View style={styles.metaWrap}>
          {plan.placeName && (
            <View style={styles.metaRow}>
              <Ionicons name="location-outline" size={15} color={Colors.gray500} />
              <Text style={styles.metaText} numberOfLines={1}>{plan.placeName}</Text>
            </View>
          )}
          <View style={styles.metaRowGroup}>
            {when && (
              <View style={styles.metaRow}>
                <Ionicons name="time-outline" size={15} color={Colors.gray500} />
                <Text style={styles.metaText}>{when}</Text>
              </View>
            )}
            {distance && (
              <View style={styles.metaRow}>
                <Ionicons name="navigate-outline" size={15} color={Colors.gray500} />
                <Text style={styles.metaText}>{distance}</Text>
              </View>
            )}
            {price && (
              <View style={styles.metaRow}>
                <Ionicons name="cash-outline" size={15} color={Colors.gray500} />
                <Text style={styles.metaText}>{price}</Text>
              </View>
            )}
          </View>
        </View>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.primaryBtn, { backgroundColor: accentColor }]}
        onPress={() => { Haptics.selectionAsync(); onPrimary(plan); }}
        activeOpacity={0.9}
        accessibilityRole="button"
      >
        <Ionicons name={CTA_ICON[plan.slot]} size={18} color={Colors.white} />
        <Text style={styles.primaryBtnText}>{t(CTA_KEY[plan.slot])}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.white,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderLeftWidth: 4,
    borderColor: Colors.gray200,
    borderWidth: 1,
    shadowColor: "#1C1C1E",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 3,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
    gap: 8,
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 12,
    flexShrink: 1,
  },
  badgeText: {
    ...Typography.caption,
    fontWeight: "700",
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexShrink: 0,
  },
  disclosureChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 10,
    backgroundColor: Colors.gray100,
    maxWidth: 120,
  },
  disclosureText: {
    ...Typography.caption,
    fontSize: 11,
    color: Colors.gray600,
    fontWeight: "600",
  },
  slotChip: {
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 10,
    borderWidth: 1,
  },
  slotChipText: {
    ...Typography.caption,
    fontSize: 11,
    fontWeight: "700",
  },
  title: {
    ...Typography.h3,
    color: Colors.textPrimary,
    marginBottom: 4,
  },
  fitReason: {
    ...Typography.body,
    color: Colors.gray700,
    marginBottom: 12,
  },
  metaWrap: { gap: 6, marginBottom: 14 },
  metaRowGroup: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 14,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  metaText: {
    ...Typography.caption,
    color: Colors.gray600,
  },
  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 12,
    paddingVertical: 12,
  },
  primaryBtnText: {
    ...Typography.button,
    color: Colors.white,
  },
});
