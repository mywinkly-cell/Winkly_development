/**
 * Weekly Spark ideas — maps DB plans (or on-demand AI fallback) into three fully planned
 * experience cards for the current week. Context-aware: All / mode-selection shows solo +
 * date + meetup; a mode-scoped planner shows three plans for that mode.
 */

import type { Mode } from "@/types";
import { getPlannerThemePlans, type PlannerThemePlanOption } from "@/lib/ai/strategicHost";
import type { WeeklyWeekendIdea, WeeklyWeekendSuggestion } from "@/lib/ai/proactiveSuggestion";
import type { SparkSlot, WeeklySparkPlan } from "@/lib/ai/weeklySpark";

const DAY_LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;

export type WeeklySparkContext = "all" | "romance" | "friends" | "business" | "events";

type WeekTheme = {
  dayLabel: string;
  label: string;
  activityHint: string;
  slot: SparkSlot;
  mode: Mode;
  dow: number;
  hour: number;
};

/** Mixed All / mode-selection: one solo, one date, one meetup across the week. */
const ALL_WEEK_THEMES: WeekTheme[] = [
  { dayLabel: "Wednesday", label: "Solo outing", activityHint: "Specialty coffee and a quiet walk", slot: "solo", mode: "events", dow: 3, hour: 11 },
  { dayLabel: "Friday", label: "Date night", activityHint: "Wine bar", slot: "date", mode: "romance", dow: 5, hour: 19 },
  { dayLabel: "Saturday", label: "Friends meet-up", activityHint: "Casual dinner with friends", slot: "meetup", mode: "friends", dow: 6, hour: 18 },
];

const ROMANCE_WEEK_THEMES: WeekTheme[] = [
  { dayLabel: "Tuesday", label: "Weeknight date", activityHint: "Wine bar", slot: "date", mode: "romance", dow: 2, hour: 19 },
  { dayLabel: "Thursday", label: "Dinner date", activityHint: "Romantic restaurant", slot: "date", mode: "romance", dow: 4, hour: 19 },
  { dayLabel: "Saturday", label: "Weekend date", activityHint: "Art gallery and coffee", slot: "date", mode: "romance", dow: 6, hour: 14 },
];

const FRIENDS_WEEK_THEMES: WeekTheme[] = [
  { dayLabel: "Wednesday", label: "Weeknight hangout", activityHint: "Board game café", slot: "meetup", mode: "friends", dow: 3, hour: 18 },
  { dayLabel: "Friday", label: "Friday drinks", activityHint: "Beer garden or brewery", slot: "meetup", mode: "friends", dow: 5, hour: 19 },
  { dayLabel: "Sunday", label: "Weekend activity", activityHint: "Brunch and a walk", slot: "meetup", mode: "friends", dow: 0, hour: 11 },
];

const BUSINESS_WEEK_THEMES: WeekTheme[] = [
  { dayLabel: "Tuesday", label: "Coffee meeting", activityHint: "Business coffee meeting", slot: "meetup", mode: "business", dow: 2, hour: 10 },
  { dayLabel: "Thursday", label: "Lunch networking", activityHint: "Networking lunch", slot: "meetup", mode: "business", dow: 4, hour: 12 },
  { dayLabel: "Friday", label: "After-work meetup", activityHint: "Professional after-work drinks", slot: "meetup", mode: "business", dow: 5, hour: 18 },
];

const EVENTS_WEEK_THEMES: WeekTheme[] = [
  { dayLabel: "Monday", label: "Quiet start", activityHint: "Independent bookshop café", slot: "solo", mode: "events", dow: 1, hour: 11 },
  { dayLabel: "Thursday", label: "Culture evening", activityHint: "Art museum or exhibition", slot: "solo", mode: "events", dow: 4, hour: 17 },
  { dayLabel: "Saturday", label: "City explore", activityHint: "City park and specialty coffee", slot: "solo", mode: "events", dow: 6, hour: 11 },
];

function themesForContext(ctx: WeeklySparkContext): WeekTheme[] {
  if (ctx === "romance") return ROMANCE_WEEK_THEMES;
  if (ctx === "friends") return FRIENDS_WEEK_THEMES;
  if (ctx === "business") return BUSINESS_WEEK_THEMES;
  if (ctx === "events") return EVENTS_WEEK_THEMES;
  return ALL_WEEK_THEMES;
}

export function plannerTabToSparkContext(tab: string): WeeklySparkContext {
  if (tab === "dates") return "romance";
  if (tab === "meetups") return "friends";
  if (tab === "business") return "business";
  if (tab === "events") return "events";
  return "all";
}

/** Slot expected from cron for a given planner context (business has no cron slot). */
function preferredCronSlot(ctx: WeeklySparkContext): SparkSlot | null {
  if (ctx === "romance") return "date";
  if (ctx === "friends") return "meetup";
  if (ctx === "events") return "solo";
  if (ctx === "all") return null;
  return null; // business — always AI fill
}

/** Next local occurrence of `dow` (0=Sun) at hour:00, today or later. */
export function nextWeekdayAt(dow: number, hour: number, from: Date = new Date()): Date {
  const target = new Date(from);
  target.setHours(hour, 0, 0, 0);
  let add = (dow - target.getDay() + 7) % 7;
  if (add === 0 && target.getTime() <= from.getTime()) add = 7;
  target.setDate(target.getDate() + add);
  return target;
}

function dayLabelFromIso(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return DAY_LABELS[d.getDay()] ?? null;
}

/** Build teaser rows from plans (any weekday). */
export function teaserIdeasFromSparkPlans(plans: WeeklySparkPlan[]): WeeklyWeekendIdea[] {
  const out: WeeklyWeekendIdea[] = [];
  for (const plan of plans.slice(0, 3)) {
    const day = (dayLabelFromIso(plan.startsAt) ?? "This week") as WeeklyWeekendIdea["day"];
    out.push({
      day,
      label: plan.title || plan.placeName || "Plan",
      activityHint: plan.placeName ?? plan.title,
    });
  }
  return out;
}

export function buildWeeklyWeekendSuggestion(plans?: WeeklySparkPlan[]): WeeklyWeekendSuggestion {
  const ideas = plans?.length
    ? teaserIdeasFromSparkPlans(plans)
    : ALL_WEEK_THEMES.map((t) => ({
        day: t.dayLabel as WeeklyWeekendIdea["day"],
        label: t.label,
        activityHint: t.activityHint,
      }));
  return {
    id: `weekly_spark_${Date.now()}`,
    title: "This week's Sparks",
    ideas,
  };
}

function themePlanToSparkPlan(
  plan: PlannerThemePlanOption,
  theme: WeekTheme,
  startsAt: Date,
  rank: number,
): WeeklySparkPlan {
  return {
    id: `week_${theme.mode}_${theme.slot}_${rank}_${startsAt.toISOString().slice(0, 10)}`,
    slot: theme.slot,
    rank,
    title: plan.title,
    fitReason: plan.why_this_fits || plan.fit_reason || "",
    placeId: null,
    placeName: plan.venue?.name ?? null,
    placeAddress: plan.venue?.address ?? null,
    googleMapsUrl: plan.venue?.google_maps_link ?? null,
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

async function fetchThemePlan(
  theme: WeekTheme,
  rank: number,
  params: { city?: string | null; country?: string | null },
  from: Date,
): Promise<WeeklySparkPlan | null> {
  const when = nextWeekdayAt(theme.dow, theme.hour, from);
  const { plans } = await getPlannerThemePlans({
    mode: theme.mode,
    theme: theme.activityHint,
    city: params.city ?? undefined,
    country: params.country ?? undefined,
    dateTimeIso: when.toISOString(),
  });
  const pick = plans.find((p) => p.option_id === "A") ?? plans[0];
  if (!pick) return null;
  return themePlanToSparkPlan(pick, theme, when, rank);
}

/**
 * Resolve up to 3 weekly spark plans for the planner context.
 * - all: prefer cron solo/date/meetup; fill gaps via AI
 * - mode: prefer matching cron slot once, then AI-fill to 3 mode-specific plans
 */
export async function fetchWeeklySparkPlansForContext(params: {
  context: WeeklySparkContext;
  city?: string | null;
  country?: string | null;
  existingPlans?: WeeklySparkPlan[];
}): Promise<WeeklySparkPlan[]> {
  const themes = themesForContext(params.context);
  const existing = params.existingPlans ?? [];
  const now = new Date();

  if (params.context === "all") {
    if (existing.length >= 3) {
      return [...existing].sort((a, b) => a.rank - b.rank).slice(0, 3);
    }
    const bySlot = new Map<SparkSlot, WeeklySparkPlan>();
    for (const p of existing) {
      if (!bySlot.has(p.slot)) bySlot.set(p.slot, p);
    }
    const out: WeeklySparkPlan[] = [];
    for (let i = 0; i < themes.length; i++) {
      const theme = themes[i];
      const fromCron = bySlot.get(theme.slot);
      if (fromCron) {
        out.push(fromCron);
        continue;
      }
      const generated = await fetchThemePlan(theme, i, params, now);
      if (generated) out.push(generated);
    }
    return out.slice(0, 3);
  }

  // Mode-scoped: three plans for this mode.
  const preferred = preferredCronSlot(params.context);
  const seed = preferred ? existing.filter((p) => p.slot === preferred) : [];
  const out: WeeklySparkPlan[] = [];
  if (seed[0]) out.push({ ...seed[0], rank: 0 });

  for (let i = out.length; i < 3; i++) {
    const theme = themes[i] ?? themes[themes.length - 1];
    const generated = await fetchThemePlan(theme, i, params, now);
    if (generated) out.push(generated);
  }
  return out.slice(0, 3);
}

/** @deprecated Use fetchWeeklySparkPlansForContext — kept for older call sites. */
export async function fetchWeekendPlansFallback(params: {
  city?: string | null;
  country?: string | null;
}): Promise<WeeklySparkPlan[]> {
  return fetchWeeklySparkPlansForContext({ context: "all", ...params });
}

export function sparkPlanToStructured(plan: WeeklySparkPlan): PlannerThemePlanOption {
  const mapsQuery = [plan.placeName, plan.placeAddress].filter(Boolean).join(", ");
  const mapsLink =
    plan.googleMapsUrl?.trim() ||
    (plan.placeLat != null && plan.placeLng != null
      ? `https://www.google.com/maps/search/?api=1&query=${plan.placeLat},${plan.placeLng}`
      : mapsQuery
        ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapsQuery)}`
        : "");
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
      address: plan.placeAddress ?? "",
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
  return nextWeekdayAt(6, 12);
}
