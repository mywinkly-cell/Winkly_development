/**
 * Weekend ideas — maps Weekly Spark DB plans (or on-demand AI fallback) into the
 * "Your weekend ideas" teaser + three fully planned experience cards.
 */

import type { Mode } from "@/types";
import { getPlannerThemePlans, type PlannerThemePlanOption } from "@/lib/ai/strategicHost";
import type { WeeklyWeekendIdea, WeeklyWeekendSuggestion } from "@/lib/ai/proactiveSuggestion";
import type { SparkSlot, WeeklySparkPlan } from "@/lib/ai/weeklySpark";

const DAY_LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;

type WeekendTheme = {
  day: WeeklyWeekendIdea["day"];
  label: string;
  activityHint: string;
  slot: SparkSlot;
  mode: Mode;
  dow: number;
  hour: number;
};

const WEEKEND_THEMES: WeekendTheme[] = [
  { day: "Friday", label: "Wine bar", activityHint: "Wine bar", slot: "solo", mode: "events", dow: 5, hour: 19 },
  { day: "Saturday", label: "Art exhibition", activityHint: "Art exhibition", slot: "date", mode: "romance", dow: 6, hour: 14 },
  { day: "Sunday", label: "Day trip", activityHint: "Day trip", slot: "meetup", mode: "friends", dow: 0, hour: 11 },
];

/** Next local occurrence of `dow` (0=Sun) at hour:00, today or later. */
export function nextWeekdayAt(dow: number, hour: number, from: Date = new Date()): Date {
  const target = new Date(from);
  target.setHours(hour, 0, 0, 0);
  let add = (dow - target.getDay() + 7) % 7;
  if (add === 0 && target.getTime() <= from.getTime()) add = 7;
  target.setDate(target.getDate() + add);
  return target;
}

function dayLabelFromIso(iso: string | null): WeeklyWeekendIdea["day"] | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const name = DAY_LABELS[d.getDay()];
  if (name === "Friday" || name === "Saturday" || name === "Sunday") return name;
  return null;
}

/** Build Fri/Sat/Sun teaser rows from verified spark plans when available. */
export function teaserIdeasFromSparkPlans(plans: WeeklySparkPlan[]): WeeklyWeekendIdea[] {
  const byDay = new Map<WeeklyWeekendIdea["day"], WeeklyWeekendIdea>();
  for (const plan of plans) {
    const day = dayLabelFromIso(plan.startsAt);
    if (!day || byDay.has(day)) continue;
    byDay.set(day, {
      day,
      label: plan.title || plan.placeName || day,
      activityHint: plan.placeName ?? plan.title,
    });
  }
  const ordered: WeeklyWeekendIdea["day"][] = ["Friday", "Saturday", "Sunday"];
  const out: WeeklyWeekendIdea[] = [];
  for (const day of ordered) {
    const row = byDay.get(day);
    if (row) out.push(row);
  }
  if (out.length >= 3) return out.slice(0, 3);
  for (const theme of WEEKEND_THEMES) {
    if (out.length >= 3) break;
    if (!out.some((r) => r.day === theme.day)) {
      out.push({ day: theme.day, label: theme.label, activityHint: theme.activityHint });
    }
  }
  return out.sort((a, b) => ordered.indexOf(a.day) - ordered.indexOf(b.day));
}

export function buildWeeklyWeekendSuggestion(plans?: WeeklySparkPlan[]): WeeklyWeekendSuggestion {
  const ideas = plans?.length ? teaserIdeasFromSparkPlans(plans) : WEEKEND_THEMES.map((t) => ({
    day: t.day,
    label: t.label,
    activityHint: t.activityHint,
  }));
  return {
    id: `weekly_weekend_${Date.now()}`,
    title: "Your weekend ideas",
    ideas,
  };
}

function themePlanToSparkPlan(
  plan: PlannerThemePlanOption,
  theme: WeekendTheme,
  startsAt: Date,
): WeeklySparkPlan {
  return {
    id: `weekend_${theme.slot}_${startsAt.toISOString().slice(0, 10)}`,
    slot: theme.slot,
    rank: WEEKEND_THEMES.indexOf(theme),
    title: plan.title,
    fitReason: plan.why_this_fits || plan.fit_reason || "",
    placeId: null,
    placeName: plan.venue?.name ?? null,
    placeLat: null,
    placeLng: null,
    startsAt: startsAt.toISOString(),
    endsAt: null,
    approxPriceCents: null,
    currency: "EUR",
    bookingUrl: plan.venue?.booking_url ?? null,
    source: "ai",
    sponsored: false,
    sponsorDisclosureLabel: null,
    externalRef: null,
  };
}

/** On-demand fallback when weekly_sparks cron has not run yet for this user. */
export async function fetchWeekendPlansFallback(params: {
  city?: string | null;
  country?: string | null;
}): Promise<WeeklySparkPlan[]> {
  const now = new Date();
  const results = await Promise.all(
    WEEKEND_THEMES.map(async (theme) => {
      const when = nextWeekdayAt(theme.dow, theme.hour, now);
      const { plans } = await getPlannerThemePlans({
        mode: theme.mode,
        theme: theme.activityHint,
        city: params.city ?? undefined,
        country: params.country ?? undefined,
        dateTimeIso: when.toISOString(),
      });
      const pick = plans.find((p) => p.option_id === "A") ?? plans[0];
      if (!pick) return null;
      return themePlanToSparkPlan(pick, theme, when);
    }),
  );
  return results.filter((p): p is WeeklySparkPlan => p != null);
}

export function sparkPlanToStructured(plan: WeeklySparkPlan): PlannerThemePlanOption {
  const mapsLink =
    plan.placeLat != null && plan.placeLng != null
      ? `https://www.google.com/maps/search/?api=1&query=${plan.placeLat},${plan.placeLng}`
      : plan.placeName
        ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(plan.placeName)}`
        : "";
  const cost =
    plan.approxPriceCents != null && plan.approxPriceCents > 0
      ? `${Math.round(plan.approxPriceCents / 100)} ${plan.currency ?? "EUR"}`
      : plan.approxPriceCents === 0
        ? "Free"
        : "";
  let timeLabel = "";
  if (plan.startsAt) {
    const d = new Date(plan.startsAt);
    if (!Number.isNaN(d.getTime())) {
      timeLabel = d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
    }
  }
  return {
    option_id: "A",
    character_label: "",
    title: plan.title,
    why_this_fits: plan.fitReason,
    fit_reason: plan.fitReason,
    itinerary: timeLabel
      ? [{ time: timeLabel, description: plan.placeName ?? plan.title }]
      : [{ time: "", description: plan.placeName ?? plan.title }],
    venue: {
      name: plan.placeName ?? plan.title,
      address: "",
      google_maps_link: mapsLink,
      estimated_cost: cost,
      booking_url: plan.bookingUrl ?? undefined,
    },
    weather_note: "",
    duration_minutes: 120,
  };
}

export function modeForSparkSlot(slot: SparkSlot): Mode {
  if (slot === "date") return "romance";
  if (slot === "meetup") return "friends";
  return "events";
}

export function dateForSparkPlan(plan: WeeklySparkPlan): Date {
  if (plan.startsAt) {
    const d = new Date(plan.startsAt);
    if (!Number.isNaN(d.getTime())) return d;
  }
  const theme = WEEKEND_THEMES.find((t) => t.slot === plan.slot);
  if (theme) return nextWeekdayAt(theme.dow, theme.hour);
  return nextWeekdayAt(6, 12);
}
