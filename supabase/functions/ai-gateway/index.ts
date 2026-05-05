// ai-gateway — Mode-locked AI gateway (spec v8.1 + concierge)
// Validates session, mode; allowlisted context only; optional Gemini (preferred) or OpenAI + tools (weather, Winkly events, planner)
//
// AI safety / account deletion: We do not log full prompts or responses. Only telemetry (user_id, mode, task) is
// stored in ai_requests; that table has ON DELETE CASCADE from auth.users, so when a user deletes their account
// (via delete-account Edge Function) all their ai_requests rows are removed. Third-party AI providers (OpenAI/Gemini)
// may retain request/response data per their policies; we send only allowlisted context and do not use chat content.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, withCorsEmpty } from "../_shared/cors.ts";

/**
 * Gemini model routing (Engineer Brief 2026):
 * - Default to Gemini 3.1 (stable, general planning).
 * - Use Flash-Lite for fast/cheap “theme/topic card” generation when needed.
 *
 * Override via Supabase secrets:
 * - GEMINI_MODEL (main)
 * - GEMINI_MODEL_LITE (fast/cheap)
 */
const GEMINI_MODEL = Deno.env.get("GEMINI_MODEL") ?? "gemini-3.1-flash";
const GEMINI_MODEL_LITE = Deno.env.get("GEMINI_MODEL_LITE") ?? "gemini-3.1-flash-lite";

// Model routing (cost optimization)
const GEMINI_MODEL_TOPICS = Deno.env.get("GEMINI_MODEL_TOPICS") ?? "gemini-3.0-flash-lite";
const GEMINI_MODEL_PLAN = Deno.env.get("GEMINI_MODEL_PLAN") ?? "gemini-3.0-pro";

// Redis (Upstash REST) — used for rate limiting + semantic caching + context caching
const UPSTASH_REDIS_REST_URL = Deno.env.get("UPSTASH_REDIS_REST_URL") ?? "";
const UPSTASH_REDIS_REST_TOKEN = Deno.env.get("UPSTASH_REDIS_REST_TOKEN") ?? "";

type SubscriptionTier = "free" | "super" | "premium" | "enterprise";

async function upstashPipeline(
  commands: Array<{ command: string; args: (string | number)[] }>
): Promise<Array<{ result?: unknown; error?: string }>> {
  if (!UPSTASH_REDIS_REST_URL || !UPSTASH_REDIS_REST_TOKEN) return commands.map(() => ({ error: "redis_not_configured" }));
  const url = `${UPSTASH_REDIS_REST_URL.replace(/\/$/, "")}/pipeline`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${UPSTASH_REDIS_REST_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(commands.map((c) => ({ ...c, args: c.args.map(String) }))),
  });
  if (!res.ok) return commands.map(() => ({ error: `redis_http_${res.status}` }));
  const data = await res.json() as Array<{ result?: unknown; error?: string }>;
  return Array.isArray(data) ? data : commands.map(() => ({ error: "redis_bad_response" }));
}

async function redisGetJson<T>(key: string): Promise<T | null> {
  const [r] = await upstashPipeline([{ command: "GET", args: [key] }]);
  if (!r || r.error) return null;
  const raw = r.result;
  if (raw == null) return null;
  try {
    return JSON.parse(String(raw)) as T;
  } catch {
    return null;
  }
}

async function redisSetJson(key: string, value: unknown, ttlSeconds: number): Promise<void> {
  await upstashPipeline([
    { command: "SET", args: [key, JSON.stringify(value)] },
    { command: "EXPIRE", args: [key, ttlSeconds] },
  ]);
}

async function rateLimitOrThrow(params: {
  userId: string;
  tier: SubscriptionTier;
  task: string;
}): Promise<{ ok: true } | { ok: false; retry_after: number }> {
  // No Redis configured → do not block (safe default for dev)
  if (!UPSTASH_REDIS_REST_URL || !UPSTASH_REDIS_REST_TOKEN) return { ok: true };

  const { userId, tier, task } = params;
  const nowMin = Math.floor(Date.now() / 60000);
  const key = `rl:${tier}:${task}:${userId}:${nowMin}`;
  // Limits per minute (tune as needed)
  const limit =
    tier === "free"
      ? (task === "winkly_plan" ? 0 : task === "planner_theme_plans" ? 3 : task === "chat_topics" ? 6 : 10)
      : tier === "super"
        ? (task === "winkly_plan" ? 6 : task === "planner_theme_plans" ? 12 : task === "chat_topics" ? 24 : 30)
        : tier === "premium" || tier === "enterprise"
          ? (task === "winkly_plan" ? 20 : task === "planner_theme_plans" ? 40 : task === "chat_topics" ? 80 : 90)
          : 10;

  if (limit <= 0) return { ok: false, retry_after: 60 };

  const [incr, exp] = await upstashPipeline([
    { command: "INCR", args: [key] },
    { command: "EXPIRE", args: [key, 60] },
  ]);
  const count = typeof incr?.result === "number" ? incr.result : Number(incr?.result ?? NaN);
  if (!isFinite(count)) return { ok: true };
  if (count > limit) return { ok: false, retry_after: 60 };
  return { ok: true };
}

async function getSubscriptionTier(
  supabase: ReturnType<typeof createClient>,
  userId: string
): Promise<SubscriptionTier> {
  // Redis cache (short TTL)
  const cacheKey = `tier:${userId}`;
  const cached = await redisGetJson<{ tier?: SubscriptionTier }>(cacheKey);
  if (cached?.tier) return cached.tier;
  const { data } = await supabase.from("users").select("subscription_tier").eq("id", userId).maybeSingle();
  const tier = (data as { subscription_tier?: string } | null)?.subscription_tier;
  const out: SubscriptionTier =
    tier === "super" || tier === "premium" || tier === "enterprise" ? (tier as SubscriptionTier) : "free";
  await redisSetJson(cacheKey, { tier: out }, 300).catch(() => {});
  return out;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchWithBackoff(url: string, init: RequestInit, opts: { retries: number; baseMs: number }): Promise<Response> {
  let attempt = 0;
  while (true) {
    const res = await fetch(url, init);
    if (res.status !== 429 || attempt >= opts.retries) return res;
    const ra = res.headers.get("retry-after");
    const retryAfterMs = ra && !isNaN(Number(ra)) ? Number(ra) * 1000 : null;
    const jitter = Math.round(Math.random() * 250);
    const backoff = Math.min(15_000, opts.baseMs * Math.pow(2, attempt)) + jitter;
    await sleep(retryAfterMs != null ? Math.max(backoff, retryAfterMs) : backoff);
    attempt++;
  }
}

const ALLOWED_MODES = ["romance", "friends", "business", "events"];
const ALLOWED_TASKS = [
  "rank", "suggest", "summarize", "plan", "concierge", "event_suggest", "match_bridge", "match_agent",
  "winkly_plan",
  // Strategic Host surfaces (2026): chat topics + planner theme plans
  "chat_topics",
  "planner_theme_plans",
];

// Allowlisted context keys — only these are sent to the LLM (no raw chat, no PII beyond what's needed)
const ALLOWLISTED_CONTEXT_KEYS = [
  "mode", "city", "country", "date_from", "date_to", "activity_hint", "budget_tier",
  "budget_amount", "budget_currency",
  "latitude", "longitude", "timezone", "limit_events", "source_mode",
  "partner_user_id", "refinement_feedback", "refinement_structured", "previous_options",
  "source_screen", "source_planner_tab", "user_prompt", "plan_request_text", "time_preference", "available_slots",
  "weather_snapshot", "origin_context", "compatibility_context",
  /** Device free slots (ISO) for calendar-aware match bridge; partner often empty until sync. */
  "primary_free_slots", "partner_free_slots",
  /** Agency layer: merged preference narrative (optional client override); calendar ISO windows; booking discovery hints. */
  "preference_engine_summary", "calendar_white_space", "booking_context",
  /** "menu" = three options; "decisive" = primary + backup only. */
  "presentation",
  /** Match Agent: optional chat link + when to meet + search radius (miles). */
  "conversation_id", "target_slot_iso", "search_radius_miles",
  "planning_entry_surface", "origin_location_label", "travel_from_origin_summary", "exact_time_hm",
  "sanitized_requester_persona",
  /** Winkly Plan (multi-user): explicit list of participants (includes requester). */
  "participant_user_ids",
  /** Strategic Host (chat topics): selected meeting date-time (falls back to date_from). */
  "selected_date_time",
  /** Planner Concierge (theme cards): active mode + theme inputs. */
  "current_tab_mode",
  "theme",
  "mode_specific_cards",
  "free_time_slot",
  "weather_forecast",
];

type AiGatewayRequest = {
  mode: string;
  task: string;
  context?: Record<string, unknown>;
  candidates?: Array<Record<string, unknown>>;
};

type WinklyPlanInput = {
  mode: string;
  participant_user_ids: string[];
  planning_form: {
    user_idea?: string | null;
    date_time?: string | null;
    budget?: { amount?: number | null; currency?: string | null } | null;
    weather?: Record<string, unknown> | null;
    city?: string | null;
    country?: string | null;
  };
};

type WinklyPlanOutput = {
  topic: string;
  date_time: string; // ISO
  duration: number; // minutes
  location_details: {
    name: string;
    address: string;
    google_maps_link: string;
  } | { name: "No suitable venue found"; address: ""; google_maps_link: "" };
  weather_context: string;
  booking_links: string[];
  logic_reasoning: string;
};

type StrategicHostTopic = { title: string; type: "Synergy" | "Lifestyle" | "General"; pitch: string };

type ChatTopicsOutput = {
  suggested_topics: StrategicHostTopic[];
};

type PlannerThemePlansOutput = {
  plan_options: Array<{
    topic: string;
    date_time: string;
    location: { name: string; address: string; maps_link: string };
    weather_guard: string;
    participants: string[];
    details: string;
    action_links: { booking?: string };
  }>;
};

function allowlistContext(ctx: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of ALLOWLISTED_CONTEXT_KEYS) {
    if (ctx[key] !== undefined) out[key] = ctx[key];
  }
  const pres = out.presentation;
  if (pres !== "decisive" && pres !== "menu") delete out.presentation;
  return out;
}

/**
 * Privacy Proxy (PII scrubbing) — best-effort sanitization to reduce accidental leakage in free-text
 * fields and user-written bios. This is not a perfect PII detector; it is a minimization layer.
 *
 * Goals:
 * - Strip obvious direct identifiers (email/phone/handles/URLs).
 * - Reduce address precision (street + number → redacted).
 * - Avoid sending human names where they appear in free text.
 *
 * We still rely on upstream product UX (structured fields) and allowlists for primary safety.
 */
function scrubPiiText(input: string): string {
  let t = input;
  // Emails
  t = t.replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[EMAIL]");
  // Phone numbers (very broad; prefers false positives over leaking)
  t = t.replace(/\b(?:\+?\d{1,3}[\s-]?)?(?:\(?\d{2,4}\)?[\s-]?)?\d{3,4}[\s-]?\d{3,4}\b/g, "[PHONE]");
  // @handles (IG/Twitter/etc.)
  t = t.replace(/(^|\s)@[\w._]{2,32}\b/g, "$1[HANDLE]");
  // URLs
  t = t.replace(/\bhttps?:\/\/[^\s]+/gi, "[URL]");
  t = t.replace(/\bwww\.[^\s]+/gi, "[URL]");
  // Street + number (reduce precision). Works for many EU-style addresses.
  t = t.replace(/\b([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ'’.-]{2,}\s)+(street|st|strasse|straße|str|road|rd|avenue|ave|boulevard|blvd|lane|ln|platz|pl|allee|gasse)\s*\d+[A-Za-z]?\b/gi, "[ADDRESS]");
  // Two-capitalized-words pattern (rough human name heuristic)
  t = t.replace(/\b([A-Z][a-zà-ÿ'’.-]{1,})\s+([A-Z][a-zà-ÿ'’.-]{1,})\b/g, "[PERSON]");
  // Collapse repeated placeholders
  t = t.replace(/\[(EMAIL|PHONE|HANDLE|URL|ADDRESS|PERSON)\](?:\s*\[\1\])+/g, "[$1]");
  // Keep it bounded
  if (t.length > 1400) t = t.slice(0, 1400) + "…";
  return t.trim();
}

function scrubPiiInContext(ctx: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...ctx };
  const scrubKeys = [
    "user_prompt",
    "plan_request_text",
    "activity_hint",
    "origin_location_label",
    "travel_from_origin_summary",
    "refinement_feedback",
    "sanitized_requester_persona",
    "origin_context",
    "calendar_white_space",
  ];
  for (const k of scrubKeys) {
    const v = out[k];
    if (typeof v === "string" && v.trim().length > 0) out[k] = scrubPiiText(v);
  }
  return out;
}

/** Compute age from birthday (YYYY-MM-DD or date string). */
function ageFromBirthday(birthday: string | null | undefined): number | null {
  if (!birthday) return null;
  const d = new Date(birthday);
  if (isNaN(d.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - d.getFullYear();
  if (today.getMonth() < d.getMonth() || (today.getMonth() === d.getMonth() && today.getDate() < d.getDate())) age--;
  return age >= 0 ? age : null;
}

/** Fetch core identity (prefer profiles_core, fallback user_profiles). */
async function getCoreProfile(supabase: ReturnType<typeof createClient>, userId: string): Promise<{ first_name?: string; gender?: string; birthday?: string; city?: string } | null> {
  const { data: core } = await supabase.from("profiles_core").select("first_name, gender, birthday, city").eq("id", userId).maybeSingle();
  if (core) return core;
  const { data: up } = await supabase.from("user_profiles").select("first_name, gender, birthday, city").eq("id", userId).maybeSingle();
  return up ?? null;
}

/**
 * Build concierge "DNA" summary from one profiles_mode row (already filtered by mode in SQL).
 * Identity Firewall: only include goal/meta fields that belong to this mode so polluted meta keys
 * cannot leak Romance/Business hints into Friends concierge (and vice versa).
 */
function summarizeModeProfile(
  row: { bio?: string | null; interests?: string[] | null; meta?: Record<string, unknown> | null } | null,
  mode: string,
): Record<string, unknown> {
  if (!row) return {};
  const meta = (row.meta ?? {}) as Record<string, unknown>;
  const out: Record<string, unknown> = {
    bio: typeof row.bio === "string" && row.bio.length > 0 ? scrubPiiText(row.bio).slice(0, 300) : undefined,
    interests: Array.isArray(row.interests) ? row.interests : undefined,
    food: meta.food ?? meta.dietary,
    allergies: meta.allergies,
    lifestyle: meta.lifestyle,
    smoking: meta.smoking,
    alcohol: meta.alcohol,
    values: meta.values,
    transport: meta.transport ?? meta.preferred_transport,
  };
  if (mode === "romance") {
    out.relationship_goals = meta.relationship_goals;
  } else if (mode === "friends") {
    out.meetup_goals = meta.meetup_goals;
  } else if (mode === "business") {
    out.networking_goals = meta.networking_goals;
    const pt = meta.professional_topics;
    if (Array.isArray(pt)) out.professional_topics = pt;
  }
  // mode === "events": core + interests only (no cross-persona goals)
  Object.keys(out).forEach((k) => {
    if (out[k] === undefined || out[k] === null) delete out[k];
  });
  return out;
}

/** Fetch primary and optional partner profile context for concierge (identity + mode DNA).
 * Phase A: one co-planner (`partner_user_id`); profiles_mode rows are loaded for **this `mode` only**
 * (Friends chat → friends row only; no Romance/Business sub-profile fields in the LLM payload).
 * We send only minimal, allowlisted profile data (age, gender, city, interests, lifestyle, dietary, mode goals) for
 * personalization. We do NOT send first_name, last_name, or email to the LLM (data minimization; lawful under GDPR
 * for contract + legitimate interest). Third-party AI providers may retain requests per their policy.
 */
async function getConciergeProfileContext(
  supabase: ReturnType<typeof createClient>,
  primaryUserId: string,
  mode: string,
  partnerUserId?: string | null
): Promise<{ primary: Record<string, unknown>; partner?: Record<string, unknown> }> {
  const [corePrimary, modePrimary] = await Promise.all([
    getCoreProfile(supabase, primaryUserId),
    supabase.from("profiles_mode").select("bio, interests, meta").eq("user_id", primaryUserId).eq("mode", mode).maybeSingle(),
  ]);
  const age = corePrimary?.birthday ? ageFromBirthday(corePrimary.birthday) : null;
  const primary: Record<string, unknown> = {
    age: age ?? undefined,
    gender: corePrimary?.gender ?? undefined,
    mode,
    city: corePrimary?.city ?? undefined,
    ...summarizeModeProfile(modePrimary?.data ?? null, mode),
  };
  if (partnerUserId && partnerUserId !== primaryUserId) {
    const [corePartner, modePartner] = await Promise.all([
      getCoreProfile(supabase, partnerUserId),
      supabase.from("profiles_mode").select("bio, interests, meta").eq("user_id", partnerUserId).eq("mode", mode).maybeSingle(),
    ]);
    const partnerAge = corePartner?.birthday ? ageFromBirthday(corePartner.birthday) : null;
    const partner: Record<string, unknown> = {
      age: partnerAge ?? undefined,
      gender: corePartner?.gender ?? undefined,
      mode,
      city: corePartner?.city ?? undefined,
      ...summarizeModeProfile(modePartner?.data ?? null, mode),
    };
    return { primary, partner };
  }
  return { primary };
}

async function getConciergeProfileContextMulti(
  supabase: ReturnType<typeof createClient>,
  requesterUserId: string,
  mode: string,
  participantUserIds: string[],
): Promise<Array<{ id: string; profile: Record<string, unknown> }>> {
  const uniq = Array.from(new Set([requesterUserId, ...participantUserIds].filter((x) => typeof x === "string" && x)));
  const out: Array<{ id: string; profile: Record<string, unknown> }> = [];
  for (const id of uniq.slice(0, 12)) {
    const ctx = await getConciergeProfileContext(supabase, id, mode, null);
    out.push({ id, profile: ctx.primary });
  }
  return out;
}

function normalizeTag(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

function categoriesForInterest(tag: string): string[] {
  const t = normalizeTag(tag);
  const cats: string[] = [];
  const has = (re: RegExp) => re.test(t);
  if (has(/\b(tennis|padel|pickleball|badminton|squash|golf|running|jog|marathon|gym|lifting|strength|pilates|yoga|fitness|workout|crossfit|spin|cycling|bike|swim|boxing|martial)\b/)) cats.push("fitness_wellness");
  if (has(/\b(hike|hiking|trail|climb|climbing|outdoor|camp|camping|kayak|paddle|surf|ski|snowboard|nature|park)\b/)) cats.push("outdoors");
  if (has(/\b(live music|concert|jazz|dj|club|vinyl|festival|karaoke|music)\b/)) cats.push("music");
  if (has(/\b(food|foodie|dinner|brunch|coffee|cafe|tea|wine|cocktail|bistro|restaurant|tasting)\b/)) cats.push("food_drink");
  if (has(/\b(museum|gallery|art|theatre|theater|cinema|film|book|reading|poetry|comedy)\b/)) cats.push("arts_culture");
  if (has(/\b(game|board game|chess|arcade|bowling|escape room|trivia)\b/)) cats.push("play");
  if (!cats.length) cats.push("other");
  return Array.from(new Set(cats));
}

function intersect<T>(a: T[], b: T[]): T[] {
  const bs = new Set(b);
  return Array.from(new Set(a.filter((x) => bs.has(x))));
}

function coerceStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x) => typeof x === "string") as string[] : [];
}

function pickLifestyleSynergy(lifestyles: string[]): string | null {
  const ls = lifestyles.map(normalizeTag);
  if (ls.some((x) => x.includes("night")) && ls.some((x) => x.includes("night"))) return "night_owls";
  if (ls.some((x) => x.includes("early")) && ls.some((x) => x.includes("early"))) return "early_birds";
  if (ls.some((x) => x.includes("coffee"))) return "coffee";
  if (ls.some((x) => x.includes("wellness") || x.includes("healthy"))) return "wellness";
  return ls.length ? ls[0] : null;
}

function topicForCategory(mode: string, cat: string): string {
  if (cat === "fitness_wellness") return mode === "business" ? "Walk-and-talk meeting in a park loop" : "Fitness + smoothie reset";
  if (cat === "outdoors") return "Golden-hour walk + scenic viewpoint";
  if (cat === "music") return mode === "business" ? "Low-key live jazz lounge (quiet corner)" : "Live music night";
  if (cat === "food_drink") return mode === "business" ? "Quiet café or lunch spot with Wi‑Fi" : "Top-rated dinner or brunch";
  if (cat === "arts_culture") return mode === "business" ? "Museum café + gallery stroll" : "Museum / gallery date";
  if (cat === "play") return mode === "business" ? "Coffee + board-game break (optional)" : "Playful activity (bowling / arcade)";
  return mode === "business" ? "Professional coffee chat" : "High-rated dinner";
}

function lifestyleTopic(mode: string, key: string): string {
  if (key === "night_owls") return mode === "business" ? "Late-afternoon espresso + quiet speakeasy-style bar" : "Late-night speakeasy / dessert bar";
  if (key === "early_birds") return "Morning coffee + bakery crawl";
  if (key === "wellness") return "Infrared sauna / spa hour + light bite";
  if (key === "coffee") return "Specialty coffee crawl + short walk";
  return mode === "business" ? "Quiet coffee chat" : "Coffee + walk";
}

async function hasAnyPlaceForTopic(params: { city: string; country?: string; topic: string }): Promise<boolean> {
  const key = Deno.env.get("GOOGLE_PLACES_API_KEY") ?? Deno.env.get("GOOGLE_MAPS_API_KEY");
  if (!key) return true; // can't validate; don't block
  const q = `${params.topic} ${params.city} ${params.country ?? ""}`.trim().slice(0, 220);
  const url =
    `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(q)}&key=${encodeURIComponent(key)}`;
  const res = await fetch(url);
  const data = await res.json() as { status?: string; results?: Array<Record<string, unknown>> };
  return data.status === "OK" && Array.isArray(data.results) && data.results.length > 0;
}

async function generateChatTopics(params: {
  supabase: ReturnType<typeof createClient>;
  requesterUserId: string;
  mode: string;
  participantIds: string[];
  conversationId?: string | null;
  city: string;
  country?: string;
}): Promise<ChatTopicsOutput> {
  // Semantic caching: same chat/mode/city/topics within 24h
  const cacheKey = `sc:chat_topics:${params.conversationId ?? "nochat"}:${params.mode}:${normalizeTag(params.city)}`;
  const cached = await redisGetJson<ChatTopicsOutput>(cacheKey);
  if (cached?.suggested_topics?.length) return cached;

  let ids = params.participantIds;
  if (params.conversationId) {
    const fromChat = await getParticipantIdsForConversation({
      supabase: params.supabase,
      conversationId: params.conversationId,
      requesterUserId: params.requesterUserId,
    });
    if (fromChat.length) ids = fromChat;
  }
  const participants = await getConciergeProfileContextMulti(params.supabase, params.requesterUserId, params.mode, ids);
  const interests = participants.map((p) => coerceStringArray(p.profile.interests));
  const lifestyleTags = participants.flatMap((p) => {
    const metaLife = (p.profile as Record<string, unknown>).lifestyle;
    return Array.isArray(metaLife) ? metaLife.filter((x) => typeof x === "string") as string[] : typeof metaLife === "string" ? [metaLife] : [];
  });

  // Direct overlap (exact tags)
  let overlapTags: string[] = [];
  if (interests.length >= 2) {
    overlapTags = interests.slice(1).reduce((acc, arr) => intersect(acc, arr), interests[0] ?? []).slice(0, 6);
  }

  // Semantic-ish overlap via category intersection
  const catsByUser = interests.map((arr) => Array.from(new Set(arr.flatMap(categoriesForInterest))));
  let overlapCats: string[] = [];
  if (catsByUser.length >= 2) {
    overlapCats = catsByUser.slice(1).reduce((acc, arr) => intersect(acc, arr), catsByUser[0] ?? []).filter((c) => c !== "other").slice(0, 3);
  }
  const primaryCat = overlapCats[0] ?? "food_drink";

  const lifestyleKey = pickLifestyleSynergy(lifestyleTags) ?? "coffee";

  const topic1 = overlapTags[0] ? `${overlapTags[0]} meetup` : topicForCategory(params.mode, primaryCat);
  const topic2 = overlapTags[1] ? `${overlapTags[1]} hangout` : topicForCategory(params.mode, overlapCats[1] ?? primaryCat);
  const topic3 = lifestyleTopic(params.mode, lifestyleKey);
  const topic4 = params.mode === "business" ? "Top-rated café for a focused conversation" : "Top-rated dinner spot nearby";
  const topic5 = params.mode === "business" ? "Quiet lunch bistro (easy to talk)" : "Brunch + short walk (safe, easy)";

  // Grounding: if Places API configured, ensure each topic has at least one match; otherwise fallback to safer general picks.
  const candidates = [topic1, topic2, topic3, topic4, topic5];
  const grounded: string[] = [];
  for (const t of candidates) {
    const ok = await hasAnyPlaceForTopic({ city: params.city, country: params.country, topic: t });
    grounded.push(ok ? t : (params.mode === "business" ? "Top-rated café nearby" : "Top-rated dinner nearby"));
  }

  const overlapLine =
    overlapTags.length
      ? `Critical overlap: ${overlapTags.slice(0, 2).join(" + ")}`
      : overlapCats.length
        ? `Critical overlap category: ${overlapCats[0]}`
        : "Critical overlap: general vibe match";

  const out: ChatTopicsOutput = {
    suggested_topics: [
      { title: grounded[0], type: "Synergy", pitch: `${overlapLine}. Make the first move feel effortless with a plan that matches both profiles.` },
      { title: grounded[1], type: "Synergy", pitch: `Second high-synergy angle based on shared interests—gives you an easy conversation backbone.` },
      { title: grounded[2], type: "Lifestyle", pitch: `Lifestyle alignment: ${lifestyleKey.replace(/_/g, " ")}. Low-friction, fits their pacing.` },
      { title: grounded[3], type: "General", pitch: "A high-quality, mode-appropriate safe pick that works even if energy is low." },
      { title: grounded[4], type: "General", pitch: "Another reliable option with minimal coordination cost and easy exits." },
    ],
  };
  await redisSetJson(cacheKey, out, 86400).catch(() => {});
  return out;
}

async function fetchConciergeSignals(
  supabase: ReturnType<typeof createClient>,
  userId: string,
): Promise<Record<string, unknown>> {
  const { data } = await supabase.from("user_concierge_signals").select("signals").eq("user_id", userId).maybeSingle();
  const s = data?.signals as Record<string, unknown> | undefined;
  return s && typeof s === "object" && !Array.isArray(s) ? s : {};
}

async function getParticipantIdsForConversation(params: {
  supabase: ReturnType<typeof createClient>;
  conversationId: string;
  requesterUserId: string;
}): Promise<string[]> {
  const { supabase, conversationId, requesterUserId } = params;
  const { data: rows, error } = await supabase
    .from("conversation_participants")
    .select("user_id")
    .eq("conversation_id", conversationId);
  if (error) return [];
  const ids = (rows ?? [])
    .map((r) => (r as { user_id?: string }).user_id)
    .filter((x): x is string => typeof x === "string" && x.length > 0);
  // Membership check (identity gate): requester must be part of the conversation
  if (!ids.includes(requesterUserId)) return [];
  return ids;
}

function hashKeyMaterial(s: string): string {
  // small non-crypto hash for cache keys
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
}

/** Merge primary/partner structured signals + profile food for concierge "agency" constraints. */
function mergePreferenceEngineNarrative(
  primary: Record<string, unknown>,
  partner: Record<string, unknown> | undefined,
  sigP: Record<string, unknown>,
  sigO: Record<string, unknown>,
): string {
  const parts: string[] = [];
  const avoidP = Array.isArray(sigP.avoid) ? (sigP.avoid as string[]).join(", ") : "";
  const preferP = Array.isArray(sigP.prefer) ? (sigP.prefer as string[]).join(", ") : "";
  const noiseP = typeof sigP.noise_level === "string" ? sigP.noise_level : "";
  const dietP = primary.food ?? (primary as { dietary?: unknown }).dietary;
  if (avoidP) parts.push(`Primary avoids venues/types: ${avoidP}.`);
  if (preferP) parts.push(`Primary prefers: ${preferP}.`);
  if (noiseP) parts.push(`Primary noise preference: ${noiseP}.`);
  if (dietP != null) parts.push(`Primary food/diet: ${String(dietP)}.`);
  const avoidO = Array.isArray(sigO.avoid) ? (sigO.avoid as string[]).join(", ") : "";
  const preferO = Array.isArray(sigO.prefer) ? (sigO.prefer as string[]).join(", ") : "";
  const noiseO = typeof sigO.noise_level === "string" ? sigO.noise_level : "";
  const dietO = partner?.food ?? (partner as { dietary?: unknown } | undefined)?.dietary;
  if (partner) {
    if (avoidO) parts.push(`Partner avoids: ${avoidO}.`);
    if (preferO) parts.push(`Partner prefers: ${preferO}.`);
    if (noiseO) parts.push(`Partner noise preference: ${noiseO}.`);
    if (dietO != null) parts.push(`Partner food/diet: ${String(dietO)}.`);
  }
  const topicsP = Array.isArray(sigP.professional_topics) ? (sigP.professional_topics as string[]) : [];
  const topicsO = Array.isArray(sigO.professional_topics) ? (sigO.professional_topics as string[]) : [];
  const shared = topicsP.filter((t) => topicsO.includes(t));
  if (shared.length) parts.push(`Shared professional interests: ${shared.join(", ")}.`);
  return parts.join(" ") || "Use profile DNA; no extra concierge_signals rows yet.";
}

// ——— Tools (run inside Edge, no keys to client) ———

async function getWeather(lat: number, lng: number, date?: string): Promise<string> {
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", String(lat));
  url.searchParams.set("longitude", String(lng));
  url.searchParams.set("daily", "weathercode,temperature_2m_max,temperature_2m_min,precipitation_sum");
  url.searchParams.set("timezone", "auto");
  if (date) url.searchParams.set("start", date);
  const res = await fetch(url.toString());
  if (!res.ok) return JSON.stringify({ error: "Weather fetch failed" });
  const data = await res.json();
  return JSON.stringify(data.daily || data);
}

async function geocodeCity(city: string): Promise<{ lat: number; lng: number } | null> {
  const url = new URL("https://geocoding-api.open-meteo.com/v1/search");
  url.searchParams.set("name", city);
  url.searchParams.set("count", "1");
  const res = await fetch(url.toString());
  if (!res.ok) return null;
  const data = await res.json();
  const results = data.results;
  if (!results?.length) return null;
  return { lat: results[0].latitude, lng: results[0].longitude };
}

/** DB column is start_at (see mobile events screens); legacy DBs may use starts_at — try start_at first. */
async function getWinklyEvents(supabase: ReturnType<typeof createClient>, options: {
  mode?: string;
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
}): Promise<string> {
  const lim = options.limit ?? 10;
  const sel = "id, title, description, location, city, category, tags, start_at, end_at, mode, visibility, price_eur";
  let query = supabase.from("events").select(sel).order("start_at", { ascending: true }).limit(lim);
  if (options.mode) query = query.eq("mode", options.mode);
  if (options.dateFrom) {
    const s = options.dateFrom.includes("T") ? options.dateFrom : `${options.dateFrom}T00:00:00.000Z`;
    query = query.gte("start_at", s);
  }
  if (options.dateTo) {
    const e = options.dateTo.includes("T") ? options.dateTo : `${options.dateTo}T23:59:59.999Z`;
    query = query.lte("start_at", e);
  }
  let { data, error } = await query;
  if (error?.message?.includes("column") && error.message.includes("start_at")) {
    let q2 = supabase.from("events").select("id, title, description, location, starts_at, ends_at, mode, visibility").order("starts_at", { ascending: true }).limit(lim);
    if (options.mode) q2 = q2.eq("mode", options.mode);
    if (options.dateFrom) q2 = q2.gte("starts_at", options.dateFrom);
    if (options.dateTo) q2 = q2.lte("starts_at", options.dateTo);
    const r2 = await q2;
    data = r2.data;
    error = r2.error;
  }
  if (error) return JSON.stringify({ error: error.message });
  return JSON.stringify(data ?? []);
}

const EVENT_KEYWORD_STOP = new Set([
  "the", "and", "for", "with", "from", "that", "this", "your", "when", "into", "plan", "want", "time", "date", "city", "mode",
  "what", "they", "have", "been", "will", "just", "like", "make", "please", "user", "topic", "place", "budget", "weather",
]);

/** Tokens from activity + plan text for matching Winkly Events listings (title/description/category/tags). */
function extractEventKeywords(...texts: string[]): string[] {
  const raw = texts.filter(Boolean).join(" ").toLowerCase();
  const words = raw.match(/[a-z0-9à-ÿ]{3,}/g) ?? [];
  const out: string[] = [];
  for (const w of words) {
    if (EVENT_KEYWORD_STOP.has(w)) continue;
    if (!out.includes(w)) out.push(w);
    if (out.length >= 12) break;
  }
  return out;
}

function scoreEventForPlan(row: Record<string, unknown>, keywords: string[], cityNorm: string): number {
  let s = 0;
  const blob = [
    row.title,
    row.description,
    row.category,
    Array.isArray(row.tags) ? (row.tags as string[]).join(" ") : "",
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  for (const kw of keywords) {
    if (blob.includes(kw)) s += 4;
  }
  const trgm = Number((row as { trgm_score?: number }).trgm_score ?? 0);
  if (trgm > 0) s += Math.min(25, Math.round(trgm * 22));
  const evCity = String(row.city ?? "").toLowerCase().trim();
  if (cityNorm && evCity && (evCity.includes(cityNorm) || cityNorm.includes(evCity))) s += 6;
  const loc = String(row.location ?? "").toLowerCase();
  const venue = String((row as { venue_name?: string }).venue_name ?? "").toLowerCase();
  if (cityNorm && (loc.includes(cityNorm) || venue.includes(cityNorm))) s += 3;
  return s;
}

/** Merge JS-scored events with RPC trgm rows (dedupe by id; keep max trgm_score). */
function mergeEventCandidatesById(
  jsRows: Record<string, unknown>[],
  trgmRows: Record<string, unknown>[],
): Record<string, unknown>[] {
  const map = new Map<string, Record<string, unknown>>();
  for (const r of trgmRows) {
    const id = String(r.id ?? "");
    if (!id) continue;
    map.set(id, { ...r });
  }
  for (const r of jsRows) {
    const id = String(r.id ?? "");
    if (!id) continue;
    const prev = map.get(id);
    if (!prev) {
      map.set(id, { ...r });
      continue;
    }
    const ts = Math.max(
      Number((r as { trgm_score?: number }).trgm_score ?? 0),
      Number((prev as { trgm_score?: number }).trgm_score ?? 0),
    );
    map.set(id, { ...prev, ...r, trgm_score: ts });
  }
  return [...map.values()];
}

async function prefetchTrgmEvents(
  supabase: ReturnType<typeof createClient>,
  input: {
    city: string;
    dateFrom?: string;
    dateTo?: string;
    activityHint: string;
    planRequest: string;
    keywords: string[];
  },
): Promise<Record<string, unknown>[]> {
  const searchBlob = [input.activityHint, input.planRequest, input.keywords.join(" ")].join(" ").trim()
    || input.city.trim()
    || "events";
  const dateFrom = input.dateFrom;
  const dateTo = input.dateTo ?? input.dateFrom;
  const pFrom = dateFrom
    ? new Date(dateFrom.includes("T") ? dateFrom : `${dateFrom}T00:00:00.000Z`).toISOString()
    : new Date().toISOString();
  const pTo = dateTo
    ? new Date(dateTo.includes("T") ? dateTo : `${dateTo}T23:59:59.999Z`).toISOString()
    : new Date(Date.now() + 21 * 86400000).toISOString();
  const { data, error } = await supabase.rpc("match_events_for_concierge", {
    p_search: searchBlob.slice(0, 500),
    p_city: input.city.trim(),
    p_from: pFrom,
    p_to: pTo,
    p_limit: 28,
  });
  if (error) {
    console.warn("[ai-gateway] match_events_for_concierge:", error.message);
    return [];
  }
  return Array.isArray(data) ? (data as Record<string, unknown>[]) : [];
}

function scoreBusinessService(row: Record<string, unknown>, keywords: string[], cityNorm: string): number {
  let s = 0;
  const blob = [row.title, row.short_description, row.category].filter(Boolean).join(" ").toLowerCase();
  for (const kw of keywords) {
    if (blob.includes(kw)) s += 4;
  }
  const c = String(row.city ?? "").toLowerCase();
  if (cityNorm && c.includes(cityNorm)) s += 5;
  return s;
}

function scoreBusinessProfile(row: Record<string, unknown>, keywords: string[], cityNorm: string): number {
  let s = 0;
  const tags = Array.isArray(row.tags) ? (row.tags as string[]).join(" ") : "";
  const blob = [row.business_name, row.bio, row.location, row.area, tags].filter(Boolean).join(" ").toLowerCase();
  for (const kw of keywords) {
    if (blob.includes(kw)) s += 4;
  }
  const loc = String(row.location ?? "").toLowerCase();
  const ar = String(row.area ?? "").toLowerCase();
  if (cityNorm && (loc.includes(cityNorm) || ar.includes(cityNorm))) s += 5;
  return s;
}

/** Winkly business_services + profiles_business (service role bypasses RLS). */
async function prefetchMatchingBusinessSupply(
  supabase: ReturnType<typeof createClient>,
  input: { city: string; activityHint: string; planRequest: string; mode: string },
): Promise<{ services: unknown[]; profiles: unknown[] }> {
  const keywords = extractEventKeywords(input.activityHint, input.planRequest, input.mode);
  const cityNorm = input.city.trim().toLowerCase();
  const [svcRes, profRes] = await Promise.all([
    supabase.from("business_services").select("id, title, category, city, short_description, cover_url").limit(220),
    supabase.from("profiles_business").select("id, business_name, location, area, bio, tags, website").limit(320),
  ]);
  if (svcRes.error) console.warn("[ai-gateway] business_services:", svcRes.error.message);
  if (profRes.error) console.warn("[ai-gateway] profiles_business:", profRes.error.message);

  const services = (svcRes.data ?? []) as Record<string, unknown>[];
  const profiles = (profRes.data ?? []) as Record<string, unknown>[];

  const scoredSvc = services.map((row) => ({ row, score: scoreBusinessService(row, keywords, cityNorm) }));
  scoredSvc.sort((a, b) => b.score - a.score);
  let topSvc = scoredSvc.filter((x) => x.score >= 4).slice(0, 10).map((x) => x.row);
  if (topSvc.length === 0 && cityNorm) {
    topSvc = services.filter((r) => String(r.city ?? "").toLowerCase().includes(cityNorm)).slice(0, 6);
  } else if (topSvc.length === 0) {
    topSvc = scoredSvc.slice(0, 5).map((x) => x.row);
  }

  const scoredProf = profiles.map((row) => ({ row, score: scoreBusinessProfile(row, keywords, cityNorm) }));
  scoredProf.sort((a, b) => b.score - a.score);
  let topProf = scoredProf.filter((x) => x.score >= 4).slice(0, 8).map((x) => x.row);
  if (topProf.length === 0 && cityNorm) {
    topProf = profiles.filter((r) => {
      const loc = String(r.location ?? "").toLowerCase();
      const ar = String(r.area ?? "").toLowerCase();
      return loc.includes(cityNorm) || ar.includes(cityNorm);
    }).slice(0, 5);
  } else if (topProf.length === 0) {
    topProf = scoredProf.slice(0, 4).map((x) => x.row);
  }

  return { services: topSvc, profiles: topProf };
}

/** Google Places Text Search (optional) + OSM Nominatim fallback — real-world venue hints for the model. */
async function fetchExternalVenueHints(input: {
  activityHint: string;
  planRequest: string;
  city: string;
  country?: string;
}): Promise<unknown[]> {
  const qBase = [input.activityHint, input.planRequest].filter(Boolean).join(" ").trim();
  const location = [input.city, input.country].filter(Boolean).join(", ").trim();
  if (!qBase || !location) return [];

  const placesKey = Deno.env.get("GOOGLE_PLACES_API_KEY") ?? Deno.env.get("GOOGLE_MAPS_API_KEY");
  const out: unknown[] = [];

  if (placesKey) {
    try {
      const query = `${qBase} ${location}`.slice(0, 280);
      const url =
        `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(query)}&key=${placesKey}`;
      const res = await fetch(url);
      const data = await res.json() as { results?: Array<Record<string, unknown>>; status?: string };
      if (data.status === "OK" || data.status === "ZERO_RESULTS") {
        const results = data.results ?? [];
        for (const r of results.slice(0, 5)) {
          const fa = typeof r.formatted_address === "string" ? r.formatted_address : "";
          const areaHint = fa
            ? fa.split(",").slice(-2).map((s) => s.trim()).filter(Boolean).join(", ")
            : undefined;
          out.push({
            source: "google_places",
            name: r.name,
            formatted_address: areaHint ?? undefined,
            place_id: r.place_id,
            rating: r.rating,
            types: Array.isArray(r.types) ? (r.types as string[]).slice(0, 6) : undefined,
          });
        }
      }
    } catch (e) {
      console.warn("[ai-gateway] Google Places:", e);
    }
  }

  if (out.length === 0) {
    try {
      const q = encodeURIComponent(`${qBase} ${location}`.slice(0, 200));
      const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=5`, {
        headers: { "User-Agent": "WinklyApp/1.0 (ai-gateway; https://winkly.app)" },
      });
      const arr = await res.json() as Array<{ display_name?: string; lat?: string; lon?: string }>;
      for (const r of (arr ?? []).slice(0, 5)) {
        const dn = r.display_name ?? "";
        const areaHint = dn
          ? dn.split(",").slice(-3).map((s) => s.trim()).filter(Boolean).slice(0, 2).join(", ")
          : undefined;
        out.push({
          source: "osm_nominatim",
          name: dn.split(",")[0]?.trim() ?? dn,
          formatted_address: areaHint ?? undefined,
          lat: r.lat,
          lon: r.lon,
        });
      }
    } catch (e) {
      console.warn("[ai-gateway] Nominatim:", e);
    }
  }

  return out.slice(0, 6);
}

/**
 * Pre-fetch public Winkly events that fit the user's window + intent so the model prioritizes real listings
 * (e.g. "Hiking tour" when user asked for hiking) without relying only on a tool call.
 */
async function prefetchMatchingWinklyEvents(
  supabase: ReturnType<typeof createClient>,
  input: {
    mode: string;
    city: string;
    country?: string;
    dateFrom?: string;
    dateTo?: string;
    activityHint: string;
    planRequest: string;
  }
): Promise<unknown[]> {
  const keywords = extractEventKeywords(input.activityHint, input.planRequest, input.mode);
  const cityNorm = input.city.trim().toLowerCase();
  const dateFrom = input.dateFrom;
  const dateTo = input.dateTo ?? input.dateFrom;

  const trgmPromise = prefetchTrgmEvents(supabase, {
    city: input.city,
    dateFrom,
    dateTo,
    activityHint: input.activityHint,
    planRequest: input.planRequest,
    keywords,
  });

  const sel = "id, title, description, location, city, category, tags, start_at, end_at, mode, visibility, price_eur";
  let query = supabase.from("events").select(sel).order("start_at", { ascending: true }).limit(100);

  if (dateFrom) {
    const s = dateFrom.includes("T") ? dateFrom : `${dateFrom}T00:00:00.000Z`;
    query = query.gte("start_at", s);
  } else {
    query = query.gte("start_at", new Date().toISOString());
  }
  if (dateTo) {
    const e = dateTo.includes("T") ? dateTo : `${dateTo}T23:59:59.999Z`;
    query = query.lte("start_at", e);
  }

  let { data, error } = await query;
  if (error?.message?.includes("column") && error.message.includes("start_at")) {
    const selLegacy = "id, title, description, location, city, venue_name, category, tags, starts_at, ends_at, mode, visibility, price_eur";
    let q2 = supabase.from("events").select(selLegacy).order("starts_at", { ascending: true }).limit(100);
    if (dateFrom) q2 = q2.gte("starts_at", dateFrom.includes("T") ? dateFrom : `${dateFrom}T00:00:00.000Z`);
    else q2 = q2.gte("starts_at", new Date().toISOString());
    if (dateTo) q2 = q2.lte("starts_at", dateTo.includes("T") ? dateTo : `${dateTo}T23:59:59.999Z`);
    const r2 = await q2;
    data = r2.data;
    error = r2.error;
  }
  const trgmRows = await trgmPromise;

  if (error) {
    console.error("[ai-gateway] prefetchMatchingWinklyEvents:", error.message);
    const mergedOnly = mergeEventCandidatesById([], trgmRows);
    mergedOnly.sort((a, b) => scoreEventForPlan(b, keywords, cityNorm) - scoreEventForPlan(a, keywords, cityNorm));
    return mergedOnly.slice(0, 18);
  }
  const rows = (data ?? []) as Record<string, unknown>[];
  if (rows.length === 0) {
    const mergedOnly = mergeEventCandidatesById([], trgmRows);
    mergedOnly.sort((a, b) => scoreEventForPlan(b, keywords, cityNorm) - scoreEventForPlan(a, keywords, cityNorm));
    return mergedOnly.slice(0, 18);
  }

  const vis = (r: Record<string, unknown>) => {
    const v = String(r.visibility ?? "public").toLowerCase();
    return v === "public" || v === "";
  };
  const publicRows = rows.filter(vis);

  const scored = publicRows.map((row) => ({
    row,
    score: scoreEventForPlan(row, keywords, cityNorm),
  }));
  scored.sort((a, b) => b.score - a.score);

  let jsCandidates: Record<string, unknown>[] = [];
  const strong = scored.filter((x) => x.score >= 4).slice(0, 15).map((x) => x.row);
  if (strong.length > 0) {
    jsCandidates = strong;
  } else if (cityNorm) {
    const cityMatch = publicRows
      .filter((row) => {
        const c = String(row.city ?? "").toLowerCase();
        const l = String(row.location ?? "").toLowerCase();
        return c.includes(cityNorm) || l.includes(cityNorm) || cityNorm.includes(c);
      })
      .slice(0, 12);
    jsCandidates = cityMatch.length > 0 ? cityMatch : publicRows.slice(0, 10);
  } else {
    jsCandidates = publicRows.slice(0, 10);
  }

  const merged = mergeEventCandidatesById(jsCandidates, trgmRows);
  merged.sort((a, b) => scoreEventForPlan(b, keywords, cityNorm) - scoreEventForPlan(a, keywords, cityNorm));
  return merged.slice(0, 18);
}

async function getPlannerItemsForUser(supabase: ReturnType<typeof createClient>, userId: string, sourceMode?: string): Promise<string> {
  const { data: participantRows } = await supabase.from("planner_participants").select("planner_item_id").eq("user_id", userId);
  const participantIds = (participantRows ?? []).map((r: { planner_item_id: string }) => r.planner_item_id);
  // Privacy minimization: planner items are used for scheduling/conflict avoidance — do not send full descriptions/meta.
  let query = supabase.from("planner_items").select("id, title, starts_at, ends_at, source_mode").order("starts_at", { ascending: true }).limit(20);
  if (participantIds.length > 0) {
    query = query.or(`created_by.eq.${userId},id.in.(${participantIds.join(",")})`);
  } else {
    query = query.eq("created_by", userId);
  }
  if (sourceMode) query = query.eq("source_mode", sourceMode);
  const { data, error } = await query;
  if (error) return JSON.stringify({ error: error.message });
  const rows = Array.isArray(data) ? (data as Array<Record<string, unknown>>) : [];
  const minimized = rows.map((r) => ({
    id: r.id,
    starts_at: r.starts_at,
    ends_at: r.ends_at,
    source_mode: r.source_mode,
    // Title is optional; scrub if present to avoid names/addresses in user-written titles.
    title: typeof r.title === "string" && r.title.trim() ? scrubPiiText(r.title).slice(0, 80) : undefined,
  }));
  return JSON.stringify(minimized);
}

const OPENAI_TOOLS = [
  {
    type: "function" as const,
    function: {
      name: "get_weather",
      description: "Get weather forecast for a location. Use latitude and longitude, or city name to geocode first.",
      parameters: {
        type: "object",
        properties: {
          latitude: { type: "number", description: "Latitude" },
          longitude: { type: "number", description: "Longitude" },
          date: { type: "string", description: "Optional date (YYYY-MM-DD) for forecast" },
        },
        required: ["latitude", "longitude"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_winkly_events",
      description: "Get Winkly events (always prefer these over external suggestions). Filter by mode, date range.",
      parameters: {
        type: "object",
        properties: {
          mode: { type: "string", enum: ["romance", "friends", "business", "events"], description: "Event mode" },
          date_from: { type: "string", description: "ISO date from" },
          date_to: { type: "string", description: "ISO date to" },
          limit: { type: "number", description: "Max events to return" },
        },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_planner_items",
      description: "Get the user's planner items (dates, meetups, meetings) to avoid double-booking and give context.",
      parameters: {
        type: "object",
        properties: {
          source_mode: { type: "string", enum: ["romance", "friends", "business", "events"], description: "Optional filter by source" },
        },
      },
    },
  },
];

const CONCIERGE_SYSTEM_PROMPT = `You are the Elite Digital Concierge for Winkly. Your tone is sophisticated, proactive, and concise. You present finalized solutions—never ask the user to do the work. You address "silent needs"—things they didn't ask for but would be annoyed by if missing.

Feasibility (must check together when USER_REQUEST includes constraints): (1) Weather vs activity type—move outdoor plans indoor or to another day if weather_snapshot conflicts. (2) Arrival time vs venue hours—if opening hours are known or in EXTERNAL_PLACE_HINTS, ensure the suggested arrival is inside hours; avoid arriving within ~45 minutes of stated closing unless the user asked for a very short visit. (3) If origin and destination differ in USER_REQUEST, mention travel time/distance qualitatively; when the plan is shared, note that other participants' travel from their own location may differ. (4) Never fabricate Maps or booking URLs—only use URLs from Winkly rows, tool results, or well-known public search patterns the user can verify.

When COMPATIBILITY_SUMMARY is present in context, use it as the primary input for personalization (compatibility score, shared interests, location, budget)—do not require full PRIMARY_USER/PARTNER_USER. Otherwise, profile-based personalization: PRIMARY_USER and PARTNER_USER (when present) contain minimal profile data used only to tailor suggestions: age, gender, city (location), interests, bio, lifestyle, dietary/food, allergies, values, goals (relationship_goals, meetup_goals, networking_goals), transport. You MUST use this profile information when making suggestions—e.g. match activities to interests, consider age-appropriate and inclusive options, respect dietary and allergies, align with lifestyle (smoking, alcohol, activity level) and location. Do not infer or assume data not provided.

Agency / preference engine: When PREFERENCE_ENGINE_MERGE is present, treat venue avoids (e.g. loud bars), prefer lists (quiet garden, vegan-friendly), noise_level, and professional_topics as constraints alongside dietary. PRIMARY_CONCIERGE_SIGNALS and PARTNER_CONCIERGE_SIGNALS are structured JSON from user_concierge_signals. When CALENDAR_WHITE_SPACE is present (ISO datetimes or short text describing merged free windows from device + optional Google Calendar), prefer proposing times inside those windows. When BOOKING_CONTEXT is present (e.g. opentable_search_url, resy_hint), use for discovery only—never claim a confirmed OpenTable/Resy reservation; suggest the user completes booking in-app or via the link.

Reasoning priority (apply in order):
1. Safety / Hard constraints: Allergies, dietary, mobility — non-negotiable. If any conflict, exclude (score S=0).
2. Contextual logic: Weather, time of day, mode — the "reality" filter. Use get_weather for outdoor plans; use get_planner_items to avoid double-booking.
3. DNA alignment: Interests, lifestyle, values, age, gender — the "delight" filter. Use PRIMARY_USER and PARTNER_USER profile data.
4. Internal supply (priority order): (a) WINKLY_EVENTS_CANDIDATES — public events (keyword + pg_trgm-ranked from DB) for the user's dates/city/activity; if one fits USER_REQUEST, prefer it as options[0] with source "winkly_event" and real winkly_event_id. (b) WINKLY_BUSINESS_CANDIDATES — { services, profiles } from business_services and profiles_business; use for mode business or when a service/venue on Winkly matches; set source "winkly_business_service" or "winkly_business_profile" and include the id field from the row. (c) EXTERNAL_PLACE_HINTS — optional real-world POIs from Google Places (if configured) or OpenStreetMap Nominatim; use for logistics/names only, not as confirmed bookings; cite as external hints in logic_bridge or logistics. You may still call get_winkly_events. Do not fabricate URLs; use website from Winkly rows when present.

Heuristic scoring (think in these terms when ranking options): S = (w1·C) + (w2·V) + (w3·L). C = Compatibility (dietary/allergy); V = Vibe match (venue fits mode + DNA); L = Logistics (distance, transport). Romance: V weighted high (~0.7). Business: L and noise ~0.8. If C fails, S=0.

State machine (follow in order):
1. Analysis: Use PRIMARY_USER and PARTNER_USER (age, gender, city, interests, lifestyle, dietary, values, goals). Compare values and interests across both; resolve friction (e.g. both "Adventure" but one "Mostly relaxed" → Scenic cable car or private boat, not heavy sport). Consider location (city) for venue proximity and vibe.
2. Discovery: Prefer Winkly business_profiles / events as the "Anchor" for at least one option when they match lifestyle/tags.
3. Refinement (Self-critique): Before final output, run a "But" pass. E.g. "I suggested a terrace, but wind 25 km/h → move dinner to enclosed veranda." Check weather, dress code, transport.

Hidden friction (silent needs):
- Transition: If plan has two locations (e.g. Tennis → Dinner), consider Freshness Factor. If first activity is physical and next is fine dining, either add a 45-min Refresh Gap or choose a first venue with showers/towels; state this in a concierge_tip (e.g. "I've chosen this court because they provide towels and showers so you can head straight to dinner").
- Arrival: If transport is Driver, mention parking/valet in logistics. If Uber/Public transit, mention drop-off, well-lit entrance, accessibility.

Conflict resolution: If PARTNER_PLANNER_ITEMS is present, only propose start times that do not overlap the partner's existing commitments. E.g. if partner has something until 17:00, propose 19:00 or later and say so in logic_bridge or a concierge_tip.

When the user provides refinement_feedback (e.g. "more chill", "earlier time"), use delta logic: adjust only what's needed. When refinement_structured is provided, apply consistently: cheaper → suggest lower budget options; earlier → propose earlier times; more_relaxed → calmer, quieter venues; different_vibe → different atmosphere or style.

Context-aware behavior (use source_screen and source_planner_tab from Context to tailor your reply):
- source_screen=planner, source_planner_tab=all: The user is on Planner > All. First analyze what they already have planned (use get_planner_items). Then suggest planning something new — ask if they want to plan for themselves or include others (date, meet-up, business meeting, or event). Offer concrete ideas that fit their existing schedule and preferences.
- source_screen=planner, source_planner_tab=dates: The user is on Planner > Dates. Analyze their existing dates (get_planner_items with source_mode=romance). Ask if they want to plan a date with someone; suggest romantic options (atmosphere, food, activity) and offer to help them plan or refine.
- source_screen=planner, source_planner_tab=meetups: Same for Meet-ups (source_mode=friends). Analyze meet-ups; ask if they want to plan a meet-up with friends or a group; suggest activities, noise level, and group-friendly options.
- source_screen=planner, source_planner_tab=business: Same for Business (source_mode=business). Analyze meetings; suggest business meetings, networking events, or coffee/lunch with contacts; prioritize privacy, Wi-Fi, and professionalism.
- source_screen=planner, source_planner_tab=events: Same for Events (source_mode=events). Analyze saved events; suggest events (Winkly first via get_winkly_events), or plan something event-like (concerts, workshops) and add to planner.
- source_screen=chats or absent: Be helpful for general planning; use mode from Context. If user_prompt or activity_hint is provided, treat it as the main request and adapt. If weather_snapshot is provided, use it to tailor suggestions (e.g. indoor if rain) instead of calling get_weather for that same slot.

Output format: You MUST respond with valid JSON only, no markdown, no preamble. Prefer the DETAILED shape so the UI can show Concierge Tips. Exactly 3 items in "options". Put Winkly options FIRST in the array (so the UI can show "Winkly first"). For any option that comes from a Winkly event (get_winkly_events), include in that option: "source": "winkly_event" and "winkly_event_id": "<event id from the tool result>".

Minimal shape (allowed): {"options":[{"option_name":"...","why_this_fits":"...","schedule":["7:00 PM - Activity",...],"business_link":"...","weather_note":"...","price_indicator":"€|€€|€€€"}]}

Detailed shape (preferred): {"options":[{"option_id":"opt_1","option_name":"...","source":"winkly_event","winkly_event_id":"<uuid>","narrative":"The Core Match","logic_bridge":"One sentence why this fits their DNA.","itinerary":[...],"schedule":["18:00 - ..."],"logistics":{...},"business_link":"...","weather_note":"...","price_indicator":"€€"}]}

If you call tools first, after the final turn return this JSON.`;

/** Variant B: more concise, more "vibe" language — for A/B test (add-to-planner rate, satisfaction). */
const CONCIERGE_SYSTEM_PROMPT_B = `You are Winkly's Concierge. Be concise and vibe-led. Use PRIMARY_USER and PARTNER_USER profile (age, gender, city, interests, lifestyle, dietary) to tailor every suggestion. Prioritize: 1) Safety (allergies, dietary). 2) Context (weather, schedule). 3) DNA match (interests, lifestyle, age, gender). Prefer WINKLY_EVENTS_CANDIDATES then WINKLY_BUSINESS_CANDIDATES when relevant; EXTERNAL_PLACE_HINTS are POI hints only. If a real Winkly event fits, options[0] with source winkly_event + winkly_event_id. Else get_winkly_events. When refinement_structured is provided: cheaper → lower budget; earlier → earlier times; more_relaxed → calmer venues; different_vibe → different atmosphere. Respond with valid JSON only. Exactly 3 items in "options". Put Winkly options first. For options from get_winkly_events include "source": "winkly_event" and "winkly_event_id". Preferred shape: {"options":[{"option_id":"opt_1","option_name":"...","logic_bridge":"Why it fits.","itinerary":[{"time":"18:00","activity":"..."}],"schedule":["18:00 - ..."],"logistics":{...},"price_indicator":"€€"}]}.`;

function getSystemPrompt(variant: "A" | "B"): string {
  return variant === "B" ? CONCIERGE_SYSTEM_PROMPT_B : CONCIERGE_SYSTEM_PROMPT;
}

/** Hash string to number for A/B assignment (stable per user). */
function hashUserId(userId: string): number {
  let h = 0;
  for (let i = 0; i < userId.length; i++) {
    h = ((h << 5) - h) + userId.charCodeAt(i);
    h = h & 0x7fffffff;
  }
  return h;
}

/** Try to parse concierge 3-option JSON from model text (strip markdown code block if present). Accepts "options" or "suggestions" key. */
function parseConciergeOptions(text: string): unknown[] | null {
  let raw = text.trim();
  const codeBlock = raw.match(/^```(?:json)?\s*([\s\S]*?)```$/);
  if (codeBlock) raw = codeBlock[1].trim();
  try {
    const parsed = JSON.parse(raw) as { options?: unknown[]; suggestions?: unknown[] };
    if (Array.isArray(parsed.options) && parsed.options.length >= 1) return parsed.options;
    if (Array.isArray(parsed.suggestions) && parsed.suggestions.length >= 1) return parsed.suggestions;
  } catch {
    // try to find {"options": [...]} or {"suggestions": [...]} in text
    const optionsMatch = raw.match(/\{\s*"options"\s*:\s*(\[[\s\S]*\])\s*\}/);
    if (optionsMatch) {
      try {
        const arr = JSON.parse(optionsMatch[1]) as unknown[];
        if (Array.isArray(arr)) return arr;
      } catch {
        // ignore
      }
    }
    const suggestionsMatch = raw.match(/\{\s*"suggestions"\s*:\s*(\[[\s\S]*\])\s*\}/);
    if (suggestionsMatch) {
      try {
        const arr = JSON.parse(suggestionsMatch[1]) as unknown[];
        if (Array.isArray(arr)) return arr;
      } catch {
        // ignore
      }
    }
  }
  return null;
}

/** Match Bridge — JSON payload returned to the app (CTA + planner confirm). */
type MatchBridgePayload = {
  bridge_message: string;
  proposed_starts_at: string;
  proposed_ends_at?: string | null;
  venue_name: string;
  location_hint?: string;
  activity_theme?: string;
  disclaimer?: string;
};

function parsePlannerItemsArray(raw: string): unknown[] {
  try {
    const p = JSON.parse(raw);
    if (Array.isArray(p)) return p;
  } catch {
    // ignore
  }
  return [];
}

// ——— Match Agent: explicit chain (Extract → Search → Validate weather → Propose). LangGraph-style rules without LangGraph runtime in Deno. ———

const MATCH_AGENT_RULES = `Rules of engagement (enforce in every reply):
1. Never share either user's exact home address or precise residential coordinates with the other person. City / neighborhood and public venue addresses only.
2. Treat every plan as DRAFT until both users confirm in the app (double opt-in). Say that both should confirm.
3. If venue match is weak, suggest a neutral third place (busy café, well-known public spot).
4. Do not share phone numbers or last names. Reservation language: first names or "Winkly" only — never claim a confirmed booking unless the product states otherwise.`;

/** Open-Meteo daily JSON string from getWeather — rain if precipitation_sum day 0 > 3mm. */
function isRainyFromOpenMeteoDailyStr(weatherJson: string): boolean {
  try {
    const d = JSON.parse(weatherJson) as { precipitation_sum?: number[] };
    const p = d.precipitation_sum;
    if (Array.isArray(p) && p.length > 0 && typeof p[0] === "number") return p[0] > 3;
  } catch {
    // ignore
  }
  return false;
}

async function geocodeTwoCityMidpoint(cityA: string, cityB: string): Promise<{ lat: number; lng: number } | null> {
  const ca = cityA.trim();
  const cb = cityB.trim();
  if (!ca && !cb) return null;
  const a = ca ? await geocodeCity(ca) : null;
  const b = cb ? await geocodeCity(cb) : null;
  if (a && b) return { lat: (a.lat + b.lat) / 2, lng: (a.lng + b.lng) / 2 };
  return a ?? b ?? null;
}

async function googlePlacesNearbySearch(params: {
  lat: number;
  lng: number;
  radiusMeters: number;
  keyword: string;
}): Promise<Array<Record<string, unknown>>> {
  const key = Deno.env.get("GOOGLE_PLACES_API_KEY") ?? Deno.env.get("GOOGLE_MAPS_API_KEY");
  if (!key) return [];
  const url = new URL("https://maps.googleapis.com/maps/api/place/nearbysearch/json");
  url.searchParams.set("location", `${params.lat},${params.lng}`);
  url.searchParams.set("radius", String(Math.round(params.radiusMeters)));
  url.searchParams.set("keyword", params.keyword.slice(0, 120));
  url.searchParams.set("key", key);
  const res = await fetch(url.toString());
  const data = await res.json() as { results?: Array<Record<string, unknown>>; status?: string };
  if (data.status !== "OK" && data.status !== "ZERO_RESULTS") return [];
  return (data.results ?? []).slice(0, 10);
}

/** Google Places Details — "vibe" via rating, review count, photo count (no Instagram scraping). */
async function googlePlaceDetailsVibe(placeId: string): Promise<Record<string, unknown> | null> {
  const key = Deno.env.get("GOOGLE_PLACES_API_KEY") ?? Deno.env.get("GOOGLE_MAPS_API_KEY");
  if (!key || !placeId) return null;
  const fields = "name,rating,user_ratings_total,photos";
  const url =
    `https://maps.googleapis.com/maps/api/place/details/json?place_id=${encodeURIComponent(placeId)}&fields=${fields}&key=${encodeURIComponent(key)}`;
  const res = await fetch(url);
  const data = await res.json() as { result?: Record<string, unknown> };
  const r = data.result;
  if (!r) return null;
  const photos = r.photos;
  return {
    name: r.name,
    rating: r.rating,
    user_ratings_total: r.user_ratings_total,
    photo_count: Array.isArray(photos) ? photos.length : 0,
  };
}

type MatchAgentModelJson = {
  chain?: { extract?: string; search_query_used?: string; weather_note?: string };
  draft?: {
    venue_name?: string;
    place_id?: string;
    proposed_time_caption?: string;
    mutual_fit_reason?: string;
    double_opt_in_prompt?: string;
    neutral_third_fallback?: string;
  };
  agent_message?: string;
};

function parseMatchAgentModelJson(text: string): MatchAgentModelJson | null {
  let raw = text.trim();
  const codeBlock = raw.match(/^```(?:json)?\s*([\s\S]*?)```$/);
  if (codeBlock) raw = codeBlock[1].trim();
  try {
    return JSON.parse(raw) as MatchAgentModelJson;
  } catch {
    return null;
  }
}

async function runMatchAgentFinalGemini(geminiKey: string, payload: Record<string, unknown>): Promise<MatchAgentModelJson | null> {
  const MATCH_AGENT_SYSTEM = `${MATCH_AGENT_RULES}

You are Winkly's Match Agent conductor. You receive structured outputs: EXTRACTION line, weather, map search candidates, planner busy blocks — not private chat logs.

Think in steps and put a short summary in "chain":
- extract: one sentence (e.g. "A likes rooftops; B is gluten-free; both free Friday evening").
- search_query_used: what was searched after any weather pivot.
- weather_note: e.g. rain → pivoted to indoor.

Pick ONE primary venue from PLACES_CANDIDATES when possible (use name, rating, place_id). If candidates are weak, set neutral_third_fallback to a safe public option.

Respond with valid JSON only:
{
  "chain": { "extract": "", "search_query_used": "", "weather_note": "" },
  "draft": {
    "venue_name": "",
    "place_id": "",
    "proposed_time_caption": "",
    "mutual_fit_reason": "",
    "double_opt_in_prompt": "",
    "neutral_third_fallback": ""
  },
  "agent_message": "Winkly: ... (conversational; ends with asking both to confirm; no home addresses)"
}`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL_PLAN}:generateContent?key=${encodeURIComponent(geminiKey)}`;
  const body = {
    systemInstruction: { parts: [{ text: MATCH_AGENT_SYSTEM }] },
    contents: [{ role: "user", parts: [{ text: `Structured pipeline output:\n${JSON.stringify(payload)}` }] }],
    generationConfig: {
      maxOutputTokens: 1024,
      temperature: 0.45,
      responseMimeType: "application/json",
    },
  };
  const res = await fetchWithBackoff(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }, { retries: 4, baseMs: 900 });
  if (!res.ok) return null;
  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (typeof text !== "string") return null;
  return parseMatchAgentModelJson(text);
}

async function runMatchAgentFinalOpenAI(openaiKey: string, payload: Record<string, unknown>): Promise<MatchAgentModelJson | null> {
  const sys = `${MATCH_AGENT_RULES}
Output a single JSON object with keys chain, draft, agent_message as in the Gemini spec.`;
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${openaiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      max_tokens: 1200,
      temperature: 0.45,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: sys },
        { role: "user", content: JSON.stringify(payload) },
      ],
    }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  const text = data.choices?.[0]?.message?.content;
  if (typeof text !== "string") return null;
  return parseMatchAgentModelJson(text);
}

async function runMatchAgentPipeline(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  mode: string,
  partnerUserId: string,
  safeContext: Record<string, unknown>,
): Promise<{
  chain: Record<string, unknown>;
  places: unknown[];
  weather_raw: string;
  model: MatchAgentModelJson;
  llmPayload: Record<string, unknown>;
}> {
  const profileCtx = await getConciergeProfileContext(supabase, userId, mode, partnerUserId);
  const p = profileCtx.primary as Record<string, unknown>;
  const o = profileCtx.partner as Record<string, unknown> | undefined;
  const cityP = String(p.city ?? safeContext.city ?? "").trim() || "Berlin";
  const cityO = String(o?.city ?? "").trim() || cityP;
  const dietP = [p.food, p.allergies].filter(Boolean).join("; ");
  const dietO = o ? [o.food, o.allergies].filter(Boolean).join("; ") : "";

  const extract =
    `User A: interests ${JSON.stringify(p.interests ?? [])}; food/diet: ${dietP || "n/a"}. ` +
    `User B: interests ${JSON.stringify(o?.interests ?? [])}; food/diet: ${dietO || "n/a"}. ` +
    `Cities: A=${cityP}, B=${cityO}.`;

  const radiusMiles = typeof safeContext.search_radius_miles === "number"
    ? Math.min(50, Math.max(1, safeContext.search_radius_miles as number))
    : 5;
  const radiusMeters = radiusMiles * 1609.34;

  let mid = await geocodeTwoCityMidpoint(cityP, cityO);
  if (!mid) mid = await geocodeCity(cityP);
  let lat = mid?.lat ?? 52.52;
  let lng = mid?.lng ?? 13.405;
  if (typeof safeContext.latitude === "number" && typeof safeContext.longitude === "number") {
    lat = safeContext.latitude as number;
    lng = safeContext.longitude as number;
  }

  const targetDate = typeof safeContext.target_slot_iso === "string"
    ? (safeContext.target_slot_iso as string).slice(0, 10)
    : typeof safeContext.date_from === "string"
    ? (safeContext.date_from as string).slice(0, 10)
    : new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);

  const weatherRaw = await getWeather(lat, lng, targetDate);
  const rainy = isRainyFromOpenMeteoDailyStr(weatherRaw);

  let keyword = String(safeContext.activity_hint ?? safeContext.user_prompt ?? "date night dinner drinks").trim();
  if (!keyword) keyword = "restaurant";
  if (rainy) keyword = `cozy indoor ${keyword}`;
  const gl = `${dietP} ${dietO}`.toLowerCase();
  if (gl.includes("gluten")) keyword = `${keyword} gluten-free`;

  let places: Array<Record<string, unknown>> = await googlePlacesNearbySearch({
    lat,
    lng,
    radiusMeters,
    keyword: keyword.slice(0, 100),
  });

  if (places.length === 0) {
    const hints = await fetchExternalVenueHints({
      activityHint: keyword,
      planRequest: extract,
      city: cityP,
      country: typeof safeContext.country === "string" ? safeContext.country : undefined,
    });
    places = (hints as Array<Record<string, unknown>>).slice(0, 8);
  }

  const enriched: unknown[] = [];
  for (const pl of places.slice(0, 6)) {
    const pid = pl.place_id as string | undefined;
    if (pid) {
      const vibe = await googlePlaceDetailsVibe(pid);
      enriched.push({ ...pl, place_vibe: vibe });
    } else enriched.push(pl);
  }

  const pCal = await getPlannerItemsForUser(supabase, userId, mode === "romance" ? "romance" : undefined);
  const oCal = await getPlannerItemsForUser(supabase, partnerUserId, mode === "romance" ? "romance" : undefined);

  const llmPayload: Record<string, unknown> = {
    RULES: MATCH_AGENT_RULES,
    EXTRACTION: extract,
    SEARCH_CENTER: { lat, lng, radius_miles: radiusMiles, keyword_used: keyword },
    WEATHER_OPEN_METEO_DAILY: weatherRaw,
    WEATHER_PIVOT_APPLIED: rainy,
    PLACES_CANDIDATES: enriched,
    PRIMARY_PLANNER_ITEMS: parsePlannerItemsArray(pCal),
    PARTNER_PLANNER_ITEMS: parsePlannerItemsArray(oCal),
    TARGET_DATE: targetDate,
    TOOL_EQUIVALENTS: {
      search_restaurants: "Google Places nearby + optional OSM fallback",
      check_calendar_availability: "planner_items merge for both users",
      get_place_vibe: "Place Details rating + photo_count (not Instagram)",
    },
  };

  const geminiKey = Deno.env.get("GEMINI_API_KEY");
  const openaiKey = Deno.env.get("OPENAI_API_KEY");
  let model: MatchAgentModelJson | null = null;
  if (geminiKey) model = await runMatchAgentFinalGemini(geminiKey, llmPayload);
  if (!model && openaiKey) model = await runMatchAgentFinalOpenAI(openaiKey, llmPayload);
  if (!model) {
    model = {
      chain: {
        extract: extract.slice(0, 400),
        search_query_used: keyword,
        weather_note: rainy ? "Rain expected — prefer indoor." : "Weather acceptable for outdoor.",
      },
      draft: {
        venue_name: enriched[0] && typeof (enriched[0] as { name?: string }).name === "string"
          ? String((enriched[0] as { name: string }).name)
          : "A popular café in your area",
        place_id: (() => {
          const first = places[0] as { place_id?: string } | undefined;
          return first && typeof first.place_id === "string" ? first.place_id : undefined;
        })(),
        proposed_time_caption: "Friday 7:30 PM",
        mutual_fit_reason: "Shared interests and dietary alignment where data exists.",
        double_opt_in_prompt: "Please confirm in Winkly if this works for you — your match will confirm separately.",
      },
      agent_message:
        `Winkly: I've drafted a first meet-up idea for ${targetDate}. ` +
        `I picked a public venue suited to your preferences${rainy ? " (leaning indoor given the forecast)" : ""}. ` +
        `Both of you can confirm in the app — no addresses from home are shared.`,
    };
  }

  return {
    chain: (model.chain ?? {}) as Record<string, unknown>,
    places: enriched,
    weather_raw: weatherRaw,
    model,
    llmPayload,
  };
}

const MATCH_BRIDGE_SYSTEM = `You are Winkly's Match Bridge AI. Two users just matched on Romance mode. Your job is to propose ONE concrete first meet-up using their profiles and schedules.

Output a single JSON object only (no markdown), with this exact shape:
{
  "bridge_message": "One short paragraph (max 360 characters). Friendly, specific. Mention a shared interest or compatible dietary/food prefs when data supports it. Name a weekday and time when BOTH can plausibly meet: use PRIMARY_PLANNER_ITEMS and PARTNER_PLANNER_ITEMS as busy blocks; use PRIMARY_DEVICE_FREE_SLOTS when present. You may reference a venue name from EXTERNAL_PLACE_HINTS or WINKLY_BUSINESS_CANDIDATES when helpful. Phrase booking as a helpful suggestion (e.g. 'I've lined up' or 'we suggest') — not a legally binding reservation. End with an invitation to tap Confirm.",
  "proposed_starts_at": "ISO 8601 datetime in the user's local intent (use a sensible default offset if unknown)",
  "proposed_ends_at": "ISO 8601 or null (e.g. 90 minutes after start for coffee)",
  "venue_name": "Short venue label (e.g. café name) or 'Coffee nearby'",
  "location_hint": "City or area string or null",
  "activity_theme": "coffee|brunch|walk|drinks|other",
  "disclaimer": "One line: venue is a suggestion; confirm in-app and with the venue."
}

Rules:
- Respect dietary restrictions and allergies from PRIMARY_USER and PARTNER_USER (food, allergies fields). Never suggest conflicting food venues.
- If schedules conflict heavily, pick the next reasonable slot and say so briefly in bridge_message.
- Never invent full street addresses. Prefer hints from EXTERNAL_PLACE_HINTS or WINKLY_EVENTS_CANDIDATES when aligned.
- If PARTNER_DEVICE_FREE_SLOTS is empty, infer only from PARTNER_PLANNER_ITEMS (busy) vs typical daytime windows; do not claim you read the partner's phone calendar.`;

function parseMatchBridgePayload(text: string): MatchBridgePayload | null {
  let raw = text.trim();
  const codeBlock = raw.match(/^```(?:json)?\s*([\s\S]*?)```$/);
  if (codeBlock) raw = codeBlock[1].trim();
  try {
    const p = JSON.parse(raw) as MatchBridgePayload;
    if (typeof p.bridge_message === "string" && typeof p.proposed_starts_at === "string" && typeof p.venue_name === "string") {
      return p;
    }
  } catch {
    // try to extract JSON object
    const obj = raw.match(/\{[\s\S]*"bridge_message"[\s\S]*\}/);
    if (obj) {
      try {
        const p = JSON.parse(obj[0]) as MatchBridgePayload;
        if (typeof p.bridge_message === "string" && typeof p.proposed_starts_at === "string") return p;
      } catch {
        // ignore
      }
    }
  }
  return null;
}

function fallbackMatchBridge(
  primary: Record<string, unknown>,
  partner: Record<string, unknown>,
  city: string,
): MatchBridgePayload {
  const pi = Array.isArray(primary.interests) ? (primary.interests as string[]) : [];
  const pr = Array.isArray(partner.interests) ? (partner.interests as string[]) : [];
  const shared = pi.filter((x) => pr.includes(x));
  const theme = shared.length > 0 ? shared.slice(0, 2).join(" & ") : "getting to know each other";
  const d = new Date();
  d.setDate(d.getDate() + 3);
  d.setHours(10, 0, 0, 0);
  const starts = d.toISOString();
  const ends = new Date(d.getTime() + 90 * 60 * 1000).toISOString();
  const cityBit = city ? ` ${city} is a great place to meet.` : "";
  return {
    bridge_message:
      `You both like ${theme}.${cityBit} Tuesday at 10:00 AM could work — tap Confirm to send a date invite with a café suggestion (not a confirmed booking).`,
    proposed_starts_at: starts,
    proposed_ends_at: ends,
    venue_name: "A café nearby",
    location_hint: city || undefined,
    activity_theme: "coffee",
    disclaimer: "Suggestions are not confirmed reservations. Confirm with the venue and each other.",
  };
}

async function runMatchBridgeGeminiJson(
  geminiKey: string,
  payload: Record<string, unknown>,
): Promise<MatchBridgePayload | null> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(geminiKey)}`;
  const body = {
    systemInstruction: { parts: [{ text: MATCH_BRIDGE_SYSTEM }] },
    contents: [{ role: "user", parts: [{ text: `Context JSON:\n${JSON.stringify(payload)}` }] }],
    generationConfig: {
      maxOutputTokens: 768,
      temperature: 0.55,
      responseMimeType: "application/json",
    },
  };
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) return null;
  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (typeof text !== "string") return null;
  return parseMatchBridgePayload(text);
}

async function runMatchBridgeOpenAIJson(
  openaiKey: string,
  payload: Record<string, unknown>,
): Promise<MatchBridgePayload | null> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${openaiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      max_tokens: 900,
      temperature: 0.55,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: MATCH_BRIDGE_SYSTEM },
        { role: "user", content: `Context JSON:\n${JSON.stringify(payload)}` },
      ],
    }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  const text = data.choices?.[0]?.message?.content;
  if (typeof text !== "string") return null;
  return parseMatchBridgePayload(text);
}

// Gemini function declarations (same capabilities as OPENAI_TOOLS)
const GEMINI_FUNCTION_DECLARATIONS = [
  {
    name: "get_weather",
    description: "Get weather forecast for a location. Use latitude and longitude, or city name to geocode first.",
    parameters: {
      type: "object",
      properties: {
        latitude: { type: "number", description: "Latitude" },
        longitude: { type: "number", description: "Longitude" },
        date: { type: "string", description: "Optional date (YYYY-MM-DD) for forecast" },
      },
      required: ["latitude", "longitude"],
    },
  },
  {
    name: "get_winkly_events",
    description: "Get Winkly events (always prefer these over external suggestions). Filter by mode, date range.",
    parameters: {
      type: "object",
      properties: {
        mode: { type: "string", enum: ["romance", "friends", "business", "events"], description: "Event mode" },
        date_from: { type: "string", description: "ISO date from" },
        date_to: { type: "string", description: "ISO date to" },
        limit: { type: "number", description: "Max events to return" },
      },
    },
  },
  {
    name: "get_planner_items",
    description: "Get the user's planner items (dates, meetups, meetings) to avoid double-booking and give context.",
    parameters: {
      type: "object",
      properties: {
        source_mode: { type: "string", enum: ["romance", "friends", "business", "events"], description: "Optional filter by source" },
      },
    },
  },
];

/** App already fetched weather for the user's location/dates — omit get_weather to avoid duplicate API calls and match "what user would paste". */
function hasClientWeatherSnapshot(ctx: Record<string, unknown>): boolean {
  const w = ctx.weather_snapshot;
  return w != null && typeof w === "object";
}

function conciergeOpenAiTools(ctx: Record<string, unknown>) {
  if (hasClientWeatherSnapshot(ctx)) {
    return OPENAI_TOOLS.filter((t) => t.function.name !== "get_weather");
  }
  return OPENAI_TOOLS;
}

function conciergeGeminiTools(ctx: Record<string, unknown>) {
  if (hasClientWeatherSnapshot(ctx)) {
    return GEMINI_FUNCTION_DECLARATIONS.filter((d) => d.name !== "get_weather");
  }
  return GEMINI_FUNCTION_DECLARATIONS;
}

/** User message: optional verbatim form text + structured JSON (same facts as typing into Gemini). */
function conciergeUserMessage(task: string, context: Record<string, unknown>): string {
  const pr = typeof context.plan_request_text === "string" ? context.plan_request_text.trim() : "";
  if (pr) {
    const rest = { ...context };
    delete rest.plan_request_text;
    return `USER_REQUEST (what the user filled in the app — treat as their exact prompt to you):\n\n${pr}\n\n---\nTask: ${task}. Structured context (for tools; weather is in weather_snapshot when present): ${JSON.stringify(rest)}`;
  }
  return `Task: ${task}. Context: ${JSON.stringify(context)}`;
}

function conciergeSystemPromptAugment(base: string, context: Record<string, unknown>): string {
  const hasPr = typeof context.plan_request_text === "string" && String(context.plan_request_text).trim().length > 0;
  const parts = [base];
  if (hasPr) {
    parts.push(
      "When USER_REQUEST appears in the user message, it is the authoritative brief (topic, place, dates, budget, weather). Follow it. Do not invent a different city, date range, or budget.",
    );
  }
  if (hasClientWeatherSnapshot(context)) {
    parts.push(
      "The get_weather tool is not available: the app already supplied weather_snapshot. Use only that weather for outdoor/indoor decisions.",
    );
  }
  if (context.presentation === "decisive") {
    parts.push(
      "DECISIVE MODE — OVERRIDES PRIOR \"Exactly 3 items\" INSTRUCTION: Return exactly 2 items in \"options\" (not 3). options[0] = your single best recommendation (primary). options[1] = one backup if the primary is unavailable or a poor fit—briefly say why in logic_bridge or narrative. Put Winkly-sourced rows first when applicable.",
    );
  }
  return parts.join("\n\n");
}

async function runGeminiWithTools(
  geminiKey: string,
  userId: string,
  task: string,
  context: Record<string, unknown>,
  supabase: ReturnType<typeof createClient>,
  systemPrompt: string
): Promise<{ message: string; suggestions?: unknown[] }> {
  const userContent = conciergeUserMessage(task, context);
  const sysFull = conciergeSystemPromptAugment(systemPrompt, context);
  // Model routing (cost optimization)
  const model =
    task === "chat_topics"
      ? GEMINI_MODEL_TOPICS
      : task === "winkly_plan" || task === "planner_theme_plans"
        ? GEMINI_MODEL_PLAN
        : GEMINI_MODEL;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(geminiKey)}`;

  type Part = { text?: string; functionCall?: { name: string; args?: Record<string, unknown> }; functionResponse?: { name: string; response: Record<string, unknown> } };
  const contents: Array<{ role: string; parts: Part[] }> = [
    { role: "user", parts: [{ text: userContent }] },
  ];

  const maxTurns = 5;
  let turn = 0;

  while (turn < maxTurns) {
    const body: Record<string, unknown> = {
      systemInstruction: { parts: [{ text: sysFull }] },
      contents,
      generationConfig: { maxOutputTokens: 1024, temperature: 0.7 },
    };
    // Grounding control: only enable Gemini tools (Maps/Search/etc.) for final plan phase.
    // We treat winkly_plan + concierge/plan/event_suggest as "final"; topic/theme previews should not invoke tools.
    if (["plan", "concierge", "event_suggest", "winkly_plan"].includes(task)) {
      body.tools = [{ functionDeclarations: conciergeGeminiTools(context) }];
    }

    let res = await fetchWithBackoff(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }, { retries: 4, baseMs: 900 });

    // Legacy 429 retry logic removed: handled by fetchWithBackoff (with jitter + Retry-After support).

    if (!res.ok) {
      const err = await res.text();
      console.error("[ai-gateway] Gemini !ok status=" + res.status + " body=" + err.slice(0, 400));
      const friendly = res.status === 429
        ? "The AI provider is rate-limiting. Wait a minute and try again, or use a paid API key for higher limits."
        : res.status === 401 || res.status === 403
          ? "Invalid or restricted API key. Check your Gemini/OpenAI key in Supabase secrets."
          : `AI temporarily unavailable (${res.status}). Try again in a moment.`;
      if (res.status === 429) {
        return { message: friendly, suggestions: [], statusCode: 429 as const, retry_after: 60, provider_status: res.status };
      }
      return { message: friendly, suggestions: [], provider_status: res.status };
    }

    const data = await res.json();
    const candidate = data.candidates?.[0];
    if (!candidate?.content?.parts?.length) {
      return { message: "No response from AI.", suggestions: [], no_options_reason: "No response from AI." };
    }

    const part = candidate.content.parts[0];
    if (part.functionCall) {
      const name = part.functionCall.name as string;
      const args = (part.functionCall.args ?? {}) as Record<string, unknown>;
      let toolResult: string;
      if (name === "get_weather") {
        let lat = args.latitude as number;
        let lng = args.longitude as number;
        if ((lat == null || lng == null) && context.city) {
          const coords = await geocodeCity(String(context.city));
          if (coords) {
            lat = coords.lat;
            lng = coords.lng;
          }
        }
        if (lat != null && lng != null) {
          toolResult = await getWeather(lat, lng, args.date as string);
        } else {
          toolResult = JSON.stringify({ error: "Need latitude/longitude or city in context" });
        }
      } else if (name === "get_winkly_events") {
        toolResult = await getWinklyEvents(supabase, {
          mode: args.mode as string,
          dateFrom: args.date_from as string,
          dateTo: args.date_to as string,
          limit: (args.limit as number) ?? 10,
        });
      } else if (name === "get_planner_items") {
        toolResult = await getPlannerItemsForUser(supabase, userId, args.source_mode as string);
      } else {
        toolResult = JSON.stringify({ error: "Unknown tool" });
      }
      contents.push({ role: "model", parts: [{ functionCall: { name, args } }] });
      contents.push({ role: "user", parts: [{ functionResponse: { name, response: { result: toolResult } } }] });
      turn++;
      continue;
    }

    const text = part.text?.trim() || "";
    const options = parseConciergeOptions(text);
    const list = options ?? [];
    const noOptionsReason = list.length === 0 && text ? (text.slice(0, 120).replace(/\n/g, " ").trim() + (text.length > 120 ? "…" : "")) : undefined;
    return { message: text, suggestions: list, no_options_reason: noOptionsReason };
  }

  return { message: "Planning took too many steps. Please try again.", suggestions: [], no_options_reason: "Planning took too many steps." };
}

async function runOpenAIWithTools(
  openaiKey: string,
  userId: string,
  task: string,
  context: Record<string, unknown>,
  supabase: ReturnType<typeof createClient>,
  systemPrompt: string
): Promise<{ message: string; suggestions?: unknown[] }> {
  const userContent = conciergeUserMessage(task, context);
  const sysFull = conciergeSystemPromptAugment(systemPrompt, context);
  const messages: Array<{ role: "system" | "user" | "assistant"; content?: string; tool_calls?: unknown[]; tool_call_id?: string; name?: string }> = [
    { role: "system", content: sysFull },
    { role: "user", content: userContent },
  ];

  const url = "https://api.openai.com/v1/chat/completions";
  const maxTurns = 5;
  let turn = 0;

  while (turn < maxTurns) {
    const body: Record<string, unknown> = {
      model: "gpt-4o-mini",
      messages,
      max_tokens: 1024,
    };
    if (["plan", "concierge", "event_suggest"].includes(task)) {
      body.tools = conciergeOpenAiTools(context);
      body.tool_choice = "auto";
    }

    let res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${openaiKey}`,
      },
      body: JSON.stringify(body),
    });

    // Retry on 429 (burst / RPM): concierge tool loop can trigger several calls per tap.
    if (!res.ok && res.status === 429) {
      const errBody = await res.text();
      console.error("[ai-gateway] OpenAI 429 (turn " + turn + "), retrying in 4s. Body: " + errBody.slice(0, 300));
      await new Promise((r) => setTimeout(r, 4000));
      res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${openaiKey}`,
        },
        body: JSON.stringify(body),
      });
      if (!res.ok && res.status === 429) {
        console.error("[ai-gateway] OpenAI 429 again, retrying in 12s.");
        await new Promise((r) => setTimeout(r, 12000));
        res = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${openaiKey}`,
          },
          body: JSON.stringify(body),
        });
      }
    }

    if (!res.ok) {
      const err = await res.text();
      console.error("[ai-gateway] OpenAI !ok status=" + res.status + " body=" + err.slice(0, 400));
      const friendly = res.status === 429
        ? "The AI provider is rate-limiting. Wait a minute and try again, or use a paid API key for higher limits."
        : res.status === 401 || res.status === 403
          ? "Invalid or restricted API key. Check your Gemini/OpenAI key in Supabase secrets."
          : `AI temporarily unavailable (${res.status}). Try again in a moment.`;
      if (res.status === 429) {
        return { message: friendly, suggestions: [], statusCode: 429 as const, retry_after: 60, provider_status: res.status };
      }
      return { message: friendly, suggestions: [], provider_status: res.status };
    }

    const data = await res.json();
    const choice = data.choices?.[0];
    if (!choice) return { message: "No response from AI.", suggestions: [], no_options_reason: "No response from AI." };

    const delta = choice.message;
    if (delta.tool_calls?.length) {
      for (const tc of delta.tool_calls) {
        const name = tc.function?.name;
        let args: Record<string, unknown> = {};
        try {
          args = typeof tc.function?.arguments === "string" ? JSON.parse(tc.function.arguments) : {};
        } catch {
          args = {};
        }
        let toolResult: string;
        if (name === "get_weather") {
          let lat = args.latitude as number;
          let lng = args.longitude as number;
          if ((lat == null || lng == null) && context.city) {
            const coords = await geocodeCity(String(context.city));
            if (coords) {
              lat = coords.lat;
              lng = coords.lng;
            }
          }
          if (lat != null && lng != null) {
            toolResult = await getWeather(lat, lng, args.date as string);
          } else {
            toolResult = JSON.stringify({ error: "Need latitude/longitude or city in context" });
          }
        } else if (name === "get_winkly_events") {
          toolResult = await getWinklyEvents(supabase, {
            mode: args.mode as string,
            dateFrom: args.date_from as string,
            dateTo: args.date_to as string,
            limit: (args.limit as number) ?? 10,
          });
        } else if (name === "get_planner_items") {
          toolResult = await getPlannerItemsForUser(supabase, userId, args.source_mode as string);
        } else {
          toolResult = JSON.stringify({ error: "Unknown tool" });
        }
        messages.push({
          role: "assistant",
          content: null,
          tool_calls: [{ id: tc.id, type: "function", function: { name, arguments: tc.function?.arguments } }],
        });
        messages.push({
          role: "user",
          tool_call_id: tc.id,
          name,
          content: toolResult,
        });
      }
      turn++;
      continue;
    }

    const text = delta.content?.trim() || "";
    const options = parseConciergeOptions(text);
    const list = options ?? [];
    const noOptionsReason = list.length === 0 && text ? (text.slice(0, 120).replace(/\n/g, " ").trim() + (text.length > 120 ? "…" : "")) : undefined;
    return { message: text, suggestions: list, no_options_reason: noOptionsReason };
  }

  return { message: "Planning took too many steps. Please try again.", suggestions: [], no_options_reason: "Planning took too many steps." };
}

async function getPlanningProfileRows(
  supabase: ReturnType<typeof createClient>,
  userIds: string[],
  mode: string,
): Promise<Array<{ user_id: string; interests: unknown; meta: unknown; city: unknown }>> {
  const unique = [...new Set(userIds)].filter(Boolean);
  if (unique.length === 0) return [];
  const [modeRows, coreRows] = await Promise.all([
    supabase.from("profiles_mode").select("user_id, interests, meta").in("user_id", unique).eq("mode", mode).limit(50),
    supabase.from("profiles_core").select("id, city").in("id", unique).limit(50),
  ]);
  const coreCity = new Map<string, unknown>((coreRows.data ?? []).map((r: { id: string; city?: unknown }) => [r.id, r.city]));
  return (modeRows.data ?? []).map((r: { user_id: string; interests?: unknown; meta?: unknown }) => ({
    user_id: r.user_id,
    interests: r.interests,
    meta: r.meta,
    city: coreCity.get(r.user_id),
  }));
}

function pickPlanningFieldsFromMeta(meta: Record<string, unknown> | null | undefined): {
  allergies?: unknown;
  lifestyle?: unknown;
  hobbies?: unknown;
} {
  const m = (meta ?? {}) as Record<string, unknown>;
  return {
    allergies: m.allergies,
    lifestyle: m.lifestyle ?? m.lifestyle_tags,
    // Accept a few legacy keys used across onboarding/profile editors.
    hobbies: m.hobbies ?? m.activity_tags ?? m.sports_tags ?? m.creative_tags,
  };
}

function safeIsoOrNull(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const d = new Date(v);
  if (isNaN(d.getTime())) return null;
  return d.toISOString();
}

function parseWinklyPlanOutput(text: string): WinklyPlanOutput | null {
  let raw = text.trim();
  const codeBlock = raw.match(/^```(?:json)?\s*([\s\S]*?)```$/);
  if (codeBlock) raw = codeBlock[1].trim();
  let obj: unknown;
  try {
    obj = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!obj || typeof obj !== "object") return null;
  const o = obj as Record<string, unknown>;

  const topic = typeof o.topic === "string" ? o.topic.trim() : "";
  const date_time = safeIsoOrNull(o.date_time) ?? "";
  const duration = typeof o.duration === "number" && isFinite(o.duration) ? Math.round(o.duration) : NaN;
  const weather_context = typeof o.weather_context === "string" ? o.weather_context.trim() : "";
  const logic_reasoning = typeof o.logic_reasoning === "string" ? o.logic_reasoning.trim() : "";
  const booking_links = Array.isArray(o.booking_links) ? o.booking_links.filter((x) => typeof x === "string").map((s) => s.trim()).filter(Boolean).slice(0, 6) : [];

  const ld = o.location_details;
  let location_details: WinklyPlanOutput["location_details"] | null = null;
  if (ld && typeof ld === "object") {
    const ldo = ld as Record<string, unknown>;
    const name = typeof ldo.name === "string" ? ldo.name.trim() : "";
    const address = typeof ldo.address === "string" ? ldo.address.trim() : "";
    const link = typeof ldo.google_maps_link === "string" ? ldo.google_maps_link.trim() : "";
    if (name) location_details = { name, address, google_maps_link: link };
  }

  if (!topic || !date_time || !isFinite(duration) || duration <= 0 || !location_details || !weather_context || !logic_reasoning) {
    return null;
  }

  return {
    topic: topic.slice(0, 120),
    date_time,
    duration: Math.min(24 * 60, Math.max(30, duration)),
    location_details,
    weather_context: weather_context.slice(0, 400),
    booking_links,
    logic_reasoning: logic_reasoning.slice(0, 600),
  };
}

function noVenueFoundPlan(seed: Omit<WinklyPlanOutput, "location_details">): WinklyPlanOutput {
  return {
    ...seed,
    location_details: { name: "No suitable venue found", address: "", google_maps_link: "" },
  };
}

/**
 * Winkly Concierge Agent — stateless plan generator
 * Implements: multi-profile context aggregation + Gemini with web/maps grounding (best-effort) + strict JSON output.
 */
async function generateWinklyPlan(params: {
  supabase: ReturnType<typeof createClient>;
  requesterUserId: string;
  conversationId?: string | null;
  input: WinklyPlanInput;
  /** When true, insert into pending_plans as a draft that requires confirmation. */
  persistDraft?: boolean;
  /** Grounding control: reduce Maps cost for previews. */
  maps_grounding?: "none" | "textsearch" | "verify";
}): Promise<{
  plan: WinklyPlanOutput;
  pending_plan_id: string | null;
  provider: "gemini" | "fallback";
  location_id: string | null;
  booking_url: string | null;
  participants: string[];
}> {
  const { supabase, requesterUserId, input, conversationId, persistDraft = true, maps_grounding = "verify" } = params;

  const participantIds = [...new Set(input.participant_user_ids)].filter(Boolean);
  let ensureRequester = participantIds.includes(requesterUserId) ? participantIds : [requesterUserId, ...participantIds];

  // Metadata Filtering / strict isolation: if a conversation_id is provided, only allow participants
  // who are members of that conversation, and require the requester to be a member as well.
  if (conversationId) {
    try {
      const { data: cmRows } = await supabase
        .from("conversation_members")
        .select("user_id")
        .eq("conversation_id", conversationId)
        .is("left_at", null)
        .limit(60);
      const memberIds = new Set((cmRows ?? []).map((r: { user_id: string }) => r.user_id));
      if (!memberIds.has(requesterUserId)) {
        // If requester isn't a member, drop conversation scoping (no chat linkage).
        // The plan will still be generated for requester-only.
        ensureRequester = [requesterUserId];
      } else {
        ensureRequester = ensureRequester.filter((uid) => memberIds.has(uid));
        if (ensureRequester.length === 0) ensureRequester = [requesterUserId];
      }
    } catch {
      // If membership lookups fail, fall back to requester-only for safety.
      ensureRequester = [requesterUserId];
    }
  }

  // Context caching (reduce token + DB cost on refinements / repeats)
  const ctxCacheKey = conversationId
    ? `ctx:participants:${conversationId}:${input.mode}:${hashKeyMaterial(ensureRequester.slice().sort().join(","))}`
    : `ctx:participants:noconv:${requesterUserId}:${input.mode}:${hashKeyMaterial(ensureRequester.slice().sort().join(","))}`;
  const cachedProfiles = await redisGetJson<Array<{ user_id: string; interests: unknown; meta: unknown; city: unknown }>>(ctxCacheKey);
  const planningRows = cachedProfiles ?? await getPlanningProfileRows(supabase, ensureRequester, input.mode);
  if (!cachedProfiles) {
    await redisSetJson(ctxCacheKey, planningRows, 86400).catch(() => {});
  }
  const profileById = new Map(planningRows.map((r) => [r.user_id, r]));

  const profiles = ensureRequester.map((uid) => {
    const r = profileById.get(uid);
    const meta = (r?.meta ?? {}) as Record<string, unknown>;
    const { allergies, lifestyle, hobbies } = pickPlanningFieldsFromMeta(meta);
    return {
      user_id: uid,
      location: typeof r?.city === "string" ? r?.city : undefined,
      interests: Array.isArray(r?.interests) ? r?.interests : [],
      allergies,
      lifestyle,
      hobbies: Array.isArray(hobbies) ? hobbies : typeof hobbies === "string" ? [hobbies] : [],
    };
  });

  const city = (input.planning_form.city ?? undefined) ||
    (typeof profiles[0]?.location === "string" ? profiles[0].location : undefined) ||
    "Berlin";
  const country = input.planning_form.country ?? undefined;
  const dt = safeIsoOrNull(input.planning_form.date_time) ?? new Date(Date.now() + 3 * 86400000).toISOString();
  const amount = input.planning_form.budget?.amount ?? null;
  const currency = input.planning_form.budget?.currency ?? null;
  const userIdea = (input.planning_form.user_idea ?? "").trim();
  const weather = input.planning_form.weather ?? null;

  const planSeed: Omit<WinklyPlanOutput, "location_details"> = {
    topic: userIdea ? userIdea.slice(0, 120) : "Plan",
    date_time: dt,
    duration: 120,
    weather_context: weather ? scrubPiiText(JSON.stringify(weather)).slice(0, 400) : "Weather not provided.",
    booking_links: [],
    logic_reasoning: "Generated from shared profile overlaps and constraints.",
  };

  const geminiKey = Deno.env.get("GEMINI_API_KEY");
  if (!geminiKey) {
    const fallback = noVenueFoundPlan({
      ...planSeed,
      logic_reasoning: "AI is not configured (missing GEMINI_API_KEY). No suitable venue found.",
    });
    return {
      plan: fallback,
      pending_plan_id: null,
      provider: "fallback",
      location_id: null,
      booking_url: null,
      participants: ensureRequester,
    };
  }

  // Maps grounding (cost control)
  // - none: do not call Places
  // - textsearch: use a single Places Text Search to ground venue name/address/link (no details)
  // - verify: Text Search + Place Details for booking_url (final phase)
  const mapsKey = Deno.env.get("GOOGLE_PLACES_API_KEY") ?? Deno.env.get("GOOGLE_MAPS_API_KEY");
  const ideaForSearch = userIdea || profiles.map((p) => (Array.isArray(p.interests) ? p.interests.slice(0, 2).join(", ") : "")).filter(Boolean).join(", ") || "date night";
  const query = `${ideaForSearch} in ${[city, country].filter(Boolean).join(", ")}`.slice(0, 220);
  let placeCandidate: { name?: string; formatted_address?: string; place_id?: string } | null = null;
  if (maps_grounding !== "none" && mapsKey) {
    try {
      const url =
        `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(query)}&key=${encodeURIComponent(mapsKey)}`;
      const res = await fetch(url);
      const data = await res.json() as { status?: string; results?: Array<Record<string, unknown>> };
      if (data.status === "OK" && Array.isArray(data.results) && data.results.length > 0) {
        const r0 = data.results[0];
        placeCandidate = {
          name: typeof r0.name === "string" ? r0.name : undefined,
          formatted_address: typeof r0.formatted_address === "string" ? r0.formatted_address : undefined,
          place_id: typeof r0.place_id === "string" ? r0.place_id : undefined,
        };
      }
    } catch {
      placeCandidate = null;
    }
  }

  // Grounded venue payload (Text Search). For verify phase we still require this to exist.
  const verifiedVenue =
    placeCandidate?.name && placeCandidate.place_id
      ? {
        name: placeCandidate.name,
        address: placeCandidate.formatted_address ?? "",
        google_maps_link: `https://www.google.com/maps/place/?q=place_id:${placeCandidate.place_id}`,
      }
      : null;
  const verifiedPlaceId = placeCandidate?.place_id && verifiedVenue ? placeCandidate.place_id : null;

  // Hallucination guardrail: Only provide a booking_url that is verified via Maps/Places.
  // If no verified link exists, booking_url must be null.
  let verifiedBookingUrl: string | null = null;
  if (maps_grounding === "verify" && mapsKey && verifiedPlaceId) {
    try {
      const fields = encodeURIComponent("website,url");
      const url =
        `https://maps.googleapis.com/maps/api/place/details/json?place_id=${encodeURIComponent(verifiedPlaceId)}&fields=${fields}&key=${encodeURIComponent(mapsKey)}`;
      const res = await fetch(url);
      const data = await res.json() as { status?: string; result?: { website?: unknown; url?: unknown } };
      if (data.status === "OK" && data.result) {
        const website = typeof data.result.website === "string" ? data.result.website.trim() : "";
        const mapsUrl = typeof data.result.url === "string" ? data.result.url.trim() : "";
        const pick = website || mapsUrl;
        if (pick && /^https?:\/\//i.test(pick)) verifiedBookingUrl = pick.slice(0, 600);
      }
    } catch {
      verifiedBookingUrl = null;
    }
  }

  const SYSTEM = `You are Winkly Concierge Agent.

You will receive: multiple participant profiles (interests, allergies, lifestyle, location) and planning form data (idea/date_time/budget/weather).

Rules:
- Validate the user's idea against ALL participant constraints.
- If the idea is empty, propose ONE best option based on profile overlaps (do not list 5; we need a single plan object).
- Never invent a venue. If VERIFIED_VENUE is missing, you MUST set location_details.name = "No suitable venue found" and leave address and google_maps_link empty.
- booking_links must be empty unless BOOKING_URL is provided.
- Output MUST be valid JSON and follow the required schema exactly.

Required JSON schema:
{
  "topic": string,
  "date_time": string (ISO),
  "duration": number (minutes),
  "location_details": { "name": string, "address": string, "google_maps_link": string },
  "weather_context": string,
  "booking_links": string[],
  "logic_reasoning": string
}`;

  const payload = {
    participant_profiles: profiles,
    planning_form: {
      user_idea: userIdea || null,
      date_time: dt,
      budget: { amount, currency },
      weather,
      city,
      country,
    },
    VERIFIED_VENUE: verifiedVenue,
    NOTE: "If VERIFIED_VENUE is null, location_details must be No suitable venue found.",
  };

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(geminiKey)}`;
  const body = {
    systemInstruction: { parts: [{ text: SYSTEM }] },
    contents: [{ role: "user", parts: [{ text: JSON.stringify(payload) }] }],
    generationConfig: {
      maxOutputTokens: 900,
      temperature: 0.5,
      responseMimeType: "application/json",
    },
  };
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) {
    const fallback = noVenueFoundPlan({
      ...planSeed,
      logic_reasoning: "AI provider error. No suitable venue found.",
    });
    return {
      plan: fallback,
      pending_plan_id: null,
      provider: "fallback",
      location_id: verifiedPlaceId,
      booking_url: verifiedBookingUrl,
      participants: ensureRequester,
    };
  }
  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  const parsed = typeof text === "string" ? parseWinklyPlanOutput(text) : null;

  let finalPlan: WinklyPlanOutput = parsed ?? noVenueFoundPlan({
    ...planSeed,
    logic_reasoning: "AI returned invalid JSON. No suitable venue found.",
  });

  // Guardrail: enforce "no venue" if not verified.
  if (!verifiedVenue) {
    finalPlan = noVenueFoundPlan({
      ...finalPlan,
      logic_reasoning: finalPlan.logic_reasoning || "No suitable venue found.",
    });
  }

  // Persist to pending_plans (draft) only when requested.
  // Topic/option generation in UI should not create pending plans until user confirms.
  let pendingPlanId: string | null = null;
  if (persistDraft) {
    try {
      const ins = await supabase.from("pending_plans").insert({
        created_by: requesterUserId,
        source_mode: input.mode,
        participant_ids: ensureRequester,
        conversation_id: conversationId ?? null,
        plan_json: finalPlan,
        status: "pending",
      }).select("id").single();
      if (!ins.error && ins.data) pendingPlanId = (ins.data as { id: string }).id;
    } catch {
      pendingPlanId = null;
    }
  }

  return {
    plan: finalPlan,
    pending_plan_id: pendingPlanId,
    provider: "gemini",
    location_id: verifiedPlaceId,
    booking_url: verifiedBookingUrl,
    participants: ensureRequester,
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return withCorsEmpty(req, { status: 204 });
  }

  try {
    const cors = corsHeaders(req);
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Missing or invalid authorization" }),
        { status: 401, headers: { "Content-Type": "application/json", ...Object.fromEntries(cors) } }
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Invalid session" }),
        { status: 401, headers: { "Content-Type": "application/json", ...Object.fromEntries(cors) } }
      );
    }

    const tier = await getSubscriptionTier(supabase, user.id);

    const body: AiGatewayRequest & { stream?: boolean } = await req.json();
    const { mode, task, context = {}, candidates = [], stream: wantStream = false } = body;

    if (!ALLOWED_MODES.includes(mode)) {
      return new Response(
        JSON.stringify({ error: "Invalid mode" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    if (!ALLOWED_TASKS.includes(task)) {
      return new Response(
        JSON.stringify({ error: "Invalid task" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const safeContext = allowlistContext(context as Record<string, unknown>);
    const scrubbedSafeContext = scrubPiiInContext(safeContext);
    if (typeof scrubbedSafeContext.user_prompt === "string") {
      scrubbedSafeContext.user_prompt = scrubbedSafeContext.user_prompt.slice(0, 2000);
    }

    // Redis-based rate limiter (prevents abuse + smooths bursts).
    // Free tier is blocked for AI tasks server-side even if client gating fails.
    if (["chat_topics", "planner_theme_plans", "winkly_plan", "concierge", "plan", "event_suggest", "match_agent", "match_bridge"].includes(task)) {
      const rl = await rateLimitOrThrow({ userId: user.id, tier, task });
      if (!rl.ok) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded", retry_after: rl.retry_after }), {
          status: 429,
          headers: { "Content-Type": "application/json", ...Object.fromEntries(cors) },
        });
      }
    }

    if (task === "chat_topics") {
      const rawIds = scrubbedSafeContext.participant_user_ids;
      const ids = Array.isArray(rawIds) ? rawIds.filter((x) => typeof x === "string") as string[] : [];
      const convId = typeof scrubbedSafeContext.conversation_id === "string" ? scrubbedSafeContext.conversation_id.trim() : "";
      const city = String(scrubbedSafeContext.city ?? "").trim();
      const countryStr = typeof scrubbedSafeContext.country === "string" ? scrubbedSafeContext.country : undefined;
      if (!city) {
        // Fallback to core profile city for requester (privacy: city only).
        const core = await getCoreProfile(supabase, user.id);
        const coreCity = typeof core?.city === "string" ? core.city.trim() : "";
        scrubbedSafeContext.city = coreCity || "Berlin";
      }
      const out = await generateChatTopics({
        supabase,
        requesterUserId: user.id,
        mode,
        participantIds: ids,
        conversationId: convId || null,
        city: String(scrubbedSafeContext.city ?? "Berlin"),
        country: countryStr,
      });
      return new Response(JSON.stringify(out), {
        headers: { "Content-Type": "application/json", ...Object.fromEntries(cors) },
      });
    }

    if (task === "winkly_plan") {
      const rawIds = scrubbedSafeContext.participant_user_ids;
      const ids = Array.isArray(rawIds) ? rawIds.filter((x) => typeof x === "string") as string[] : [];
      const participantIds = ids.length ? ids : (scrubbedSafeContext.partner_user_id && typeof scrubbedSafeContext.partner_user_id === "string"
        ? [user.id, scrubbedSafeContext.partner_user_id]
        : [user.id]);

      const wf = scrubbedSafeContext.weather_snapshot && typeof scrubbedSafeContext.weather_snapshot === "object"
        ? (scrubbedSafeContext.weather_snapshot as Record<string, unknown>)
        : null;

      const input: WinklyPlanInput = {
        mode,
        participant_user_ids: participantIds,
        planning_form: {
          user_idea: typeof scrubbedSafeContext.user_prompt === "string"
            ? scrubbedSafeContext.user_prompt
            : typeof scrubbedSafeContext.activity_hint === "string"
            ? scrubbedSafeContext.activity_hint
            : null,
          date_time: typeof scrubbedSafeContext.date_from === "string" ? scrubbedSafeContext.date_from : null,
          budget: {
            amount: typeof scrubbedSafeContext.budget_amount === "number" ? scrubbedSafeContext.budget_amount : null,
            currency: typeof scrubbedSafeContext.budget_currency === "string" ? scrubbedSafeContext.budget_currency : null,
          },
          weather: wf,
          city: typeof scrubbedSafeContext.city === "string" ? scrubbedSafeContext.city : null,
          country: typeof scrubbedSafeContext.country === "string" ? scrubbedSafeContext.country : null,
        },
      };

      const rawConv = typeof scrubbedSafeContext.conversation_id === "string" ? scrubbedSafeContext.conversation_id.trim() : "";
      const convId =
        rawConv &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(rawConv)
          ? rawConv
          : null;

      const out = await generateWinklyPlan({
        supabase,
        requesterUserId: user.id,
        input,
        conversationId: convId,
        persistDraft: true,
        maps_grounding: "verify",
      });
      const agentic_planning_output = {
        topic: out.plan.topic,
        date_time: out.plan.date_time,
        location_id: out.location_id,
        weather_check: true,
        booking_url: out.booking_url,
        participants: out.participants,
      };
      return new Response(JSON.stringify({
        winkly_plan: out.plan,
        agentic_planning_output,
        pending_plan_id: out.pending_plan_id,
        provider: out.provider,
      }), { headers: { "Content-Type": "application/json", ...Object.fromEntries(cors) } });
    }

    if (task === "planner_theme_plans") {
      const rawIds = scrubbedSafeContext.participant_user_ids;
      const ids = Array.isArray(rawIds) ? rawIds.filter((x) => typeof x === "string") as string[] : [];
      const participantIds = ids.length ? ids : (scrubbedSafeContext.partner_user_id && typeof scrubbedSafeContext.partner_user_id === "string"
        ? [user.id, scrubbedSafeContext.partner_user_id]
        : [user.id]);

      const city = typeof scrubbedSafeContext.city === "string" && scrubbedSafeContext.city.trim()
        ? scrubbedSafeContext.city.trim()
        : (await getCoreProfile(supabase, user.id))?.city?.trim() || "Berlin";
      const countryStr = typeof scrubbedSafeContext.country === "string" ? scrubbedSafeContext.country : undefined;
      const theme = typeof scrubbedSafeContext.theme === "string" && scrubbedSafeContext.theme.trim()
        ? scrubbedSafeContext.theme.trim()
        : "Custom";
      const dateTime = typeof scrubbedSafeContext.date_from === "string" && scrubbedSafeContext.date_from.trim()
        ? scrubbedSafeContext.date_from.trim()
        : new Date(Date.now() + 48 * 3600_000).toISOString();
      const wf = scrubbedSafeContext.weather_snapshot && typeof scrubbedSafeContext.weather_snapshot === "object"
        ? (scrubbedSafeContext.weather_snapshot as Record<string, unknown>)
        : null;

      const pr = typeof scrubbedSafeContext.plan_request_text === "string" ? scrubbedSafeContext.plan_request_text.trim() : "";
      // Prefer the full Planner form text (includes anonymised persona + constraints) when present.
      const userIdeaBase = (pr || `${theme} plan`).trim();
      const weatherHint = wf ? `Weather: ${JSON.stringify(wf).slice(0, 400)}` : "";
      const indoorOutdoorHint =
        typeof scrubbedSafeContext.weather_forecast === "string" && scrubbedSafeContext.weather_forecast.toLowerCase().includes("rain")
          ? "Prefer indoor venues or weather-proof options."
          : "Prefer outdoor-friendly options when feasible.";

      // Semantic caching: same theme/city/mode/day within 24h
      const semKey = `sc:planner_theme_plans:${mode}:${normalizeTag(city)}:${normalizeTag(theme)}:${dateTime.slice(0, 10)}:${hashKeyMaterial(participantIds.slice().sort().join(","))}`;
      const cached = await redisGetJson<PlannerThemePlansOutput>(semKey);
      if (cached?.plan_options?.length) {
        return new Response(JSON.stringify(cached), {
          headers: { "Content-Type": "application/json", ...Object.fromEntries(cors) },
        });
      }

      const inputA: WinklyPlanInput = {
        mode,
        participant_user_ids: participantIds,
        planning_form: {
          user_idea: `${userIdeaBase}\n\n${indoorOutdoorHint} ${weatherHint}`.trim(),
          date_time: dateTime,
          budget: {
            amount: typeof scrubbedSafeContext.budget_amount === "number" ? scrubbedSafeContext.budget_amount : null,
            currency: typeof scrubbedSafeContext.budget_currency === "string" ? scrubbedSafeContext.budget_currency : null,
          },
          weather: wf,
          city,
          country: countryStr ?? null,
        },
      };
      const inputB: WinklyPlanInput = {
        ...inputA,
        planning_form: { ...inputA.planning_form, user_idea: `${userIdeaBase} (alternative). ${indoorOutdoorHint} ${weatherHint}`.trim() },
      };

      const [outA, outB] = await Promise.all([
        generateWinklyPlan({ supabase, requesterUserId: user.id, input: inputA, conversationId: null, persistDraft: false, maps_grounding: "textsearch" }),
        generateWinklyPlan({ supabase, requesterUserId: user.id, input: inputB, conversationId: null, persistDraft: false, maps_grounding: "textsearch" }),
      ]);

      const mapPlan = (p: WinklyPlanOutput, bookingUrl?: string | null): PlannerThemePlansOutput["plan_options"][number] => ({
        topic: p.topic,
        date_time: p.date_time,
        location: {
          name: (p.location_details as { name: string }).name,
          address: (p.location_details as { address: string }).address,
          maps_link: (p.location_details as { google_maps_link: string }).google_maps_link,
        },
        weather_guard: p.weather_context || indoorOutdoorHint,
        participants: participantIds,
        details: p.logic_reasoning || "Structured plan option.",
        action_links: { booking: bookingUrl ?? undefined },
      });

      const response: PlannerThemePlansOutput = {
        plan_options: [
          mapPlan(outA.plan, outA.booking_url),
          mapPlan(outB.plan, outB.booking_url),
        ],
      };

      await redisSetJson(semKey, response, 86400).catch(() => {});
      return new Response(JSON.stringify(response), {
        headers: { "Content-Type": "application/json", ...Object.fromEntries(cors) },
      });
    }

    if (task === "match_agent") {
      const partnerUserId = scrubbedSafeContext.partner_user_id as string | undefined;
      if (!partnerUserId || partnerUserId === user.id) {
        return new Response(JSON.stringify({ error: "partner_user_id required" }), {
          status: 400,
          headers: { "Content-Type": "application/json", ...Object.fromEntries(cors) },
        });
      }
      if (mode !== "romance" && mode !== "friends") {
        return new Response(JSON.stringify({ error: "match_agent supports romance or friends only" }), {
          status: 400,
          headers: { "Content-Type": "application/json", ...Object.fromEntries(cors) },
        });
      }

      const promptVariant: "A" | "B" = hashUserId(user.id) % 2 === 0 ? "A" : "B";
      const insMa = await supabase.from("ai_requests").insert({
        user_id: user.id,
        mode,
        task,
        prompt_variant: promptVariant,
      }).select("id").single();
      let requestIdMa: string | null = null;
      if (!insMa.error) requestIdMa = (insMa.data as { id?: string } | null)?.id ?? null;

      const pipeline = await runMatchAgentPipeline(supabase, user.id, mode, partnerUserId, scrubbedSafeContext);
      const m = pipeline.model;
      const planJson = {
        chain: pipeline.chain,
        draft: m.draft ?? {},
        places_preview: pipeline.places.slice(0, 5),
        rules: MATCH_AGENT_RULES,
      };

      let proposalId: string | null = null;
      const rawConv = typeof scrubbedSafeContext.conversation_id === "string" ? scrubbedSafeContext.conversation_id.trim() : "";
      const convId =
        rawConv &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(rawConv)
          ? rawConv
          : null;
      try {
        const insP = await supabase.from("ai_match_agent_proposals").insert({
          conversation_id: convId,
          created_by: user.id,
          partner_user_id: partnerUserId,
          mode,
          status: "draft",
          plan_json: planJson,
          agent_message: m.agent_message ?? "",
          extract_summary: typeof m.chain?.extract === "string" ? m.chain.extract : JSON.stringify(pipeline.chain),
          search_context: { center: pipeline.llmPayload.SEARCH_CENTER, keyword: pipeline.llmPayload.EXTRACTION },
          weather_note: typeof m.chain?.weather_note === "string" ? m.chain.weather_note : undefined,
        }).select("id").single();
        if (insP.error) {
          console.warn("[ai-gateway] ai_match_agent_proposals insert:", insP.error.message ?? insP.error);
        } else if (insP.data) {
          proposalId = (insP.data as { id: string }).id;
        }
      } catch (e) {
        console.warn("[ai-gateway] ai_match_agent_proposals insert skipped:", e);
      }

      return new Response(
        JSON.stringify({
          match_agent: {
            agent_message: m.agent_message,
            draft: m.draft,
            chain: m.chain,
            proposal_id: proposalId,
            request_id: requestIdMa,
            privacy: {
              draft_state: true,
              double_opt_in: "Both users must confirm before the plan is finalized.",
              no_exact_home_addresses: true,
            },
          },
          message: m.agent_message,
        }),
        { headers: { "Content-Type": "application/json", ...Object.fromEntries(cors) } },
      );
    }

    if (task === "match_bridge") {
      if (mode !== "romance") {
        return new Response(JSON.stringify({ error: "match_bridge requires mode romance" }), {
          status: 400,
          headers: { "Content-Type": "application/json", ...Object.fromEntries(cors) },
        });
      }
      const partnerUserId = scrubbedSafeContext.partner_user_id as string | undefined;
      if (!partnerUserId || partnerUserId === user.id) {
        return new Response(JSON.stringify({ error: "partner_user_id required" }), {
          status: 400,
          headers: { "Content-Type": "application/json", ...Object.fromEntries(cors) },
        });
      }

      const profileCtx = await getConciergeProfileContext(supabase, user.id, "romance", partnerUserId);
      const primaryPlannerRaw = await getPlannerItemsForUser(supabase, user.id, undefined);
      const partnerPlannerRaw = await getPlannerItemsForUser(supabase, partnerUserId, undefined);
      const primaryPlanner = parsePlannerItemsArray(primaryPlannerRaw);
      const partnerPlanner = parsePlannerItemsArray(partnerPlannerRaw);

      const city = String(scrubbedSafeContext.city ?? profileCtx.primary.city ?? "").trim();
      const countryStr = typeof scrubbedSafeContext.country === "string" ? scrubbedSafeContext.country : undefined;
      const dateFrom = new Date().toISOString().slice(0, 10);
      const dateTo = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);

      const pfSlots = Array.isArray(scrubbedSafeContext.primary_free_slots) ? scrubbedSafeContext.primary_free_slots : [];
      const partnerSlots = Array.isArray(scrubbedSafeContext.partner_free_slots) ? scrubbedSafeContext.partner_free_slots : [];

      const [preEvents, businessSupply, placeHints] = await Promise.all([
        prefetchMatchingWinklyEvents(supabase, {
          mode: "romance",
          city,
          country: countryStr,
          dateFrom,
          dateTo,
          activityHint: "coffee date brunch first meeting",
          planRequest: "first date specialty coffee casual",
        }),
        prefetchMatchingBusinessSupply(supabase, {
          city,
          activityHint: "coffee café brunch",
          planRequest: "coffee date",
          mode: "romance",
        }),
        fetchExternalVenueHints({
          activityHint: "specialty coffee café",
          planRequest: "coffee date",
          city,
          country: countryStr,
        }),
      ]);

      const mbPayload: Record<string, unknown> = {
        PRIMARY_USER: profileCtx.primary,
        PARTNER_USER: profileCtx.partner ?? {},
        PRIMARY_PLANNER_ITEMS: primaryPlanner,
        PARTNER_PLANNER_ITEMS: partnerPlanner,
        PRIMARY_DEVICE_FREE_SLOTS: pfSlots,
        PARTNER_DEVICE_FREE_SLOTS: partnerSlots,
        WINKLY_EVENTS_CANDIDATES: preEvents,
        WINKLY_BUSINESS_CANDIDATES: businessSupply,
        EXTERNAL_PLACE_HINTS: placeHints,
      };

      const promptVariant: "A" | "B" = hashUserId(user.id) % 2 === 0 ? "A" : "B";
      const insMb = await supabase.from("ai_requests").insert({
        user_id: user.id,
        mode,
        task,
        prompt_variant: promptVariant,
      }).select("id").single();
      let requestIdMb: string | null = null;
      if (insMb.error) {
        console.error("ai_requests insert failed:", insMb.error.message);
      } else {
        requestIdMb = (insMb.data as { id?: string } | null)?.id ?? null;
      }

      const geminiKeyMb = Deno.env.get("GEMINI_API_KEY");
      const openaiKeyMb = Deno.env.get("OPENAI_API_KEY");

      let bridge: MatchBridgePayload | null = null;
      if (geminiKeyMb) {
        bridge = await runMatchBridgeGeminiJson(geminiKeyMb, mbPayload);
      }
      if (!bridge && openaiKeyMb) {
        bridge = await runMatchBridgeOpenAIJson(openaiKeyMb, mbPayload);
      }
      if (!bridge) {
        bridge = fallbackMatchBridge(
          profileCtx.primary as Record<string, unknown>,
          (profileCtx.partner ?? {}) as Record<string, unknown>,
          city,
        );
      }

      return new Response(
        JSON.stringify({
          match_bridge: bridge,
          message: bridge.bridge_message,
          request_id: requestIdMb,
        }),
        { headers: { "Content-Type": "application/json", ...Object.fromEntries(cors) } },
      );
    }

    // For concierge/plan, inject primary + optional partner profile and partner planner (conflict resolution)
    // When compatibility_context is present (Layer 1 precomputed), use compressed prompt instead of full profiles to minimize LLM usage
    let contextForLlm: Record<string, unknown> = { ...scrubbedSafeContext };
    if (["plan", "concierge", "event_suggest"].includes(task)) {
      const compatibilityContext = scrubbedSafeContext.compatibility_context as string | undefined;
      const partnerUserIdEarly = scrubbedSafeContext.partner_user_id as string | undefined;
      const clientPrefSummary = typeof scrubbedSafeContext.preference_engine_summary === "string"
        ? scrubbedSafeContext.preference_engine_summary.trim()
        : "";
      const sigPrimary = await fetchConciergeSignals(supabase, user.id);
      const sigPartner = partnerUserIdEarly && partnerUserIdEarly !== user.id
        ? await fetchConciergeSignals(supabase, partnerUserIdEarly)
        : {};

      if (compatibilityContext && typeof compatibilityContext === "string" && compatibilityContext.length > 0) {
        contextForLlm.COMPATIBILITY_SUMMARY = compatibilityContext;
        contextForLlm.PRIMARY_USER = {};
        contextForLlm.PARTNER_USER = {};
        contextForLlm.PRIMARY_CONCIERGE_SIGNALS = sigPrimary;
        contextForLlm.PARTNER_CONCIERGE_SIGNALS = sigPartner;
        contextForLlm.PREFERENCE_ENGINE_MERGE = clientPrefSummary ||
          mergePreferenceEngineNarrative({}, undefined, sigPrimary, sigPartner);
      } else {
        const profileCtx = await getConciergeProfileContext(supabase, user.id, mode, partnerUserIdEarly);
        contextForLlm.PRIMARY_USER = { ...profileCtx.primary, concierge_signals: sigPrimary };
        if (profileCtx.partner) {
          contextForLlm.PARTNER_USER = { ...profileCtx.partner, concierge_signals: sigPartner };
        }
        contextForLlm.PREFERENCE_ENGINE_MERGE = clientPrefSummary || mergePreferenceEngineNarrative(
          profileCtx.primary as Record<string, unknown>,
          profileCtx.partner as Record<string, unknown> | undefined,
          sigPrimary,
          sigPartner,
        );
      }

      const cwRaw = scrubbedSafeContext.calendar_white_space;
      if (cwRaw !== undefined && cwRaw !== null && String(cwRaw).length > 0) {
        contextForLlm.CALENDAR_WHITE_SPACE = typeof cwRaw === "string" ? scrubPiiText(cwRaw) : scrubPiiText(JSON.stringify(cwRaw));
      }
      const bkRaw = scrubbedSafeContext.booking_context;
      if (bkRaw !== undefined && bkRaw !== null && typeof bkRaw === "object") {
        contextForLlm.BOOKING_CONTEXT = bkRaw;
      }

      contextForLlm.LOCATION = {
        current_city: scrubbedSafeContext.city ?? "unknown",
        weather: scrubbedSafeContext.weather_snapshot != null
          ? "(use weather_snapshot in context — supplied by the app for this plan)"
          : "(use get_weather for real data)",
        time: scrubbedSafeContext.date_from ?? "not specified",
      };
      const countryStr = typeof scrubbedSafeContext.country === "string" ? scrubbedSafeContext.country : undefined;
      const [preEvents, businessSupply, placeHints] = await Promise.all([
        prefetchMatchingWinklyEvents(supabase, {
          mode,
          city: String(scrubbedSafeContext.city ?? "").trim(),
          country: countryStr,
          dateFrom: typeof scrubbedSafeContext.date_from === "string" ? scrubbedSafeContext.date_from : undefined,
          dateTo: typeof scrubbedSafeContext.date_to === "string" ? scrubbedSafeContext.date_to : undefined,
          activityHint: String(scrubbedSafeContext.activity_hint ?? ""),
          planRequest: String(scrubbedSafeContext.plan_request_text ?? scrubbedSafeContext.user_prompt ?? ""),
        }),
        prefetchMatchingBusinessSupply(supabase, {
          city: String(scrubbedSafeContext.city ?? "").trim(),
          activityHint: String(scrubbedSafeContext.activity_hint ?? ""),
          planRequest: String(scrubbedSafeContext.plan_request_text ?? scrubbedSafeContext.user_prompt ?? ""),
          mode,
        }),
        fetchExternalVenueHints({
          activityHint: String(scrubbedSafeContext.activity_hint ?? ""),
          planRequest: String(scrubbedSafeContext.plan_request_text ?? scrubbedSafeContext.user_prompt ?? ""),
          city: String(scrubbedSafeContext.city ?? "").trim(),
          country: countryStr,
        }),
      ]);
      contextForLlm.WINKLY_EVENTS_CANDIDATES = preEvents;
      contextForLlm.WINKLY_BUSINESS_CANDIDATES = businessSupply;
      contextForLlm.EXTERNAL_PLACE_HINTS = placeHints;
      // Conflict resolution: when planning with a partner, inject their planner so you only propose times that don't conflict
      if (partnerUserIdEarly && partnerUserIdEarly !== user.id) {
        const partnerPlannerRaw = await getPlannerItemsForUser(supabase, partnerUserIdEarly, undefined);
        let partnerPlanner: unknown[] = [];
        try {
          const parsed = JSON.parse(partnerPlannerRaw);
          partnerPlanner = Array.isArray(parsed) ? parsed : parsed?.error ? [] : [];
        } catch {
          partnerPlanner = [];
        }
        contextForLlm.PARTNER_PLANNER_ITEMS = partnerPlanner;
      }
    }

    const promptVariant: "A" | "B" = hashUserId(user.id) % 2 === 0 ? "A" : "B";
    const systemPrompt = getSystemPrompt(promptVariant);
    let requestId: string | null = null;
    const ins = await supabase.from("ai_requests").insert({
      user_id: user.id,
      mode,
      task,
      prompt_variant: promptVariant,
    }).select("id").single();
    if (ins.error) {
      console.error("ai_requests insert failed:", ins.error.message);
    } else {
      requestId = (ins.data as { id?: string } | null)?.id ?? null;
    }

    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    const geminiKey = Deno.env.get("GEMINI_API_KEY");

    /** When Gemini fails (bad key, quota, etc.) but OpenAI is configured, try OpenAI. */
    async function maybeFallbackToOpenAI(
      result: { message?: string; suggestions?: unknown[]; no_options_reason?: string; statusCode?: number; provider_status?: number }
    ) {
      if (!openaiKey) return result;
      const ps = result.provider_status;
      if (ps == null || ps === 429) return result;
      const oai = await runOpenAIWithTools(openaiKey, user.id, task, contextForLlm, supabase, systemPrompt);
      if (oai.statusCode === 429) return oai;
      const oaps = (oai as { provider_status?: number }).provider_status;
      if (oaps == null) return oai;
      return result;
    }

    /** Shared success response for plan/concierge/event_suggest (stream or JSON). */
    function conciergeSuccessResponse(
      result: { message?: string; suggestions?: unknown[]; no_options_reason?: string; statusCode?: number }
    ) {
      if (wantStream && result.message != null && !result.statusCode) {
        const stream = new ReadableStream({
          async start(controller) {
            const msg = result.message ?? "";
            const chunkSize = 36;
            for (let i = 0; i < msg.length; i += chunkSize) {
              controller.enqueue(new TextEncoder().encode("data: " + JSON.stringify({ type: "delta", content: msg.slice(i, i + chunkSize) }) + "\n\n"));
              await new Promise((r) => setTimeout(r, 25));
            }
            controller.enqueue(new TextEncoder().encode("data: " + JSON.stringify({
              type: "done",
              message: result.message,
              suggestions: result.suggestions,
              no_options_reason: result.no_options_reason,
              request_id: requestId,
            }) + "\n\n"));
            controller.close();
          },
        });
        return new Response(stream, {
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            ...Object.fromEntries(cors),
          },
        });
      }
      return new Response(
        JSON.stringify({
          message: result.message,
          suggestions: result.suggestions,
          ranked: [],
          no_options_reason: result.no_options_reason,
          request_id: requestId,
        }),
        { headers: { "Content-Type": "application/json", ...Object.fromEntries(cors) } }
      );
    }

    function concierge429Response(
      result: { message?: string; retry_after?: number; provider_status?: number }
    ) {
      return new Response(
        JSON.stringify({
          error: result.message,
          retry_after: result.retry_after ?? 60,
          provider_status: result.provider_status,
        }),
        { status: 429, headers: { "Content-Type": "application/json", ...Object.fromEntries(cors) } }
      );
    }

    if (["plan", "concierge", "event_suggest"].includes(task)) {
      // Prefer Gemini when both keys exist (closer to free-tier Gemini usage in AI Studio); OpenAI is fallback.
      if (geminiKey) {
        let result = await runGeminiWithTools(geminiKey, user.id, task, contextForLlm, supabase, systemPrompt);
        if (result.statusCode === 429 && openaiKey) {
          console.warn("[ai-gateway] Gemini returned 429; trying OpenAI.");
          await new Promise((r) => setTimeout(r, 1500));
          result = await runOpenAIWithTools(openaiKey, user.id, task, contextForLlm, supabase, systemPrompt);
        }
        if (result.statusCode === 429) {
          return concierge429Response(result as { message?: string; retry_after?: number; provider_status?: number });
        }
        result = await maybeFallbackToOpenAI(result as { message?: string; suggestions?: unknown[]; no_options_reason?: string; statusCode?: number; provider_status?: number });
        if (result.statusCode === 429) {
          return concierge429Response(result as { message?: string; retry_after?: number; provider_status?: number });
        }
        return conciergeSuccessResponse(result);
      }
      if (openaiKey) {
        let result = await runOpenAIWithTools(openaiKey, user.id, task, contextForLlm, supabase, systemPrompt);
        if (result.statusCode === 429) {
          return concierge429Response(result as { message?: string; retry_after?: number; provider_status?: number });
        }
        return conciergeSuccessResponse(result);
      }
    }

    // Stub for rank/suggest/summarize or when no AI key set (concierge/plan/event_suggest with no key fall through here)
    const result = {
      ranked: candidates.slice(0, 5).map((c: Record<string, unknown>, i: number) => ({ ...c, rank: i + 1 })),
      suggestions: [] as unknown[],
      message: "" as string | undefined,
      no_options_reason: ["plan", "concierge", "event_suggest"].includes(task)
        ? "AI is not configured for this environment. Add OPENAI_API_KEY or GEMINI_API_KEY to enable plans."
        : undefined,
    };
    if (openaiKey && ["rank", "suggest"].includes(task) && candidates.length > 0) {
      // Optional: call OpenAI for ranking without tools (same allowlisted context)
      result.ranked = result.ranked;
    }
    return new Response(JSON.stringify(result), {
      headers: { "Content-Type": "application/json", ...Object.fromEntries(cors) },
    });
  } catch (err) {
    console.error("ai-gateway error:", err);
    return new Response(
      JSON.stringify({ error: "Internal error" }),
      { status: 500, headers: { "Content-Type": "application/json", ...Object.fromEntries(corsHeaders(req)) } }
    );
  }
});
