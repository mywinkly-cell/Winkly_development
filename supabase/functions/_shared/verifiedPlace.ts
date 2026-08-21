// _shared/verifiedPlace.ts
// Shared Google Places verification + cache. Single source of truth for venue facts
// used by both weekly-spark-cron and ai-gateway grounding.
//
// Why a cache: the Spark cron runs weekly × 3 plans × every active user, and most
// users in a city map to the SAME pool of real venues. We verify each place ONCE
// per TTL window (Text Search → Place Details), persist it in `verified_places`,
// and reuse the cached row for every other user that week — no repeat Places calls.
//
// The AI never authors venue facts: callers resolve + validate a place here, then
// read name/address/hours/price/booking_url straight from the verified row.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

/** Google Places opening_hours, augmented with utc_offset_minutes so isOpenAt can
 *  compute the venue's local wall-clock without a separate timezone lookup. */
export type PlacesOpeningHours = {
  open_now?: boolean;
  periods?: Array<{
    open?: { day: number; time: string };
    close?: { day: number; time: string };
  }>;
  weekday_text?: string[];
  /** Minutes east of UTC for the venue (persisted alongside the raw hours). */
  utc_offset_minutes?: number;
};

export type VerifiedPlace = {
  place_id: string;
  name: string;
  formatted_address: string | null;
  lat: number | null;
  lng: number | null;
  business_status: string | null;
  opening_hours: PlacesOpeningHours | null;
  website: string | null;
  google_maps_url: string | null;
  price_level: number | null;
  last_verified_at: string;
  source: string;
};

const PLACES_TEXTSEARCH = "https://maps.googleapis.com/maps/api/place/textsearch/json";
const PLACES_DETAILS = "https://maps.googleapis.com/maps/api/place/details/json";
// Legacy Place Details fields. NOTE: the legacy endpoint uses `utc_offset` (minutes), NOT the
// Places-API-New name `utc_offset_minutes` — requesting the latter here returns INVALID_REQUEST.
const DETAILS_FIELDS =
  "place_id,name,formatted_address,geometry,business_status,opening_hours,website,url,price_level,utc_offset";
const DEFAULT_TTL_DAYS = 7;

type CacheRow = Record<string, unknown>;

function rowToVerifiedPlace(row: CacheRow): VerifiedPlace {
  return {
    place_id: String(row.place_id),
    name: typeof row.name === "string" ? row.name : "",
    formatted_address: (row.formatted_address as string | null) ?? null,
    lat: typeof row.lat === "number" ? row.lat : null,
    lng: typeof row.lng === "number" ? row.lng : null,
    business_status: (row.business_status as string | null) ?? null,
    opening_hours: (row.opening_hours as PlacesOpeningHours | null) ?? null,
    website: (row.website as string | null) ?? null,
    google_maps_url: (row.google_maps_url as string | null) ?? null,
    price_level: typeof row.price_level === "number" ? row.price_level : null,
    last_verified_at: String(row.last_verified_at ?? ""),
    source: typeof row.source === "string" ? row.source : "google_places",
  };
}

function isFresh(lastVerifiedAt: string, ttlDays: number): boolean {
  const ts = Date.parse(lastVerifiedAt);
  if (Number.isNaN(ts)) return false;
  return Date.now() - ts < ttlDays * 24 * 60 * 60 * 1000;
}

/**
 * Google Places Text Search → candidate place_ids (best first).
 * Memoized via an optional per-run `queryCache` so two users resolving the SAME
 * query in one cron run incur only ONE Text Search call.
 */
export async function searchPlaceIds(opts: {
  query: string;
  placesKey?: string | null;
  limit?: number;
  /** Optional in-memory memo (normalized query → ordered place_ids) for a single run. */
  queryCache?: Map<string, string[]>;
  /** Bias results near the user (small towns otherwise return ZERO_RESULTS for niche queries). */
  lat?: number | null;
  lng?: number | null;
  /** Meters; Google Text Search max is 50_000. Default 40km. */
  radiusMeters?: number;
}): Promise<string[]> {
  const query = opts.query.trim();
  if (!query || !opts.placesKey) return [];
  const limit = opts.limit ?? 5;
  const hasLoc =
    typeof opts.lat === "number" && Number.isFinite(opts.lat) &&
    typeof opts.lng === "number" && Number.isFinite(opts.lng);
  const radius = Math.max(1000, Math.min(50_000, opts.radiusMeters ?? 40_000));
  const cacheKey = hasLoc
    ? `${query.toLowerCase()}@${opts.lat!.toFixed(2)},${opts.lng!.toFixed(2)},r${radius}`
    : query.toLowerCase();

  const memo = opts.queryCache?.get(cacheKey);
  if (memo) return memo.slice(0, limit);

  try {
    const params = new URLSearchParams({
      query: query.slice(0, 280),
      key: opts.placesKey,
    });
    if (hasLoc) {
      params.set("location", `${opts.lat},${opts.lng}`);
      params.set("radius", String(radius));
    }
    const url = `${PLACES_TEXTSEARCH}?${params.toString()}`;
    const res = await fetch(url);
    const data = (await res.json()) as {
      status?: string;
      error_message?: string;
      results?: Array<Record<string, unknown>>;
    };
    if (data.status && data.status !== "OK" && data.status !== "ZERO_RESULTS") {
      console.warn(
        `[verifiedPlace] Text Search status=${data.status}` +
          (data.error_message ? ` error=${data.error_message}` : ""),
      );
    }
    const ids =
      data.status === "OK" && Array.isArray(data.results)
        ? data.results
            .map((r) => (typeof r.place_id === "string" ? r.place_id : null))
            .filter((x): x is string => !!x)
        : [];
    opts.queryCache?.set(cacheKey, ids);
    return ids.slice(0, limit);
  } catch (e) {
    console.warn("[verifiedPlace] Text Search failed:", e);
    opts.queryCache?.set(cacheKey, []);
    return [];
  }
}

/** Place Details → a VerifiedPlace; upserts the cache row. Returns null on failure. */
async function fetchAndCacheDetails(
  supabase: SupabaseClient,
  placeId: string,
  placesKey: string,
): Promise<VerifiedPlace | null> {
  try {
    const url =
      `${PLACES_DETAILS}?place_id=${encodeURIComponent(placeId)}&fields=${encodeURIComponent(DETAILS_FIELDS)}&key=${encodeURIComponent(placesKey)}`;
    const res = await fetch(url);
    const data = (await res.json()) as { status?: string; result?: Record<string, unknown> };
    if (data.status !== "OK" || !data.result) return null;
    const r = data.result;

    const geometry = r.geometry as { location?: { lat?: number; lng?: number } } | undefined;
    const rawHours = (r.opening_hours as PlacesOpeningHours | undefined) ?? null;
    const utcOffset =
      typeof r.utc_offset_minutes === "number"
        ? r.utc_offset_minutes
        : typeof r.utc_offset === "number"
          ? (r.utc_offset as number)
          : undefined;
    // Persist utc_offset_minutes inside the hours JSON so isOpenAt is self-contained.
    const opening_hours: PlacesOpeningHours | null = rawHours
      ? { ...rawHours, ...(utcOffset !== undefined ? { utc_offset_minutes: utcOffset } : {}) }
      : utcOffset !== undefined
        ? { utc_offset_minutes: utcOffset }
        : null;

    const website = typeof r.website === "string" ? r.website.slice(0, 600) : null;
    const mapsUrl = typeof r.url === "string" ? r.url.slice(0, 600) : null;

    const verified: VerifiedPlace = {
      place_id: typeof r.place_id === "string" ? r.place_id : placeId,
      name: typeof r.name === "string" ? r.name : "",
      formatted_address: typeof r.formatted_address === "string" ? r.formatted_address : null,
      lat: typeof geometry?.location?.lat === "number" ? geometry.location.lat : null,
      lng: typeof geometry?.location?.lng === "number" ? geometry.location.lng : null,
      business_status: typeof r.business_status === "string" ? r.business_status : null,
      opening_hours,
      website,
      google_maps_url: mapsUrl ?? `https://www.google.com/maps/place/?q=place_id:${placeId}`,
      price_level: typeof r.price_level === "number" ? r.price_level : null,
      last_verified_at: new Date().toISOString(),
      source: "google_places",
    };

    const { error } = await supabase.from("verified_places").upsert(
      {
        place_id: verified.place_id,
        name: verified.name,
        formatted_address: verified.formatted_address,
        lat: verified.lat,
        lng: verified.lng,
        business_status: verified.business_status,
        opening_hours: verified.opening_hours,
        website: verified.website,
        google_maps_url: verified.google_maps_url,
        price_level: verified.price_level,
        last_verified_at: verified.last_verified_at,
        source: verified.source,
      },
      { onConflict: "place_id" },
    );
    if (error) console.warn("[verifiedPlace] cache upsert failed:", error.message);

    return verified;
  } catch (e) {
    console.warn("[verifiedPlace] Place Details failed:", e);
    return null;
  }
}

/**
 * Resolve a single real place and return its verified facts, cache-first.
 *
 *  1. Look up `verified_places` by place_id; if fresh (within TTL) → return cached
 *     row with NO Places call.
 *  2. On miss/stale → Places (Text Search when only `query` is given → place_id,
 *     then Place Details), upsert with a fresh last_verified_at, return it.
 *  3. Without a Places key → return a cached row if one exists, else null. (Callers
 *     that must never degrade — e.g. the Spark cron — assert the key up front.)
 */
export async function resolveVerifiedPlace(
  supabase: SupabaseClient,
  opts: {
    placeId?: string;
    query?: string;
    ttlDays?: number;
    placesKey?: string | null;
    queryCache?: Map<string, string[]>;
    /** Bias Text Search near the user (helps small towns / niche themes). */
    lat?: number | null;
    lng?: number | null;
    radiusMeters?: number;
  },
): Promise<VerifiedPlace | null> {
  const ttlDays = opts.ttlDays ?? DEFAULT_TTL_DAYS;
  let placeId = opts.placeId?.trim() || undefined;

  // Resolve a place_id from a free-text query when we don't have one yet.
  if (!placeId && opts.query) {
    const ids = await searchPlaceIds({
      query: opts.query,
      placesKey: opts.placesKey,
      limit: 1,
      queryCache: opts.queryCache,
      lat: opts.lat,
      lng: opts.lng,
      radiusMeters: opts.radiusMeters,
    });
    placeId = ids[0];
  }
  if (!placeId) return null;

  // 1. Cache-first.
  const { data: cached } = await supabase
    .from("verified_places")
    .select("*")
    .eq("place_id", placeId)
    .maybeSingle();
  if (cached) {
    const row = rowToVerifiedPlace(cached as CacheRow);
    if (isFresh(row.last_verified_at, ttlDays)) return row;
    // Stale: refresh only if we can; otherwise serve the stale row.
    if (!opts.placesKey) return row;
  } else if (!opts.placesKey) {
    return null;
  }

  // 2. Miss or stale → verify + cache.
  return await fetchAndCacheDetails(supabase, placeId, opts.placesKey as string);
}

function hhmmToMinutes(time: string | undefined): number | null {
  if (!time || !/^\d{4}$/.test(time)) return null;
  const h = Number(time.slice(0, 2));
  const m = Number(time.slice(2, 4));
  if (h > 23 || m > 59) return null;
  return h * 60 + m;
}

/**
 * True only if the venue is OPERATIONAL and its opening_hours actually cover the
 * proposed start time (in the venue's local wall-clock). Fail-closed: unknown
 * status or missing/uncomputable hours → false (the caller discards the candidate).
 */
export function isOpenAt(place: Pick<VerifiedPlace, "business_status" | "opening_hours">, startsAtISO: string): boolean {
  if (place.business_status !== "OPERATIONAL") return false;
  const oh = place.opening_hours;
  const periods = oh?.periods;
  if (!Array.isArray(periods) || periods.length === 0) return false;

  const startMs = Date.parse(startsAtISO);
  if (Number.isNaN(startMs)) return false;

  const offsetMin = typeof oh?.utc_offset_minutes === "number" ? oh.utc_offset_minutes : null;
  if (offsetMin === null) return false; // can't localize → fail closed

  // Shift into venue-local wall-clock, then read day/time via UTC getters.
  const local = new Date(startMs + offsetMin * 60 * 1000);
  const point = local.getUTCDay() * 1440 + local.getUTCHours() * 60 + local.getUTCMinutes();
  const WEEK = 7 * 1440;

  for (const p of periods) {
    const openMin = hhmmToMinutes(p.open?.time);
    if (p.open?.day === undefined || openMin === null) continue;
    const openAbs = p.open.day * 1440 + openMin;
    // Google convention: a 24/7 venue is a single period with open day 0, time 0000, no close.
    if (!p.close) return true;
    const closeMin = hhmmToMinutes(p.close.time);
    if (p.close.day === undefined || closeMin === null) continue;
    let closeAbs = p.close.day * 1440 + closeMin;
    if (closeAbs <= openAbs) closeAbs += WEEK; // overnight / week wrap
    if ((point >= openAbs && point < closeAbs) || (point + WEEK >= openAbs && point + WEEK < closeAbs)) {
      return true;
    }
  }
  return false;
}

/** Rough per-person spend estimate from Google's 0–4 price_level, in minor units. */
export function priceLevelToCents(priceLevel: number | null | undefined, _currency = "EUR"): number | null {
  if (priceLevel === null || priceLevel === undefined) return null;
  // Midpoints of typical per-person bands: 0 free, 1 ~€8, 2 ~€20, 3 ~€45, 4 ~€90.
  const bands = [0, 800, 2000, 4500, 9000];
  const idx = Math.max(0, Math.min(4, Math.round(priceLevel)));
  return bands[idx];
}
