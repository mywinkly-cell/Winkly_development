/**
 * weekly-spark-cron — generate each active user's 3 Weekly Spark plans (SOLO / DATE / MEETUP).
 *
 * Invocation: Supabase scheduled trigger (pg_cron, see the weekly-spark cron migration) with
 * header `x-cron-secret`. Runs weekly with the service role.
 *
 * TRUST MODEL (non-negotiable):
 * - The AI only SELECTS a candidate and writes the personalized `fit_reason`. It NEVER authors
 *   venue facts (name/address/hours/price/link). Those come 100% from `resolveVerifiedPlace`
 *   (Google Places, cached in `verified_places`) or from real `get-nearby-external-events` listings.
 * - FAIL CLOSED: if GOOGLE_PLACES_API_KEY (or GOOGLE_MAPS_API_KEY) is unset, the run produces NO
 *   Spark and logs a clear error — it must never fall back to model-from-memory venues.
 * - VALIDATION GATE before persist: resolved place_id + real address + business_status OPERATIONAL
 *   + opening_hours covering the proposed **local** start time (events: future time + real ticket URL).
 *   Slot times are city-local wall-clock (via Open-Meteo utc offset), not UTC. Otherwise the
 *   candidate is discarded; if a slot can't be filled it is skipped (better 2 great than 3 with a dud).
 * - Places Text Search is biased with the user's lat/lng (40km) so small towns still get nearby metros.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, withCorsEmpty } from "../_shared/cors.ts";
import { cronSecretOk } from "../_shared/timingSafeEqual.ts";
import {
  resolveVerifiedPlace,
  searchPlaceIds,
  isOpenAt,
  priceLevelToCents,
  type VerifiedPlace,
} from "../_shared/verifiedPlace.ts";

/** Keep in sync with ai-gateway GEMINI_MODEL_PLAN (docs: gemini-2.0 shut down 2026-06-01). */
const GEMINI_MODEL_PLAN = Deno.env.get("GEMINI_MODEL_PLAN") ?? "gemini-3.5-flash";
/** Sponsorship rails: OFF at launch. Even when enabled, a sponsored plan must pass the SAME
 *  validation gate as an organic one (sponsorship buys eligibility, not a quality bypass). No
 *  sponsored inventory is wired yet, so the cron emits 100% organic plans regardless of this flag. */
const SPARK_SPONSORED_ENABLED = (Deno.env.get("SPARK_SPONSORED_ENABLED") ?? "false") === "true";
const SPARK_TTL_DAYS = 7;
const SPARK_CURRENCY = "EUR";
/** Cap users per invocation to stay within edge-function time budget. Shard for larger bases. */
const MAX_USERS = Number(Deno.env.get("SPARK_MAX_USERS") ?? 150);
const USER_BATCH = 50;

type Slot = "solo" | "date" | "meetup";
const SLOTS: Slot[] = ["solo", "date", "meetup"];

/** Seed Munich anchor CATEGORIES used ONLY as Places/event search queries — never pre-written plans. */
const SLOT_SEED_QUERIES: Record<Slot, string[]> = {
  solo: ["specialty coffee", "art museum", "city park", "independent bookshop café"],
  date: ["wine bar", "romantic restaurant", "rooftop bar", "cocktail bar"],
  meetup: ["beer garden", "bowling alley", "board game café", "brewery taproom"],
};

type ProfileTier = "rich" | "partial" | "thin";

type UserSignals = {
  userId: string;
  city: string | null;
  lat: number | null;
  lng: number | null;
  languages: string[];
  interests: string[];
  activityPreferences: string[];
  modes: string[];
  /**
   * Places the user explicitly saved and hasn't been to yet. The strongest signal
   * available — an interest is inferred, a wish is stated. Saved places with a
   * place_id are tried first when gathering candidates; free-text saves feed the
   * search queries. Visited and archived entries are excluded so a fulfilled wish
   * is not suggested again.
   */
  wishlistPlaceIds: string[];
  wishlistTitles: string[];
};

type SparkCandidatePlan = {
  slot: Slot;
  title: string;
  fitReason: string;
  placeId: string | null;
  placeName: string | null;
  placeLat: number | null;
  placeLng: number | null;
  startsAt: string;
  endsAt: string | null;
  approxPriceCents: number | null;
  currency: string | null;
  bookingUrl: string | null;
  source: "ai" | "winkly_event" | "sponsored";
  externalRef: string | null;
};

type ExternalEvent = {
  id: string;
  title: string;
  startAt: string;
  endAt?: string | null;
  location?: string | null;
  venueName?: string | null;
  externalUrl?: string | null;
  externalPlatform?: string;
  category?: string | null;
};

function getPlacesKey(): string | null {
  return Deno.env.get("GOOGLE_PLACES_API_KEY") ?? Deno.env.get("GOOGLE_MAPS_API_KEY") ?? null;
}

// Startup assertion (logs at module load). The handler also returns 503 below; we log rather than
// throw-at-boot to avoid a crash loop, but generation is fully gated on the key being present.
if (!getPlacesKey()) {
  console.error(
    "[weekly-spark-cron] STARTUP: GOOGLE_PLACES_API_KEY is unset. Weekly Spark will FAIL CLOSED (no Spark) until it is set.",
  );
}

function jsonResponse(req: Request, status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...Object.fromEntries(corsHeaders(req)) },
  });
}

/** Monday (UTC) of the week containing `d`, as YYYY-MM-DD. */
function mondayUTC(d: Date): string {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dow = x.getUTCDay(); // 0=Sun
  const diff = dow === 0 ? -6 : 1 - dow;
  x.setUTCDate(x.getUTCDate() + diff);
  return x.toISOString().slice(0, 10);
}

/**
 * ISO timestamp for the next occurrence of `dow` (0=Sun) at local hour:min.
 * `utcOffsetMinutes` is minutes east of UTC for the user's city (e.g. Munich CEST = 120).
 * Interpreting hour/minute as UTC made evening Sparks land after local closing time
 * (19:30 UTC → 21:30 in Munich) and the hours gate discarded every candidate.
 */
function nextSlotTime(dow: number, hour: number, minute: number, utcOffsetMinutes = 0): string {
  const now = new Date();
  const offsetMs = utcOffsetMinutes * 60 * 1000;
  // Shift into "local-as-UTC" space so getUTC* reads local wall-clock components.
  const nowLocalMs = now.getTime() + offsetMs;
  const nowLocal = new Date(nowLocalMs);
  const localDow = nowLocal.getUTCDay();
  let candLocalMs = Date.UTC(
    nowLocal.getUTCFullYear(),
    nowLocal.getUTCMonth(),
    nowLocal.getUTCDate(),
    hour,
    minute,
    0,
  );
  let delta = (dow - localDow + 7) % 7;
  if (delta === 0 && candLocalMs <= nowLocalMs) delta = 7;
  candLocalMs += delta * 24 * 60 * 60 * 1000;
  return new Date(candLocalMs - offsetMs).toISOString();
}

/**
 * Candidate start times per slot — local wall-clock, spread across the week.
 * Multiple alternatives per slot so the opening-hours gate has room to succeed.
 * Follows Winkly's default timing rule: work days stay in the evening, daytime/morning ideas are
 * offered at the weekend only (the app lets users widen these windows in Spark settings).
 */
function slotTimes(slot: Slot, utcOffsetMinutes = 0): string[] {
  const t = (dow: number, hour: number, minute: number) => nextSlotTime(dow, hour, minute, utcOffsetMinutes);
  if (slot === "solo") {
    return [t(6, 11, 0), t(0, 11, 0), t(6, 15, 0), t(3, 18, 30)]; // Sat/Sun morning, Sat afternoon, Wed evening
  }
  if (slot === "date") {
    return [t(2, 19, 0), t(5, 19, 30), t(6, 18, 30), t(4, 19, 0)]; // Tue/Fri/Sat/Thu evening
  }
  return [t(4, 18, 0), t(6, 16, 0), t(5, 17, 30), t(3, 18, 0)]; // meetup: Thu evening, Sat afternoon, Fri/Wed evening
}

/** Best-effort UTC offset for the user's city (Open-Meteo). Falls back to 0 (UTC). */
async function resolveUtcOffsetMinutes(lat: number | null, lng: number | null): Promise<number> {
  if (lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) return 0;
  try {
    const url = new URL("https://api.open-meteo.com/v1/forecast");
    url.searchParams.set("latitude", String(lat));
    url.searchParams.set("longitude", String(lng));
    url.searchParams.set("current", "temperature_2m");
    url.searchParams.set("timezone", "auto");
    const res = await fetch(url.toString());
    if (!res.ok) return 0;
    const data = (await res.json()) as { utc_offset_seconds?: number };
    if (typeof data.utc_offset_seconds !== "number" || !Number.isFinite(data.utc_offset_seconds)) return 0;
    return Math.round(data.utc_offset_seconds / 60);
  } catch {
    return 0;
  }
}

async function geocodeCity(city: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const url = new URL("https://geocoding-api.open-meteo.com/v1/search");
    url.searchParams.set("name", city);
    url.searchParams.set("count", "1");
    const res = await fetch(url.toString());
    if (!res.ok) return null;
    const data = (await res.json()) as { results?: Array<{ latitude: number; longitude: number }> };
    const r = data.results?.[0];
    return r ? { lat: r.latitude, lng: r.longitude } : null;
  } catch {
    return null;
  }
}

async function reverseGeocodeCity(lat: number, lng: number): Promise<string | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&zoom=10`;
    const res = await fetch(url, { headers: { "User-Agent": "WinklyApp/1.0 (weekly-spark-cron; https://mywinkly.de)" } });
    if (!res.ok) return null;
    const data = (await res.json()) as { address?: Record<string, string> };
    const a = data.address ?? {};
    return a.city ?? a.town ?? a.village ?? a.municipality ?? a.county ?? null;
  } catch {
    return null;
  }
}

function computeTier(s: UserSignals): ProfileTier {
  const richSignals =
    s.interests.length + s.activityPreferences.length + (s.languages.length > 0 ? 1 : 0);
  if (s.interests.length >= 3 || richSignals >= 4) return "rich";
  if (richSignals >= 1) return "partial";
  return "thin";
}

/** One missing preference to request this week (rotates so by ~week 3 the user is RICH). */
function nudgeForThisWeek(): string {
  const opts = ["budget band", "favourite cuisine", "preferred area", "languages you speak"];
  const week = Math.floor(Date.now() / (7 * 24 * 60 * 60 * 1000));
  return opts[week % opts.length];
}

/** Map a free-text interest to a Places search noun (best-effort; empty when no clear mapping). */
function interestToQuery(interest: string, slot: Slot): string | null {
  const t = interest.toLowerCase();
  if (/coffee|cafe|café/.test(t)) return "specialty coffee";
  if (/wine|tasting/.test(t)) return "wine bar";
  if (/art|museum|gallery/.test(t)) return slot === "date" ? "art gallery" : "art museum";
  if (/music|jazz|concert|live/.test(t)) return "live music venue";
  if (/food|dinner|restaurant|foodie/.test(t)) return slot === "date" ? "romantic restaurant" : "popular restaurant";
  if (/hike|outdoor|nature|park|walk/.test(t)) return "city park";
  if (/board game|game|bowling|arcade/.test(t)) return "board game café";
  if (/beer|brew/.test(t)) return "beer garden";
  return null;
}

/**
 * Build the ordered query list for a slot: interest-derived first, then seed categories.
 * When lat/lng bias is available we search the bare category ("wine bar") so nearby
 * metros fill in for small towns; otherwise append the city label as before.
 */
function slotQueries(slot: Slot, s: UserSignals, cityLabel: string, hasLocationBias: boolean): string[] {
  const derived = [...s.interests, ...s.activityPreferences]
    .map((i) => interestToQuery(i, slot))
    .filter((x): x is string => !!x);
  // Free-text wishlist saves ("that rooftop place in Schwabing") are searched
  // verbatim and ahead of inferred interests — the user typed them for a reason.
  const wished = s.wishlistTitles.slice(0, 3).map((t) => t.trim()).filter(Boolean);
  const merged = [...wished, ...derived, ...SLOT_SEED_QUERIES[slot]];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const q of merged) {
    const key = q.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    // Wishlist free-text keeps the city so "rooftop Schwabing" stays specific.
    const isWish = wished.some((w) => w.toLowerCase() === key);
    out.push(hasLocationBias && !isWish ? q.trim() : `${q} ${cityLabel}`.trim());
  }
  return out.slice(0, 4);
}

/** Gather up to `want` verified, currently-relevant venue candidates for a slot. */
async function gatherVerifiedCandidates(
  supabase: SupabaseClient,
  params: {
    slot: Slot;
    signals: UserSignals;
    cityLabel: string;
    placesKey: string;
    queryCache: Map<string, string[]>;
    want: number;
    lat?: number | null;
    lng?: number | null;
  },
): Promise<VerifiedPlace[]> {
  const out: VerifiedPlace[] = [];
  const seen = new Set<string>();
  const hasLocationBias =
    typeof params.lat === "number" && Number.isFinite(params.lat) &&
    typeof params.lng === "number" && Number.isFinite(params.lng);

  // Saved places first. They still go through resolveVerifiedPlace, so a wish
  // only becomes a suggestion if the venue is operational, has a real address
  // and is open at the proposed time — the same gate every other candidate
  // passes. A wish is a preference, not a licence to skip verification.
  for (const placeId of params.signals.wishlistPlaceIds) {
    if (out.length >= params.want) break;
    if (seen.has(placeId)) continue;
    seen.add(placeId);
    const place = await resolveVerifiedPlace(supabase, {
      placeId,
      placesKey: params.placesKey,
      ttlDays: SPARK_TTL_DAYS,
    });
    if (place && place.name && place.formatted_address) out.push(place);
  }

  for (const query of slotQueries(params.slot, params.signals, params.cityLabel, hasLocationBias)) {
    if (out.length >= params.want) break;
    const ids = await searchPlaceIds({
      query,
      placesKey: params.placesKey,
      limit: 3,
      queryCache: params.queryCache,
      lat: params.lat,
      lng: params.lng,
    });
    for (const id of ids) {
      if (out.length >= params.want) break;
      if (seen.has(id)) continue;
      seen.add(id);
      const place = await resolveVerifiedPlace(supabase, { placeId: id, placesKey: params.placesKey, ttlDays: SPARK_TTL_DAYS });
      if (place && place.name && place.formatted_address) out.push(place);
    }
  }
  return out;
}

/**
 * Unvisited, unarchived wishlist saves for one user.
 *
 * Runs with the service role, so it deliberately filters by user_id rather than
 * relying on RLS. Best-effort: a wishlist read failure must never stop the whole
 * Spark from generating — the user just gets interest-based suggestions instead.
 */
async function fetchWishlistSignals(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ placeIds: string[]; titles: string[] }> {
  try {
    const { data, error } = await supabase
      .from("wishlist_items")
      .select("title, place_id")
      .eq("user_id", userId)
      .is("visited_at", null)
      .is("archived_at", null)
      .order("updated_at", { ascending: false })
      .limit(12);

    if (error || !Array.isArray(data)) return { placeIds: [], titles: [] };

    const placeIds: string[] = [];
    const titles: string[] = [];
    for (const row of data as Array<{ title?: string; place_id?: string | null }>) {
      if (typeof row.place_id === "string" && row.place_id.trim()) {
        placeIds.push(row.place_id.trim());
      } else if (typeof row.title === "string" && row.title.trim()) {
        titles.push(row.title.trim());
      }
    }
    return { placeIds: placeIds.slice(0, 6), titles: titles.slice(0, 6) };
  } catch {
    return { placeIds: [], titles: [] };
  }
}

/** First (candidate, startsAt) pair that passes the venue validation gate, or null. */
function pickValidVenue(candidates: VerifiedPlace[], times: string[]): { place: VerifiedPlace; startsAt: string } | null {
  for (const startsAt of times) {
    for (const place of candidates) {
      if (place.business_status === "OPERATIONAL" && place.formatted_address && isOpenAt(place, startsAt)) {
        return { place, startsAt };
      }
    }
  }
  return null;
}

async function fetchEvents(params: {
  supabaseUrl: string;
  serviceKey: string;
  lat: number;
  lng: number;
}): Promise<ExternalEvent[]> {
  try {
    const from = new Date().toISOString();
    const to = new Date(Date.now() + 8 * 24 * 60 * 60 * 1000).toISOString();
    const res = await fetch(`${params.supabaseUrl.replace(/\/$/, "")}/functions/v1/get-nearby-external-events`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${params.serviceKey}` },
      body: JSON.stringify({ latitude: params.lat, longitude: params.lng, radius_km: 25, from, to }),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { events?: ExternalEvent[] };
    return Array.isArray(data.events) ? data.events : [];
  } catch {
    return [];
  }
}

/** Validation gate for an event-slot plan: real future start + a real ticket/detail URL. */
function pickValidEvent(events: ExternalEvent[]): ExternalEvent | null {
  const now = Date.now();
  for (const ev of events) {
    const ts = Date.parse(ev.startAt);
    const url = ev.externalUrl ?? "";
    if (!Number.isNaN(ts) && ts > now && /^https?:\/\//i.test(url) && ev.title) return ev;
  }
  return null;
}

type SelectionInput = {
  slot: Slot;
  tier: ProfileTier;
  outputLanguage: string;
  nudgeFor: string;
  signals: { interests: string[]; activityPreferences: string[]; languages: string[]; city: string | null; modes: string[] };
  candidates: Array<{ index: number; name: string; address: string; price_level: number | null }>;
};

type SelectionOutput = { chosen_index: number; title: string; fit_reason: string };

function parseModelJson(text: string): SelectionOutput | null {
  let raw = text.trim();
  const block = raw.match(/^```(?:json)?\s*([\s\S]*?)```$/);
  if (block) raw = block[1].trim();
  try {
    const parsed = JSON.parse(raw) as Partial<SelectionOutput>;
    if (typeof parsed.chosen_index !== "number" || typeof parsed.title !== "string" || typeof parsed.fit_reason !== "string") {
      return null;
    }
    return { chosen_index: parsed.chosen_index, title: parsed.title, fit_reason: parsed.fit_reason };
  } catch {
    return null;
  }
}

const TIER_RULES: Record<ProfileTier, string> = {
  rich: "RICH profile: write a personal reason citing the user's REAL signals (interests/area/language). Be specific.",
  partial: "PARTIAL profile: cite ONLY what is actually known (e.g. neighbourhood or language). Do not invent preferences.",
  thin: "THIN profile (cold start): an honest, welcoming reason (e.g. 'A Munich favourite to start you off') PLUS a short enrichment nudge asking the user to share their {NUDGE} so next week's picks get sharper. NEVER claim a preference the user never gave.",
};

async function selectWithGemini(geminiKey: string, input: SelectionInput): Promise<SelectionOutput | null> {
  const tierRule = TIER_RULES[input.tier].replace("{NUDGE}", input.nudgeFor);
  const system = `You are Winkly's Weekly Spark selector. You are given REAL, already-verified venue candidates and the user's REAL signals.
Your ONLY job: pick the single best candidate for the "${input.slot}" slot and write a short, honest "fit_reason".
HARD RULES:
- Choose exactly one candidate by its index from CANDIDATES.
- NEVER invent or alter venue facts (name/address/hours/price/links). Use only what is provided.
- ${tierRule}
- Write the title and fit_reason in this language: ${input.outputLanguage}.
- title <= 60 chars; fit_reason <= 160 chars. No emojis.
Respond with valid JSON only: {"chosen_index": <number>, "title": "<string>", "fit_reason": "<string>"}`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL_PLAN}:generateContent?key=${encodeURIComponent(geminiKey)}`;
  const payload = {
    slot: input.slot,
    tier: input.tier,
    user_signals: input.signals,
    candidates: input.candidates,
  };
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: JSON.stringify(payload) }] }],
        // thinkingConfig: Gemini 3.x flash "thinking" tokens count against
        // maxOutputTokens; without a zero budget they can consume all 512 tokens
        // and truncate the JSON (finishReason MAX_TOKENS), losing the pick.
        generationConfig: {
          temperature: 0.5,
          maxOutputTokens: 512,
          responseMimeType: "application/json",
          thinkingConfig: { thinkingBudget: 0 },
        },
      }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    const parsed = parseModelJson(text);
    if (!parsed) return null;
    if (parsed.chosen_index < 0 || parsed.chosen_index >= input.candidates.length) parsed.chosen_index = 0;
    return parsed;
  } catch {
    return null;
  }
}

/** Deterministic, honest fallback when no Gemini key / model failure. Never fabricates a preference. */
function fallbackSelection(slot: Slot, tier: ProfileTier, signals: UserSignals, name: string, nudgeFor: string): SelectionOutput {
  const area = signals.city ?? "your area";
  const slotTitle = slot === "solo" ? "A little time for you" : slot === "date" ? "A date worth saying yes to" : "Round up the group";
  let reason: string;
  if (tier === "rich" && signals.interests.length) {
    reason = `${name} in ${area} — picked for your interest in ${signals.interests.slice(0, 2).join(" & ")}.`;
  } else if (tier === "partial") {
    reason = `${name} — a solid pick in ${area} that fits what we know so far.`;
  } else {
    reason = `${name}, a ${area} favourite to start you off. Tell us your ${nudgeFor} and next week's picks get sharper.`;
  }
  return { chosen_index: 0, title: slotTitle, fit_reason: reason.slice(0, 160) };
}

/** Build one verified-venue plan for solo/date (and meetup fallback). */
async function buildVenuePlan(
  supabase: SupabaseClient,
  ctx: {
    slot: Slot;
    signals: UserSignals;
    tier: ProfileTier;
    cityLabel: string;
    placesKey: string;
    geminiKey: string | null;
    queryCache: Map<string, string[]>;
    nudgeFor: string;
    lat?: number | null;
    lng?: number | null;
    utcOffsetMinutes?: number;
  },
): Promise<SparkCandidatePlan | null> {
  const candidates = await gatherVerifiedCandidates(supabase, {
    slot: ctx.slot,
    signals: ctx.signals,
    cityLabel: ctx.cityLabel,
    placesKey: ctx.placesKey,
    queryCache: ctx.queryCache,
    want: 6,
    lat: ctx.lat,
    lng: ctx.lng,
  });
  if (candidates.length === 0) return null;

  // Prefer the venue's own Places utc_offset when available (more reliable than Open-Meteo).
  let offset = ctx.utcOffsetMinutes ?? 0;
  for (const c of candidates) {
    const o = c.opening_hours?.utc_offset_minutes;
    if (typeof o === "number" && Number.isFinite(o)) { offset = o; break; }
  }

  const valid = pickValidVenue(candidates, slotTimes(ctx.slot, offset));
  if (!valid) return null;

  // Offer the model the venues that PASSED the gate (the chosen one is guaranteed valid).
  const validList = candidates.filter(
    (c) => c.business_status === "OPERATIONAL" && c.formatted_address && isOpenAt(c, valid.startsAt),
  );
  const ordered = [valid.place, ...validList.filter((c) => c.place_id !== valid.place.place_id)];

  const outputLanguage = ctx.signals.languages[0] || "English";
  let selection: SelectionOutput | null = null;
  if (ctx.geminiKey) {
    selection = await selectWithGemini(ctx.geminiKey, {
      slot: ctx.slot,
      tier: ctx.tier,
      outputLanguage,
      nudgeFor: ctx.nudgeFor,
      signals: {
        interests: ctx.signals.interests,
        activityPreferences: ctx.signals.activityPreferences,
        languages: ctx.signals.languages,
        city: ctx.signals.city,
        modes: ctx.signals.modes,
      },
      candidates: ordered.map((c, i) => ({ index: i, name: c.name, address: c.formatted_address ?? "", price_level: c.price_level })),
    });
  }
  const chosen = selection ? ordered[selection.chosen_index] ?? valid.place : valid.place;
  // Every candidate in `ordered` already passed the gate at valid.startsAt, so the model's pick is
  // valid too. Defence in depth: if anything is off, fall back to the guaranteed-valid venue with a
  // fresh fallback reason (never reuse the model's reason, which named a different place).
  if (chosen.business_status === "OPERATIONAL" && chosen.formatted_address && isOpenAt(chosen, valid.startsAt)) {
    return finalizeVenuePlan(ctx.slot, ctx.tier, ctx.signals, chosen, valid.startsAt, ctx.nudgeFor, selection);
  }
  return finalizeVenuePlan(ctx.slot, ctx.tier, ctx.signals, valid.place, valid.startsAt, ctx.nudgeFor, null);
}

function finalizeVenuePlan(
  slot: Slot,
  tier: ProfileTier,
  signals: UserSignals,
  place: VerifiedPlace,
  startsAt: string,
  nudgeFor: string,
  selection: SelectionOutput | null,
): SparkCandidatePlan {
  const sel = selection ?? fallbackSelection(slot, tier, signals, place.name, nudgeFor);
  const endsAt = new Date(Date.parse(startsAt) + 120 * 60 * 1000).toISOString();
  return {
    slot,
    title: sel.title.slice(0, 80) || place.name,
    fitReason: sel.fit_reason.slice(0, 240),
    placeId: place.place_id,
    placeName: place.name,
    placeLat: place.lat,
    placeLng: place.lng,
    startsAt,
    endsAt,
    approxPriceCents: priceLevelToCents(place.price_level, SPARK_CURRENCY),
    currency: SPARK_CURRENCY,
    // booking_url only when Places verified a real website (mirrors ai-gateway's guardrail).
    bookingUrl: place.website ?? null,
    source: "ai",
    externalRef: null,
  };
}

/** Build the MEETUP plan from a real local event, else null (caller falls back to a venue). */
async function buildEventPlan(
  ctx: { signals: UserSignals; tier: ProfileTier; geminiKey: string | null; nudgeFor: string; events: ExternalEvent[] },
): Promise<SparkCandidatePlan | null> {
  const ev = pickValidEvent(ctx.events);
  if (!ev) return null;

  const outputLanguage = ctx.signals.languages[0] || "English";
  let selection: SelectionOutput | null = null;
  if (ctx.geminiKey) {
    selection = await selectWithGemini(ctx.geminiKey, {
      slot: "meetup",
      tier: ctx.tier,
      outputLanguage,
      nudgeFor: ctx.nudgeFor,
      signals: {
        interests: ctx.signals.interests,
        activityPreferences: ctx.signals.activityPreferences,
        languages: ctx.signals.languages,
        city: ctx.signals.city,
        modes: ctx.signals.modes,
      },
      candidates: [{ index: 0, name: `${ev.title}${ev.venueName ? ` @ ${ev.venueName}` : ""}`, address: ev.location ?? "", price_level: null }],
    });
  }
  const reason = selection?.fit_reason
    ?? fallbackSelection("meetup", ctx.tier, ctx.signals, ev.title, ctx.nudgeFor).fit_reason;
  const title = selection?.title?.slice(0, 80) || ev.title.slice(0, 80);

  return {
    slot: "meetup",
    title,
    fitReason: reason.slice(0, 240),
    placeId: null,
    placeName: ev.venueName ?? ev.location ?? null,
    placeLat: null,
    placeLng: null,
    startsAt: ev.startAt,
    endsAt: ev.endAt ?? null,
    approxPriceCents: null,
    currency: SPARK_CURRENCY,
    bookingUrl: ev.externalUrl ?? null,
    source: "winkly_event",
    externalRef: ev.id,
  };
}

async function generateForUser(
  supabase: SupabaseClient,
  ctx: { signals: UserSignals; placesKey: string; geminiKey: string | null; supabaseUrl: string; serviceKey: string; queryCache: Map<string, string[]> },
): Promise<SparkCandidatePlan[]> {
  const { signals } = ctx;

  // Resolve a city label + coordinates (privacy-coarsened coords preferred).
  let cityLabel = signals.city;
  let lat = signals.lat;
  let lng = signals.lng;
  if ((!lat || !lng) && cityLabel) {
    const g = await geocodeCity(cityLabel);
    if (g) { lat = g.lat; lng = g.lng; }
  }
  if (!cityLabel && lat && lng) cityLabel = await reverseGeocodeCity(lat, lng);
  if (!cityLabel) return []; // can't ground Places queries without a place label

  const utcOffsetMinutes = await resolveUtcOffsetMinutes(lat, lng);
  const tier = computeTier(signals);
  const nudgeFor = nudgeForThisWeek();
  const plans: SparkCandidatePlan[] = [];
  const venueCtx = {
    signals, tier, cityLabel, placesKey: ctx.placesKey, geminiKey: ctx.geminiKey,
    queryCache: ctx.queryCache, nudgeFor, lat, lng, utcOffsetMinutes,
  };

  // SOLO + DATE — verified venues.
  for (const slot of ["solo", "date"] as Slot[]) {
    const plan = await buildVenuePlan(supabase, { ...venueCtx, slot });
    if (plan) plans.push(plan);
  }

  // MEETUP — prefer a real local event; fall back to a verified group-friendly venue.
  let meetup: SparkCandidatePlan | null = null;
  if (lat && lng) {
    const events = await fetchEvents({ supabaseUrl: ctx.supabaseUrl, serviceKey: ctx.serviceKey, lat, lng });
    meetup = await buildEventPlan({ signals, tier, geminiKey: ctx.geminiKey, nudgeFor, events });
  }
  if (!meetup) {
    meetup = await buildVenuePlan(supabase, { ...venueCtx, slot: "meetup" });
  }
  if (meetup) plans.push(meetup);

  return plans;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return withCorsEmpty(req, { status: 204 });

  // Shared with weather-pivot-cron and calendar-sync-sweep so the three cannot drift (SEC-4).
  if (!cronSecretOk(req)) return jsonResponse(req, 401, { error: "Unauthorized" });

  // FAIL CLOSED — never emit world-knowledge venues.
  const placesKey = getPlacesKey();
  if (!placesKey) {
    console.error("[weekly-spark-cron] FAIL-CLOSED: GOOGLE_PLACES_API_KEY (or GOOGLE_MAPS_API_KEY) is not set. No Spark generated.");
    return jsonResponse(req, 503, { error: "google_places_api_key_required", sparks_created: 0, plans_created: 0 });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabase = createClient(supabaseUrl, serviceKey);
    // Test/free-tier key first (mirrors ai-gateway GEMINI_KEYS rotation); paid key as fallback.
    const geminiKey = Deno.env.get("GEMINI_API_KEY_TEST") ?? Deno.env.get("GEMINI_API_KEY") ?? null;

    const weekStart = mondayUTC(new Date());
    const expiresAt = new Date(Date.parse(`${weekStart}T00:00:00Z`) + 8 * 24 * 60 * 60 * 1000).toISOString();
    // Shared Text Search memo: same query across users in this run → one Places call.
    const queryCache = new Map<string, string[]>();

    let processed = 0;
    let sparksCreated = 0;
    let plansCreated = 0;
    let skippedExisting = 0;

    for (let offset = 0; offset < MAX_USERS; offset += USER_BATCH) {
      const limit = Math.min(USER_BATCH, MAX_USERS - offset);
      const { data: users, error } = await supabase.rpc("weekly_spark_active_users", { p_limit: limit, p_offset: offset });
      if (error) {
        console.error("[weekly-spark-cron] active-users query failed:", error.message);
        break;
      }
      const rows = (users ?? []) as Array<Record<string, unknown>>;
      if (rows.length === 0) break;

      for (const row of rows) {
        processed++;
        const userId = String(row.user_id);

        // Idempotent: one Spark per user per week.
        const { data: existing } = await supabase
          .from("weekly_sparks")
          .select("id")
          .eq("user_id", userId)
          .eq("week_start", weekStart)
          .maybeSingle();
        if (existing?.id) { skippedExisting++; continue; }

        const wishlist = await fetchWishlistSignals(supabase, userId);

        const signals: UserSignals = {
          userId,
          city: typeof row.city === "string" && row.city.trim() ? row.city.trim() : null,
          lat: typeof row.lat === "number" ? row.lat : null,
          lng: typeof row.lng === "number" ? row.lng : null,
          languages: Array.isArray(row.languages) ? (row.languages as string[]).filter(Boolean) : [],
          interests: Array.isArray(row.interests) ? (row.interests as string[]).filter(Boolean) : [],
          activityPreferences: Array.isArray(row.activity_preferences) ? (row.activity_preferences as string[]).filter(Boolean) : [],
          modes: Array.isArray(row.modes) ? (row.modes as string[]).filter(Boolean) : [],
          wishlistPlaceIds: wishlist.placeIds,
          wishlistTitles: wishlist.titles,
        };

        let plans: SparkCandidatePlan[];
        try {
          plans = await generateForUser(supabase, { signals, placesKey, geminiKey, supabaseUrl, serviceKey, queryCache });
        } catch (e) {
          console.error(`[weekly-spark-cron] generation failed for user ${userId}:`, e);
          continue;
        }
        if (plans.length === 0) continue; // skip the user this week rather than emit filler

        const { data: spark, error: sparkErr } = await supabase
          .from("weekly_sparks")
          .insert({ user_id: userId, week_start: weekStart, expires_at: expiresAt })
          .select("id")
          .single();
        if (sparkErr || !spark?.id) {
          // Unique violation = another run created it concurrently; treat as skip.
          continue;
        }
        const sparkId = String(spark.id);

        const planRows = plans.map((p, i) => ({
          spark_id: sparkId,
          slot: p.slot,
          rank: i,
          title: p.title,
          fit_reason: p.fitReason,
          place_id: p.placeId,
          place_name: p.placeName,
          place_lat: p.placeLat,
          place_lng: p.placeLng,
          starts_at: p.startsAt,
          ends_at: p.endsAt,
          approx_price_cents: p.approxPriceCents,
          currency: p.currency,
          booking_url: p.bookingUrl,
          source: p.source,
          sponsored: false,
          external_ref: p.externalRef,
        }));
        const { error: plansErr } = await supabase.from("weekly_spark_plans").insert(planRows);
        if (plansErr) {
          console.error(`[weekly-spark-cron] plan insert failed for user ${userId}:`, plansErr.message);
          await supabase.from("weekly_sparks").delete().eq("id", sparkId); // roll back the empty spark
          continue;
        }
        sparksCreated++;
        plansCreated += planRows.length;
      }

      if (rows.length < limit) break; // last page
    }

    return jsonResponse(req, 200, {
      ok: true,
      week_start: weekStart,
      users_processed: processed,
      skipped_existing: skippedExisting,
      sparks_created: sparksCreated,
      plans_created: plansCreated,
      query_cache_size: queryCache.size,
      sponsored_enabled: SPARK_SPONSORED_ENABLED,
    });
  } catch (e) {
    console.error("[weekly-spark-cron] error:", e);
    return jsonResponse(req, 500, { error: "Internal error" });
  }
});
