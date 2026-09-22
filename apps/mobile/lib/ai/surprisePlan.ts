// ────────────────────────────────────────────────
// "Surprise me" — pure client helpers for winkly_plan with surprise: true.
// The server picks what/when/where (supabase/functions/_shared/surprise/surprise.ts); the client
// only sends where the user is and what time it is, then guards and renders the three options.
// ────────────────────────────────────────────────

import type { Mode } from "@/types";
import type { PlannerThemePlanOption } from "@/lib/ai/strategicHost";
import { filterFuturePlanOptions, formatLocalIsoDateTime } from "@/lib/ai/planTimeValidation";

export type SurpriseVibe = "cosy" | "active" | "social";

export const SURPRISE_VIBES: readonly SurpriseVibe[] = ["cosy", "active", "social"] as const;

export type SurprisePlanOption = {
  option_id: "A" | "B" | "C";
  vibe: SurpriseVibe;
  /** Local calendar date, YYYY-MM-DD. */
  date: string;
  /** Local start, HH:mm. */
  start_time: string;
  character_label: string;
  title: string;
  why_this_fits: string;
  fit_reason?: string;
  itinerary: { time: string; description: string }[];
  venue: {
    name: string;
    address: string;
    google_maps_link: string;
    estimated_cost: string;
    booking_url?: string;
  };
  weather_note: string;
  duration_minutes: number;
};

/** Gateway `context` for a surprise request: location + clock only — never a user_prompt. */
export function buildSurpriseContext(params: {
  mode: Mode;
  city?: string | null;
  country?: string | null;
  now: Date;
  timezone?: string;
  appLanguage: string;
}): Record<string, unknown> {
  const city = params.city?.trim();
  const country = params.country?.trim();
  return {
    mode: params.mode,
    surprise: true,
    ...(city ? { city } : {}),
    ...(country ? { country } : {}),
    current_datetime_local: formatLocalIsoDateTime(params.now),
    ...(params.timezone ? { timezone: params.timezone } : {}),
    source_screen: "planner",
    planning_entry_surface: "planner",
    app_language: params.appLanguage,
  };
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function isVibe(v: unknown): v is SurpriseVibe {
  return v === "cosy" || v === "active" || v === "social";
}

/**
 * Validate the gateway's `options` array. Anything without a vibe, a real date/time, a title
 * or a venue is dropped; duplicates of a vibe keep the first one. Result is in vibe order.
 */
export function parseSurpriseOptions(raw: unknown): SurprisePlanOption[] {
  if (!Array.isArray(raw)) return [];
  const byVibe = new Map<SurpriseVibe, SurprisePlanOption>();
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const venue = (o.venue && typeof o.venue === "object" ? o.venue : {}) as Record<string, unknown>;
    const date = str(o.date);
    const start = str(o.start_time);
    if (!isVibe(o.vibe) || byVibe.has(o.vibe)) continue;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(start)) continue;
    if (!str(o.title) || !str(venue.name)) continue;
    const itinerary = Array.isArray(o.itinerary)
      ? (o.itinerary as unknown[])
          .map((s) => (s && typeof s === "object" ? (s as Record<string, unknown>) : {}))
          .map((s) => ({ time: str(s.time), description: str(s.description) }))
          .filter((s) => s.description)
      : [];
    byVibe.set(o.vibe, {
      option_id: o.option_id === "B" || o.option_id === "C" ? o.option_id : "A",
      vibe: o.vibe,
      date,
      start_time: start,
      character_label: str(o.character_label),
      title: str(o.title),
      why_this_fits: str(o.why_this_fits),
      ...(str(o.fit_reason) ? { fit_reason: str(o.fit_reason) } : {}),
      itinerary,
      venue: {
        name: str(venue.name),
        address: str(venue.address),
        google_maps_link: str(venue.google_maps_link),
        estimated_cost: str(venue.estimated_cost),
        ...(str(venue.booking_url) ? { booking_url: str(venue.booking_url) } : {}),
      },
      weather_note: str(o.weather_note),
      duration_minutes:
        typeof o.duration_minutes === "number" && o.duration_minutes > 0 ? Math.round(o.duration_minutes) : 120,
    });
  }
  return SURPRISE_VIBES.flatMap((v) => (byVibe.has(v) ? [byVibe.get(v)!] : []));
}

/** Local start of an option, or null when its date/time can't be read. */
export function surpriseOptionStart(opt: Pick<SurprisePlanOption, "date" | "start_time">): Date | null {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(opt.date);
  const t = /^(\d{2}):(\d{2})$/.exec(opt.start_time);
  if (!d || !t) return null;
  const out = new Date(Number(d[1]), Number(d[2]) - 1, Number(d[3]), Number(t[1]), Number(t[2]), 0, 0);
  return Number.isNaN(out.getTime()) ? null : out;
}

/**
 * Final client guard: drop anything that isn't strictly in the future (e.g. the screen sat open
 * past a slot). Options whose time can't be read are dropped too — a surprise always has one.
 */
export function futureSurpriseOptions(options: SurprisePlanOption[], now: Date = new Date()): SurprisePlanOption[] {
  const readable = options.filter((o) => surpriseOptionStart(o) != null);
  return filterFuturePlanOptions(readable, surpriseOptionStart, now).kept;
}

/** Shape ConciergeConfirmStep's "locked plan" path expects (venue + time already decided). */
export function surpriseToPlannerPlan(opt: SurprisePlanOption): PlannerThemePlanOption {
  return {
    option_id: opt.option_id,
    character_label: opt.character_label,
    title: opt.title,
    why_this_fits: opt.why_this_fits,
    ...(opt.fit_reason ? { fit_reason: opt.fit_reason } : {}),
    itinerary: opt.itinerary.length ? opt.itinerary : [{ time: opt.start_time, description: opt.title }],
    venue: opt.venue,
    weather_note: opt.weather_note,
    duration_minutes: opt.duration_minutes,
  };
}
