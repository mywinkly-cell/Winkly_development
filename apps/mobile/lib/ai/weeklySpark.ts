/**
 * Weekly Spark — the weekly batch of verified, ready-made plans Winkly surfaces in the Planner
 * (SOLO / DATE / MEETUP). Generated server-side by `weekly-spark-cron` and persisted to
 * `weekly_sparks` / `weekly_spark_plans`. Every venue is Places-verified before it is stored.
 *
 * This module is the single client surface for the ritual:
 *   - getCurrentWeeklySpark() — the live Spark + its plans (for the Planner section)
 *   - hasUnseenWeeklySpark()  — drives the Planner-tab badge + mode-selection nudge
 *   - markWeeklySparkSeen()   — clears the badge (sets weekly_sparks.seen_at)
 * RLS scopes every read/write to the signed-in user's own sparks.
 *
 * (Previously a local AsyncStorage placeholder keyed to the weekend-ideas window. The P1b DB
 * backend has now landed — `weekly_sparks.seen_at` IS the unseen signal — so the internals read
 * real sparks while the exported API stays stable for callers, exactly as that placeholder noted.)
 */

import { supabase } from "@/lib/supabase";
import { isWeekendIdeasPeriod } from "@/lib/ai/proactiveSuggestion";

export type SparkSlot = "solo" | "date" | "meetup";
export type SparkSource = "ai" | "winkly_event" | "sponsored";

/**
 * i18n key for the user-facing Spark label — the ONE shared source so the label can be renamed
 * or A/B tested without touching call sites. Default copy (en): "Your Weekly Spark".
 */
export const WEEKLY_SPARK_LABEL_KEY = "weeklySpark.label";

/** Deep-link param the Planner reads to focus + reveal the Spark section. */
export const WEEKLY_SPARK_FOCUS_PARAM = "spark";

/** Value the Planner checks the focus param against. */
export const WEEKLY_SPARK_FOCUS_VALUE = "1";

/**
 * Plan persisted to weekly_spark_plans. Venue facts (place/lat/lng, hours, price, booking_url)
 * are Places-verified server-side — never model-authored. Maps cleanly onto the concierge confirm
 * flow (cf. WinklyPlanOption / ExperienceOption in lib/ai/conciergeClient.ts) for the invite CTAs.
 */
export type WeeklySparkPlan = {
  id: string;
  slot: SparkSlot;
  rank: number;
  title: string;
  fitReason: string;
  placeId: string | null;
  placeName: string | null;
  placeLat: number | null;
  placeLng: number | null;
  startsAt: string | null;
  endsAt: string | null;
  approxPriceCents: number | null;
  currency: string | null;
  bookingUrl: string | null;
  source: SparkSource;
  sponsored: boolean;
  /** From spark_sponsors.disclosure_label when sponsored (e.g. "Partner pick"); null otherwise. */
  sponsorDisclosureLabel: string | null;
  externalRef: string | null;
};

export type WeeklySpark = {
  id: string;
  weekStart: string;
  seenAt: string | null;
  expiresAt: string | null;
  plans: WeeklySparkPlan[];
};

/**
 * Stable per-week id (local), anchored to Monday of the given week — matches the cron's
 * `week_start`. Kept as a pure utility for week-aligned local bookkeeping/analytics.
 */
export function getWeeklySparkWeekKey(now: Date = new Date()): string {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day; // back to Monday
  d.setDate(d.getDate() + diff);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

/** True when the weekend-ideas window is open (legacy helper retained for callers/analytics). */
export function isWeeklySparkAvailable(): boolean {
  return isWeekendIdeasPeriod();
}

type SponsorEmbed = { disclosure_label?: string | null } | { disclosure_label?: string | null }[] | null;

function sponsorLabel(embed: SponsorEmbed): string | null {
  if (!embed) return null;
  const row = Array.isArray(embed) ? embed[0] : embed;
  return row?.disclosure_label ?? null;
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

function mapPlanRow(row: Record<string, unknown>): WeeklySparkPlan {
  return {
    id: String(row.id),
    slot: (row.slot as SparkSlot) ?? "solo",
    rank: typeof row.rank === "number" ? row.rank : 0,
    title: typeof row.title === "string" ? row.title : "",
    fitReason: typeof row.fit_reason === "string" ? row.fit_reason : "",
    placeId: str(row.place_id),
    placeName: str(row.place_name),
    placeLat: num(row.place_lat),
    placeLng: num(row.place_lng),
    startsAt: str(row.starts_at),
    endsAt: str(row.ends_at),
    approxPriceCents: num(row.approx_price_cents),
    currency: str(row.currency),
    bookingUrl: str(row.booking_url),
    source: (row.source as SparkSource) ?? "ai",
    sponsored: row.sponsored === true,
    sponsorDisclosureLabel: sponsorLabel(row.sponsor as SponsorEmbed),
    externalRef: str(row.external_ref),
  };
}

/** Filter keeping only non-expired sparks (expires_at null or in the future). */
function notExpiredFilter(nowIso: string): string {
  return `expires_at.is.null,expires_at.gt.${nowIso}`;
}

/**
 * The current (latest, non-expired) Weekly Spark for the signed-in user, with its plans ordered
 * by slot rank. Returns null when there is no live Spark.
 */
export async function getCurrentWeeklySpark(): Promise<WeeklySpark | null> {
  const nowIso = new Date().toISOString();
  const { data: spark, error } = await supabase
    .from("weekly_sparks")
    .select("id, week_start, seen_at, expires_at")
    .or(notExpiredFilter(nowIso))
    .order("week_start", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !spark) return null;
  const s = spark as { id: string; week_start: string; seen_at: string | null; expires_at: string | null };

  const { data: planRows } = await supabase
    .from("weekly_spark_plans")
    .select(
      "id, slot, rank, title, fit_reason, place_id, place_name, place_lat, place_lng, starts_at, ends_at, approx_price_cents, currency, booking_url, source, sponsored, external_ref, sponsor:spark_sponsors(disclosure_label)",
    )
    .eq("spark_id", s.id)
    .order("rank", { ascending: true });

  const plans = Array.isArray(planRows) ? planRows.map((r) => mapPlanRow(r as Record<string, unknown>)) : [];
  return {
    id: String(s.id),
    weekStart: String(s.week_start),
    seenAt: str(s.seen_at),
    expiresAt: str(s.expires_at),
    plans,
  };
}

/** True when the user has a live Spark they haven't opened yet (drives the Planner-tab badge + nudge). */
export async function hasUnseenWeeklySpark(): Promise<boolean> {
  // Coupled to the SAME source the Planner renders (getCurrentWeeklySpark): unseen + live + has a
  // plan, so the mode-selection nudge / Planner-tab badge can never point at an empty section.
  try {
    const spark = await getCurrentWeeklySpark();
    return !!spark && spark.seenAt == null && spark.plans.length > 0;
  } catch {
    return false;
  }
}

/** Mark the current live Spark as seen (clears the badge). No-op when already seen / none exists. */
export async function markWeeklySparkSeen(): Promise<void> {
  const nowIso = new Date().toISOString();
  // RLS + the column-level grant restrict this to the owner's seen_at only.
  await supabase
    .from("weekly_sparks")
    .update({ seen_at: nowIso })
    .is("seen_at", null)
    .or(notExpiredFilter(nowIso));
}

/** Haversine distance in km between two coordinates (for the card's "X km away"). */
export function distanceKm(originLat: number, originLng: number, destLat: number, destLng: number): number {
  const R = 6371;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(destLat - originLat);
  const dLng = toRad(destLng - originLng);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(originLat)) * Math.cos(toRad(destLat)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
