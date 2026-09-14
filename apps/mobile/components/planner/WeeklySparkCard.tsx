/**
 * Weekly Spark card — one verified, ready-to-go plan at the top of the Planner.
 * CTA is always "View the plan" → full details (invite, edit fields, add to planner).
 */

import React from "react";
import { useTranslation } from "react-i18next";
import { useAppTheme } from "@/constants/design-system";
import { PlanCard, PlanCardBadge, PlanCardMeta } from "@/components/plans/PlanCard";
import {
  sparkVenueDisplayLine,
  type WeeklySparkPlan,
  type SparkSlot,
} from "@/lib/ai/weeklySpark";

export type WeeklySparkCardProps = {
  plan: WeeklySparkPlan;
  /** Accent for the card stripe / slot chip / CTA (per-slot or per-mode color). */
  accentColor?: string;
  /** Distance user→venue in km (computed by the section from device coords); null/undefined hides it. */
  distanceKm?: number | null;
  /** Locale tag for date/number formatting (e.g. "de-DE"). */
  locale?: string;
  /** True once this plan has already been added to the Planner — swaps the CTA to "Planned". */
  planned?: boolean;
  /** Opens full plan details (invite / edit / add to planner). */
  onViewPlan: (plan: WeeklySparkPlan) => void;
  /** When planned, opens the existing Planner entry for review instead of the add flow. */
  onReviewPlan?: (plan: WeeklySparkPlan) => void;
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
  accentColor,
  distanceKm,
  locale = "en",
  planned = false,
  onViewPlan,
  onReviewPlan,
}: WeeklySparkCardProps) {
  const { t } = useTranslation();
  const theme = useAppTheme();
  const accent = accentColor ?? theme.colors.primary;
  const when = formatWhen(plan.startsAt, locale);
  const price = formatPrice(plan.approxPriceCents, plan.currency, locale, t);
  const distance =
    typeof distanceKm === "number"
      ? distanceKm < 1
        ? t("common.kmAway")
        : t("common.kmAwayN", { count: Math.round(distanceKm) })
      : null;
  const disclosure = plan.sponsored ? plan.sponsorDisclosureLabel ?? t("weeklySpark.partnerPick") : null;
  const venueLine = sparkVenueDisplayLine(plan);

  const open = () => {
    if (planned) (onReviewPlan ?? onViewPlan)(plan);
    else onViewPlan(plan);
  };

  const metaParts = [venueLine, when, distance, price].filter(Boolean).length;

  return (
    <PlanCard
      accentColor={accent}
      dimmed={planned}
      onPress={open}
      title={plan.title}
      badges={
        <>
          {disclosure ? (
            <PlanCardBadge label={disclosure} icon="pricetag-outline" tone="neutral" />
          ) : planned ? (
            <PlanCardBadge label={t("weeklySpark.planned")} icon="checkmark-circle" tone="success" />
          ) : null}
          <PlanCardBadge label={t(SLOT_KEY[plan.slot])} variant="outlined" color={accent} />
        </>
      }
      meta={
        metaParts > 0 ? (
          <>
            {venueLine ? (
              <PlanCardMeta icon="location-outline" numberOfLines={2}>
                {venueLine}
              </PlanCardMeta>
            ) : null}
            {when ? <PlanCardMeta icon="time-outline">{when}</PlanCardMeta> : null}
            {distance ? <PlanCardMeta icon="navigate-outline">{distance}</PlanCardMeta> : null}
            {price ? <PlanCardMeta icon="cash-outline">{price}</PlanCardMeta> : null}
          </>
        ) : undefined
      }
      primaryAction={{
        label: t(planned ? "weeklySpark.planned" : "weeklySpark.viewPlan"),
        onPress: open,
        icon: planned ? "checkmark-circle" : "eye-outline",
        tone: planned ? theme.colors.success : accent,
      }}
    />
  );
}
