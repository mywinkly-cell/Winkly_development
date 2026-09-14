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
import { isFutureIso } from "@/lib/ai/planTimeValidation";

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
  /** Places formatted_address (includes city) from verified_places when place_id is set. */
  placeAddress: string | null;
  /** Official Google Maps URL from verified_places when available. */
  googleMapsUrl: string | null;
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

type PlaceEmbed =
  | { formatted_address?: string | null; google_maps_url?: string | null }
  | { formatted_address?: string | null; google_maps_url?: string | null }[]
  | null;

function placeEmbed(embed: PlaceEmbed): { address: string | null; mapsUrl: string | null } {
  if (!embed) return { address: null, mapsUrl: null };
  const row = Array.isArray(embed) ? embed[0] : embed;
  return {
    address: str(row?.formatted_address ?? null),
    mapsUrl: str(row?.google_maps_url ?? null),
  };
}

/**
 * City / locality label from a Places formatted_address (e.g. "…, 82140 Olching, Germany" → "Olching").
 * Used on Spark cards so nearby towns (Olching vs München) are visible before opening details.
 */
export function localityFromAddress(address: string | null | undefined): string | null {
  const { city } = cityCountryFromAddress(address);
  return city;
}

/**
 * Parse Places `formatted_address` into city + country.
 * e.g. "Marienplatz 1, 80331 München, Germany" → { city: "München", country: "Germany" }
 */
export function cityCountryFromAddress(
  address: string | null | undefined,
): { city: string | null; country: string | null } {
  if (!address?.trim()) return { city: null, country: null };
  const parts = address.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return { city: null, country: null };
  if (parts.length === 1) {
    const only = parts[0].replace(/^\d{4,5}\s+/, "").trim();
    return { city: only || null, country: null };
  }
  const country = parts[parts.length - 1] || null;
  const city = parts[parts.length - 2].replace(/^\d{4,5}\s+/, "").trim() || null;
  return { city, country };
}

/** Compact location for cards: "City, Country". */
export function cityCountryDisplayLine(address: string | null | undefined): string | null {
  const { city, country } = cityCountryFromAddress(address);
  if (city && country) return `${city}, ${country}`;
  return city ?? country;
}

/**
 * Card meta line: "[Venue] - [City, Country]".
 * Falls back to venue name or city/country alone when the other is missing.
 */
export function sparkVenueDisplayLine(plan: Pick<WeeklySparkPlan, "placeName" | "placeAddress">): string | null {
  const name = plan.placeName?.trim() || null;
  const cityCountry = cityCountryDisplayLine(plan.placeAddress);
  if (name && cityCountry) return `${name} - ${cityCountry}`;
  if (name) return name;
  return cityCountry ?? plan.placeAddress?.trim() ?? null;
}

/**
 * Details line: "[Venue] - [Street + number, PLZ, City, Country]" (Places formatted_address).
 */
export function sparkVenueFullAddressLine(
  plan: Pick<WeeklySparkPlan, "placeName" | "placeAddress"> | { name?: string | null; address?: string | null },
): string | null {
  const name =
    "placeName" in plan
      ? plan.placeName?.trim() || null
      : plan.name?.trim() || null;
  const address =
    "placeAddress" in plan
      ? plan.placeAddress?.trim() || null
      : plan.address?.trim() || null;
  if (name && address) {
    // Avoid "Name - Name, Street…" when formatted_address already starts with the venue.
    if (address.toLowerCase().startsWith(name.toLowerCase())) return address;
    return `${name} - ${address}`;
  }
  return name ?? address;
}

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

/** Weekly Sparks are available all week (not only Thu–Sun). */
export function isWeeklySparkAvailable(): boolean {
  return true;
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
  const place = placeEmbed(row.place as PlaceEmbed);
  return {
    id: String(row.id),
    slot: (row.slot as SparkSlot) ?? "solo",
    rank: typeof row.rank === "number" ? row.rank : 0,
    title: typeof row.title === "string" ? row.title : "",
    fitReason: typeof row.fit_reason === "string" ? row.fit_reason : "",
    placeId: str(row.place_id),
    placeName: str(row.place_name),
    placeAddress: place.address,
    googleMapsUrl: place.mapsUrl,
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
export async function getCurrentWeeklySpark(now: Date = new Date()): Promise<WeeklySpark | null> {
  const nowIso = now.toISOString();
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
      "id, slot, rank, title, fit_reason, place_id, place_name, place_lat, place_lng, starts_at, ends_at, approx_price_cents, currency, booking_url, source, sponsored, external_ref, sponsor:spark_sponsors(disclosure_label), place:verified_places(formatted_address, google_maps_url)",
    )
    .eq("spark_id", s.id)
    .order("rank", { ascending: true });

  // Never surface a plan whose scheduled start has already passed — e.g. a slot the cron
  // generated for earlier in the week that the user simply hasn't opened yet.
  const plans = Array.isArray(planRows)
    ? planRows.map((r) => mapPlanRow(r as Record<string, unknown>)).filter((p) => isFutureIso(p.startsAt, now))
    : [];
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

export type PlannedSparkPlanInfo = {
  plannerItemId: string;
  title: string;
  description: string | null;
  startsAt: string;
  endsAt: string | null;
  sourceMode: string;
};

/**
 * Weekly Spark plan ids (from the current pack) already added to the user's Planner — keyed by
 * spark plan id (`planner_items.meta.weekly_spark_plan_id`, tagged on add in ConciergeConfirmStep).
 * Drives the card's "View the plan" → "Planned" swap; naturally resets when next Monday's Spark
 * generates fresh plan ids, since the old ids simply stop matching.
 */
export async function getPlannedSparkPlanIds(
  sparkPlanIds: string[],
): Promise<Map<string, PlannedSparkPlanInfo>> {
  const ids = Array.from(new Set(sparkPlanIds.filter(Boolean)));
  const out = new Map<string, PlannedSparkPlanInfo>();
  if (ids.length === 0) return out;

  const { data, error } = await supabase
    .from("planner_items")
    .select("id, title, description, starts_at, ends_at, source_mode, meta")
    .in("meta->>weekly_spark_plan_id", ids);
  if (error || !data) return out;

  for (const row of data as Record<string, unknown>[]) {
    const meta = row.meta as Record<string, unknown> | null;
    const sparkPlanId =
      meta && typeof meta.weekly_spark_plan_id === "string" ? meta.weekly_spark_plan_id : null;
    if (!sparkPlanId || out.has(sparkPlanId)) continue;
    out.set(sparkPlanId, {
      plannerItemId: String(row.id),
      title: typeof row.title === "string" ? row.title : "",
      description: typeof row.description === "string" ? row.description : null,
      startsAt: String(row.starts_at),
      endsAt: row.ends_at ? String(row.ends_at) : null,
      sourceMode: typeof row.source_mode === "string" ? row.source_mode : "events",
    });
  }
  return out;
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
