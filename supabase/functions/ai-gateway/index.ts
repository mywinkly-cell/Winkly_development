// ai-gateway — Mode-locked AI gateway (spec v8.1 + concierge)
// Validates session, mode; allowlisted context only; LLM routing by tier:
// Premium/Enterprise → Anthropic (Claude) primary; Super → Gemini primary; OpenAI/Gemini fallbacks.
//
// AI safety / account deletion: We do not log full prompts or responses. Only telemetry (user_id, mode, task) is
// stored in ai_requests; that table has ON DELETE CASCADE from auth.users, so when a user deletes their account
// (via delete-account Edge Function) all their ai_requests rows are removed. Third-party AI providers (OpenAI/Gemini)
// may retain request/response data per their policies; we send only allowlisted context and do not use chat content.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, withCorsEmpty } from "../_shared/cors.ts";
import {
  buildLocationContextInjection,
  formatSystemContextBlock,
  mergeLocationHints,
  type LocationContextInjection,
} from "./locationContext.ts";

/**
 * Gemini model routing — defaults use real Generative Language API model IDs.
 * Override via Supabase secrets: GEMINI_MODEL, GEMINI_MODEL_LITE, GEMINI_MODEL_TOPICS, GEMINI_MODEL_PLAN.
 */
const GEMINI_MODEL = Deno.env.get("GEMINI_MODEL") ?? "gemini-2.0-flash";
const GEMINI_MODEL_LITE = Deno.env.get("GEMINI_MODEL_LITE") ?? "gemini-2.0-flash-lite";

// Model routing (cost optimization)
const GEMINI_MODEL_TOPICS = Deno.env.get("GEMINI_MODEL_TOPICS") ?? "gemini-2.0-flash-lite";
const GEMINI_MODEL_PLAN = Deno.env.get("GEMINI_MODEL_PLAN") ?? "gemini-2.0-flash";

/** Anthropic (Claude) — primary for Premium/Enterprise. Override via Supabase secrets. */
const ANTHROPIC_MODEL = Deno.env.get("ANTHROPIC_MODEL") ?? "claude-sonnet-4-20250514";
const ANTHROPIC_MODEL_LITE = Deno.env.get("ANTHROPIC_MODEL_LITE") ?? "claude-3-5-haiku-20241022";
const ANTHROPIC_MODEL_PLAN = Deno.env.get("ANTHROPIC_MODEL_PLAN") ?? "claude-sonnet-4-20250514";

// Redis (Upstash REST) — used for rate limiting + semantic caching + context caching
const UPSTASH_REDIS_REST_URL = Deno.env.get("UPSTASH_REDIS_REST_URL") ?? "";
const UPSTASH_REDIS_REST_TOKEN = Deno.env.get("UPSTASH_REDIS_REST_TOKEN") ?? "";

type SubscriptionTier = "free" | "super" | "premium" | "enterprise";

// ───────────────────────────────────────────────────────────────────────────
// Feature flags, tier access, and cost guards — enforced SERVER-SIDE.
//
// AI access is the source of truth here, in the Edge Function — not in the
// client. The client gate (apps/mobile/lib/ai/aiFeatureGate.ts) is UX only and
// is trivially bypassable (anyone can call this function with a valid session
// token). Every billable AI task is therefore re-checked against the user's
// subscription tier, a global kill switch, and per-request cost guards below.
// ───────────────────────────────────────────────────────────────────────────

function envFlagOn(name: string): boolean {
  return /^(1|true|yes|on)$/i.test((Deno.env.get(name) ?? "").trim());
}

/** Global kill switch: when set, every billable AI task is rejected (503). */
const AI_GATEWAY_DISABLED = envFlagOn("AI_GATEWAY_DISABLED");

/** Per-tier disable list, e.g. AI_DISABLED_TIERS="free,super". Blocks those tiers entirely. */
const AI_DISABLED_TIERS: Set<SubscriptionTier> = new Set(
  (Deno.env.get("AI_DISABLED_TIERS") ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s): s is SubscriptionTier => ["free", "super", "premium", "enterprise"].includes(s)),
);

/** Tasks whose responses are structured JSON keys for UI cards — keep outputs brief (<400 tokens). */
const STRUCTURED_UI_TASKS = new Set<string>([
  "plan",
  "concierge",
  "event_suggest",
  "planner_theme_plans",
  "winkly_plan",
  "chat_topics",
  "super_like_icebreaker",
]);

/** Default max output for structured UI tasks (under 400 — app renders precise JSON keys, not prose). */
const STRUCTURED_UI_MAX_TOKENS = Math.max(
  128,
  Math.min(399, Math.floor(Number(Deno.env.get("AI_STRUCTURED_MAX_TOKENS") ?? "384")) || 384),
);

/** Two-option plan cards (winkly_plan / planner_theme_plans) need more room than generic structured UI. */
const PLAN_OPTIONS_MAX_TOKENS = Math.max(
  512,
  Math.min(
    2048,
    Math.floor(Number(Deno.env.get("AI_PLAN_OPTIONS_MAX_TOKENS") ?? "1200")) || 1200,
  ),
);

/** Cost guards. Output-token ceiling is applied to every provider call; input guards reject abuse. */
const AI_LIMITS = {
  // Hard ceiling on output tokens per provider request (clamps every call's maxOutputTokens/max_tokens).
  maxOutputTokens: Math.max(64, Math.floor(Number(Deno.env.get("AI_MAX_OUTPUT_TOKENS") ?? "2048")) || 2048),
  // Narrative tasks (match_agent, match_bridge) may request more tokens; still capped by maxOutputTokens.
  narrativeMaxTokens: Math.max(
    STRUCTURED_UI_MAX_TOKENS,
    Math.floor(Number(Deno.env.get("AI_NARRATIVE_MAX_TOKENS") ?? "900")) || 900,
  ),
  // Max characters of serialized request context (rejects oversized prompts → token-cost abuse).
  maxContextChars: Math.max(2000, Math.floor(Number(Deno.env.get("AI_MAX_CONTEXT_CHARS") ?? "24000")) || 24000),
  // Max characters of the free-text user prompt.
  maxUserPromptChars: 2000,
  // Max candidates accepted for rank/suggest.
  maxCandidates: 50,
} as const;

/** Clamp a requested output-token count to the configured per-request ceiling. */
function capOutputTokens(requested: number): number {
  return Math.max(1, Math.min(requested, AI_LIMITS.maxOutputTokens));
}

/** Structured UI tasks → brief JSON; narrative tasks → higher budget (still capped). */
function resolveMaxTokens(task: string, requested = AI_LIMITS.narrativeMaxTokens): number {
  if (task === "winkly_plan" || task === "planner_theme_plans") {
    return capOutputTokens(PLAN_OPTIONS_MAX_TOKENS);
  }
  if (STRUCTURED_UI_TASKS.has(task)) return STRUCTURED_UI_MAX_TOKENS;
  return capOutputTokens(Math.min(requested, AI_LIMITS.narrativeMaxTokens));
}

/** Tasks that invoke a paid model (and so must be tier-gated, rate-limited, and cost-guarded). */
const AI_TASKS = new Set<string>([
  "chat_topics",
  "planner_theme_plans",
  "event_suggest",
  "plan",
  "concierge",
  "winkly_plan",
  "match_agent",
  "match_bridge",
  "super_like_icebreaker",
]);

const TIER_RANK: Record<SubscriptionTier, number> = { free: 0, super: 1, premium: 2, enterprise: 3 };

/**
 * Minimum subscription tier required per AI task. Mirrors the client gate
 * (lib/ai/aiFeatureGate.ts) but enforced here so it cannot be bypassed.
 *  - "super": limited AI (smart matching, event suggestions, planning ideas, chat opener).
 *  - "premium": full concierge (weather-aware planning, coordination, first-date bridge).
 * Free tier is denied every AI task except plan generation (`planner_theme_plans`, `winkly_plan`),
 * which share a daily allowance (see FREE_TIER_PLANS_PER_DAY).
 */
const TASK_MIN_TIER: Record<string, SubscriptionTier> = {
  chat_topics: "super",
  planner_theme_plans: "super",
  event_suggest: "super",
  plan: "super",
  winkly_plan: "super",
  match_agent: "super",
  super_like_icebreaker: "super",
  concierge: "premium",
  match_bridge: "premium",
};

/** Plan-generation tasks that free users may call within the daily allowance. */
const FREE_PLAN_TASKS = new Set<string>(["planner_theme_plans", "winkly_plan"]);

/** Free-tier combined plan allowance per UTC calendar day (launch default: 3/day). */
const FREE_TIER_PLANS_PER_DAY = Math.max(
  0,
  Math.min(20, parseInt(Deno.env.get("AI_FREE_PLANS_PER_DAY") ?? "3", 10) || 3),
);

/** True when `tier` meets the minimum required for `task`. Non-AI tasks are always allowed. */
function tierAllowsTask(tier: SubscriptionTier, task: string): boolean {
  const required = TASK_MIN_TIER[task];
  if (!required) return true;
  return TIER_RANK[tier] >= TIER_RANK[required];
}

function utcDayStartIso(): string {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())).toISOString();
}

/** Count successful plan AI calls today (planner_theme_plans + winkly_plan share one pool). */
async function countFreePlanUsageToday(
  supabase: ReturnType<typeof createClient>,
  userId: string,
): Promise<number> {
  const { count, error } = await supabase
    .from("ai_requests")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .in("task", [...FREE_PLAN_TASKS])
    .gte("created_at", utcDayStartIso());
  if (error) {
    console.error("ai_requests daily plan count failed:", error.message);
    return Number.POSITIVE_INFINITY;
  }
  return count ?? 0;
}

type TaskAccessResult =
  | { allowed: true }
  | { allowed: false; reason: "tier" | "free_quota_exhausted" };

/** Server-side task access including free-tier planner quota. */
async function resolveTaskAccess(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  tier: SubscriptionTier,
  task: string,
): Promise<TaskAccessResult> {
  if (tierAllowsTask(tier, task)) return { allowed: true };
  if (tier === "free" && FREE_PLAN_TASKS.has(task) && FREE_TIER_PLANS_PER_DAY > 0) {
    const usedToday = await countFreePlanUsageToday(supabase, userId);
    if (usedToday < FREE_TIER_PLANS_PER_DAY) return { allowed: true };
    return { allowed: false, reason: "free_quota_exhausted" };
  }
  return { allowed: false, reason: "tier" };
}

/** Suggested upgrade target for client upsell when a task is denied. */
function suggestedUpgradeTier(task: string): "super" | "premium" {
  return TASK_MIN_TIER[task] === "premium" ? "premium" : "super";
}

/** Premium and Enterprise subscribers get Claude as the primary LLM when configured. */
function isPremiumTier(tier: SubscriptionTier): boolean {
  return tier === "premium" || tier === "enterprise";
}

function pickAnthropicModel(task: string): string {
  if (task === "chat_topics" || task === "super_like_icebreaker") return ANTHROPIC_MODEL_LITE;
  if (task === "winkly_plan" || task === "planner_theme_plans") return ANTHROPIC_MODEL_PLAN;
  return ANTHROPIC_MODEL;
}

type ConciergeLlmResult = {
  message?: string;
  suggestions?: unknown[];
  no_options_reason?: string;
  statusCode?: number;
  retry_after?: number;
  provider_status?: number;
  quota_exhausted?: boolean;
};

/** Run a single Anthropic Messages API call; returns assistant text or null on failure. */
async function runAnthropicJson(
  anthropicKey: string,
  system: string,
  userContent: string,
  model: string,
  maxTokens = 1200,
  temperature = 0.5,
): Promise<string | null> {
  const res = await fetchWithBackoff(
    "https://api.anthropic.com/v1/messages",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: capOutputTokens(maxTokens),
        temperature,
        system,
        messages: [{ role: "user", content: userContent }],
      }),
    },
    { retries: 3, baseMs: 700 },
  );
  if (!res.ok) {
    console.error("[ai-gateway] Anthropic JSON !ok status=" + res.status);
    return null;
  }
  const data = await res.json();
  const textBlock = (data.content as Array<{ type: string; text?: string }> | undefined)?.find((b) => b.type === "text");
  return typeof textBlock?.text === "string" ? textBlock.text : null;
}

async function upstashPipeline(
  commands: Array<{ command: string; args: (string | number)[] }>
): Promise<Array<{ result?: unknown; error?: string }>> {
  if (!UPSTASH_REDIS_REST_URL || !UPSTASH_REDIS_REST_TOKEN) return commands.map(() => ({ error: "redis_not_configured" }));
  const url = `${UPSTASH_REDIS_REST_URL.replace(/\/$/, "")}/pipeline`;
  try {
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
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn("[ai-gateway] Upstash unreachable — skipping Redis op:", msg);
    return commands.map(() => ({ error: "redis_unreachable" }));
  }
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
  // Per-minute burst limits (daily plan caps enforced separately in resolveTaskAccess).
  const limit =
    tier === "free"
      ? (FREE_PLAN_TASKS.has(task)
        ? 2
        : task === "chat_topics"
          ? 6
          : 10)
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
  "super_like_icebreaker",
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
  /** Multi-day concierge trips: inclusive day count (2–7). */
  "num_days",
  /** Super Like icebreaker: viewer + target profile signals (interests, city, first name). */
  "self_profile", "other_profile",
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
    num_days?: number | null;
    date_to?: string | null;
  };
};

type WinklyPlanOptionOut = {
  option_id: "A" | "B";
  character_label: string;
  title: string;
  why_this_fits: string;
  itinerary: Array<{ time: string; description: string }>;
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

type WinklyPlanOutput = {
  options: [WinklyPlanOptionOut, WinklyPlanOptionOut];
};

type StrategicHostTopic = { title: string; type: "Synergy" | "Lifestyle" | "General"; pitch: string };

type ChatTopicsOutput = {
  suggested_topics: StrategicHostTopic[];
};

type PlannerTripDayOut = {
  day: number;
  date: string;
  morning: { summary: string };
  afternoon: { summary: string };
  evening?: { summary: string };
};

type PlannerThemePlansOutput = {
  plan_options: Array<{
    option_id: "A" | "B";
    character_label: string;
    title: string;
    why_this_fits: string;
    itinerary: Array<{ time: string; description: string }>;
    venue: {
      name: string;
      address: string;
      google_maps_link: string;
      estimated_cost: string;
      booking_url?: string;
    };
    weather_note: string;
    duration_minutes: number;
    trip_days?: PlannerTripDayOut[];
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
async function getCoreProfile(
  supabase: ReturnType<typeof createClient>,
  userId: string,
): Promise<{ first_name?: string; gender?: string; birthday?: string; city?: string; activity_preferences?: string[] } | null> {
  const { data: core } = await supabase
    .from("profiles_core")
    .select("first_name, gender, birthday, city, activity_preferences")
    .eq("id", userId)
    .maybeSingle();
  if (core) return core;
  const { data: up } = await supabase
    .from("user_profiles")
    .select("first_name, gender, birthday, city, activity_preferences")
    .eq("id", userId)
    .maybeSingle();
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
    activity_preferences: Array.isArray(corePrimary?.activity_preferences)
      ? corePrimary.activity_preferences
      : undefined,
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
      activity_preferences: Array.isArray(corePartner?.activity_preferences)
        ? corePartner.activity_preferences
        : undefined,
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

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function tagsOverlapPair(
  offerTags: string[],
  primaryPrefs: string[],
  partnerPrefs: string[],
): boolean {
  const pair = new Set([...primaryPrefs, ...partnerPrefs].map((t) => t.trim().toLowerCase()));
  if (!pair.size || !offerTags.length) return false;
  return offerTags.some((t) => pair.has(String(t).trim().toLowerCase()));
}

function offerInDateWindow(
  row: Record<string, unknown>,
  dateFrom?: string,
  dateTo?: string,
): boolean {
  const now = Date.now();
  const vf = row.valid_from ? new Date(String(row.valid_from)).getTime() : null;
  const vt = row.valid_to ? new Date(String(row.valid_to)).getTime() : null;
  if (vf != null && !isNaN(vf) && vf > now) return false;
  if (vt != null && !isNaN(vt) && vt < now) return false;
  if (dateFrom) {
    const df = new Date(dateFrom.includes("T") ? dateFrom : `${dateFrom}T00:00:00.000Z`).getTime();
    if (vt != null && !isNaN(vt) && vt < df) return false;
  }
  if (dateTo) {
    const dt = new Date(dateTo.includes("T") ? dateTo : `${dateTo}T23:59:59.999Z`).getTime();
    if (vf != null && !isNaN(vf) && vf > dt) return false;
  }
  return true;
}

/**
 * HARD RULE: inject sponsored offers only when ≥1 category_tag overlaps pair activity_preferences
 * AND user is within radius_km. No match → empty array (never inject irrelevant ads).
 */
async function prefetchRelevantBusinessOffers(
  supabase: ReturnType<typeof createClient>,
  input: {
    primaryUserId: string;
    partnerUserId?: string | null;
    lat?: number | null;
    lng?: number | null;
    city: string;
    dateFrom?: string;
    dateTo?: string;
  },
): Promise<unknown[]> {
  const [corePrimary, corePartner, offersRes] = await Promise.all([
    getCoreProfile(supabase, input.primaryUserId),
    input.partnerUserId && input.partnerUserId !== input.primaryUserId
      ? getCoreProfile(supabase, input.partnerUserId)
      : Promise.resolve(null),
    supabase
      .from("business_offers")
      .select(
        "id, business_id, title, description, image_url, booking_url, category_tags, city, valid_from, valid_to, radius_km, budget_cents, is_active",
      )
      .eq("is_active", true)
      .limit(120),
  ]);

  if (offersRes.error) {
    console.warn("[ai-gateway] business_offers:", offersRes.error.message);
    return [];
  }

  const primaryPrefs = coerceStringArray(corePrimary?.activity_preferences);
  const partnerPrefs = coerceStringArray(corePartner?.activity_preferences);
  if (!primaryPrefs.length && !partnerPrefs.length) return [];

  let userLat = typeof input.lat === "number" && !isNaN(input.lat) ? input.lat : null;
  let userLng = typeof input.lng === "number" && !isNaN(input.lng) ? input.lng : null;
  if ((userLat == null || userLng == null) && input.city.trim()) {
    const geo = await geocodeCity(input.city.trim());
    if (geo) {
      userLat = geo.lat;
      userLng = geo.lng;
    }
  }
  if (userLat == null || userLng == null) return [];

  const rows = (offersRes.data ?? []) as Record<string, unknown>[];
  const businessIds = Array.from(new Set(rows.map((r) => String(r.business_id)).filter(Boolean)));
  const profRes = businessIds.length
    ? await supabase
      .from("profiles_business")
      .select("id, location, business_name")
      .in("id", businessIds)
    : { data: [] as Record<string, unknown>[] };
  const locByBiz = new Map<string, string>();
  for (const p of (profRes.data ?? []) as Record<string, unknown>[]) {
    locByBiz.set(String(p.id), String(p.location ?? p.city ?? ""));
  }

  const geoCache = new Map<string, { lat: number; lng: number } | null>();
  const resolveOfferCoords = async (row: Record<string, unknown>): Promise<{ lat: number; lng: number } | null> => {
    const cityKey = String(row.city ?? locByBiz.get(String(row.business_id)) ?? input.city).trim();
    if (!cityKey) return null;
    if (!geoCache.has(cityKey)) geoCache.set(cityKey, await geocodeCity(cityKey));
    return geoCache.get(cityKey) ?? null;
  };

  const matched: Array<{ row: Record<string, unknown>; score: number }> = [];

  for (const row of rows) {
    if (!offerInDateWindow(row, input.dateFrom, input.dateTo)) continue;

    const tags = coerceStringArray(row.category_tags);
    if (!tagsOverlapPair(tags, primaryPrefs, partnerPrefs)) continue;

    const radiusKm = typeof row.radius_km === "number" ? row.radius_km : null;
    if (radiusKm == null || radiusKm <= 0) continue;

    const coords = await resolveOfferCoords(row);
    if (!coords) continue;

    const dist = haversineKm(userLat, userLng, coords.lat, coords.lng);
    if (dist > radiusKm) continue;

    const budget = typeof row.budget_cents === "number" ? row.budget_cents : 0;
    matched.push({ row, score: budget + Math.max(0, 40 - dist) });
  }

  matched.sort((a, b) => b.score - a.score);
  return matched.slice(0, 3).map(({ row }) => ({
    id: row.id,
    business_id: row.business_id,
    title: row.title,
    description: row.description,
    image_url: row.image_url,
    booking_url: row.booking_url,
    category_tags: row.category_tags,
    source: "winkly_business_offer",
  }));
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
4. Internal supply (priority order): (a) WINKLY_EVENTS_CANDIDATES — public events (keyword + pg_trgm-ranked from DB) for the user's dates/city/activity; if one fits USER_REQUEST, prefer it as options[0] with source "winkly_event" and real winkly_event_id. (b) WINKLY_SPONSORED_OFFERS — pre-filtered sponsored business_offers (already relevance-gated: category overlap + radius). Use at most one when it genuinely fits; set source "winkly_business_offer", include offer id, and booking_url when present — never force an irrelevant ad. (c) WINKLY_BUSINESS_CANDIDATES — { services, profiles } from business_services and profiles_business; use for mode business or when a service/venue on Winkly matches; set source "winkly_business_service" or "winkly_business_profile" and include the id field from the row. (d) EXTERNAL_PLACE_HINTS — optional real-world POIs from Google Places (if configured) or OpenStreetMap Nominatim; use for logistics/names only, not as confirmed bookings; cite as external hints in logic_bridge or logistics. You may still call get_winkly_events. Do not fabricate URLs; use website/booking_url from Winkly rows when present.

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

Output format: You MUST respond with valid JSON only — no markdown, no preamble, no conversational filler. Keep every string value SHORT (option_name ≤80 chars, why_this_fits/logic_bridge ≤120 chars, itinerary steps ≤60 chars). The app renders UI from precise keys, not prose. Prefer the DETAILED shape. Exactly 3 items in "options". Put Winkly options FIRST. For Winkly events include "source": "winkly_event" and "winkly_event_id".

Minimal shape (allowed): {"options":[{"option_name":"...","why_this_fits":"...","schedule":["7:00 PM - Activity",...],"business_link":"...","weather_note":"...","price_indicator":"€|€€|€€€"}]}

Detailed shape (preferred): {"options":[{"option_id":"opt_1","option_name":"...","source":"winkly_event","winkly_event_id":"<uuid>","narrative":"The Core Match","logic_bridge":"One sentence why this fits their DNA.","itinerary":[...],"schedule":["18:00 - ..."],"logistics":{...},"business_link":"...","weather_note":"...","price_indicator":"€€"}]}

If you call tools first, after the final turn return this JSON.`;

/** Variant B: more concise, more "vibe" language — for A/B test (add-to-planner rate, satisfaction). */
const CONCIERGE_SYSTEM_PROMPT_B = `You are Winkly's Concierge. Ultra-brief JSON only — short strings, no prose. Use profiles + [SYSTEM_CONTEXT] location hints. Safety → context → DNA. Prefer Winkly supply; EXTERNAL_PLACE_HINTS = POI hints only. Exactly 3 terse "options". Put Winkly first. Shape: {"options":[{"option_id":"opt_1","option_name":"...","logic_bridge":"≤120 chars","itinerary":[{"time":"18:00","activity":"..."}],"price_indicator":"€€"}]}.`;

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
      maxOutputTokens: capOutputTokens(1024),
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

async function runMatchAgentFinalAnthropic(anthropicKey: string, payload: Record<string, unknown>): Promise<MatchAgentModelJson | null> {
  const sys = `${MATCH_AGENT_RULES}

You are Winkly's Match Agent conductor. Respond with valid JSON only:
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
  "agent_message": "Winkly: ..."
}`;
  const text = await runAnthropicJson(
    anthropicKey,
    sys,
    `Structured pipeline output:\n${JSON.stringify(payload)}`,
    ANTHROPIC_MODEL_PLAN,
    1200,
    0.45,
  );
  return text ? parseMatchAgentModelJson(text) : null;
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
      max_tokens: capOutputTokens(1200),
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
  tier: SubscriptionTier,
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

  const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
  const geminiKey = Deno.env.get("GEMINI_API_KEY");
  const openaiKey = Deno.env.get("OPENAI_API_KEY");
  let model: MatchAgentModelJson | null = null;
  if (isPremiumTier(tier) && anthropicKey) {
    model = await runMatchAgentFinalAnthropic(anthropicKey, llmPayload);
  }
  if (!model && geminiKey) model = await runMatchAgentFinalGemini(geminiKey, llmPayload);
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

const SUPER_LIKE_ICEBREAKER_SYSTEM = `You write one Super Like opener for a dating app (Romance mode).
Write a single warm, natural sentence (max 200 characters). Use the other person's first name when provided.
Prefer a shared interest or same city when possible. No emojis. Do not wrap the message in quotes.
Reply with valid JSON only: {"opener":"..."}`;

function parseSuperLikeOpenerJson(text: string): string | null {
  try {
    const j = JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/gi, "").trim()) as { opener?: unknown };
    if (typeof j.opener === "string" && j.opener.trim()) return j.opener.trim().slice(0, 200);
  } catch {
    const t = text.trim();
    if (t.length > 0 && t.length <= 220) return t.slice(0, 200);
  }
  return null;
}

async function runSuperLikeIcebreakerGemini(
  geminiKey: string,
  payload: Record<string, unknown>,
): Promise<string | null> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(geminiKey)}`;
  const body = {
    systemInstruction: { parts: [{ text: SUPER_LIKE_ICEBREAKER_SYSTEM }] },
    contents: [{ role: "user", parts: [{ text: JSON.stringify(payload) }] }],
    generationConfig: {
      maxOutputTokens: capOutputTokens(200),
      temperature: 0.65,
      responseMimeType: "application/json",
    },
  };
  const res = await fetchWithBackoff(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }, { retries: 2, baseMs: 500 });
  if (!res.ok) return null;
  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (typeof text !== "string") return null;
  return parseSuperLikeOpenerJson(text);
}

async function runSuperLikeIcebreakerAnthropic(
  anthropicKey: string,
  payload: Record<string, unknown>,
): Promise<string | null> {
  const text = await runAnthropicJson(
    anthropicKey,
    SUPER_LIKE_ICEBREAKER_SYSTEM,
    JSON.stringify(payload),
    ANTHROPIC_MODEL_LITE,
    200,
    0.65,
  );
  return text ? parseSuperLikeOpenerJson(text) : null;
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
      maxOutputTokens: capOutputTokens(768),
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

async function runMatchBridgeAnthropicJson(
  anthropicKey: string,
  payload: Record<string, unknown>,
): Promise<MatchBridgePayload | null> {
  const text = await runAnthropicJson(
    anthropicKey,
    MATCH_BRIDGE_SYSTEM,
    `Context JSON:\n${JSON.stringify(payload)}`,
    ANTHROPIC_MODEL,
    900,
    0.55,
  );
  return text ? parseMatchBridgePayload(text) : null;
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
      max_tokens: capOutputTokens(900),
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

function conciergeAnthropicTools(ctx: Record<string, unknown>) {
  return conciergeOpenAiTools(ctx).map((t) => ({
    name: t.function.name,
    description: t.function.description,
    input_schema: t.function.parameters,
  }));
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
  const parts: string[] = [];
  const injection = context.SYSTEM_CONTEXT_LOCATION as LocationContextInjection | undefined;
  if (injection) {
    parts.push(formatSystemContextBlock(injection));
  }
  parts.push(base);
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
  parts.push(
    `TOKEN BUDGET: max ${STRUCTURED_UI_MAX_TOKENS} output tokens. JSON only; omit empty fields; keep all string values minimal.`,
  );
  return parts.join("\n\n");
}

/** Middleware: capture user message → parallel location fetches → inject SYSTEM_CONTEXT + merge place hints. */
async function applyLocationContextMiddleware(
  context: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const injection = await buildLocationContextInjection(context, geocodeCity);
  if (!injection) return context;
  const mergedHints = mergeLocationHints(injection);
  const existing = Array.isArray(context.EXTERNAL_PLACE_HINTS) ? context.EXTERNAL_PLACE_HINTS : [];
  return {
    ...context,
    SYSTEM_CONTEXT_LOCATION: injection,
    EXTERNAL_PLACE_HINTS: mergedHints.length ? mergedHints : existing,
  };
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
      generationConfig: { maxOutputTokens: resolveMaxTokens(task), temperature: 0.7 },
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
      // A hard quota/billing exhaustion will not recover on retry — surface a distinct message.
      const quotaExhausted = res.status === 429 && /RESOURCE_EXHAUSTED|quota|billing|exceeded/i.test(err);
      const friendly = quotaExhausted
        ? "Winkly AI has reached its usage quota for now. Please try again later."
        : res.status === 429
          ? "The AI provider is rate-limiting. Wait a minute and try again, or use a paid API key for higher limits."
          : res.status === 401 || res.status === 403
            ? "Invalid or restricted API key. Check your Gemini/OpenAI key in Supabase secrets."
            : `AI temporarily unavailable (${res.status}). Try again in a moment.`;
      if (res.status === 429) {
        return { message: friendly, suggestions: [], statusCode: 429 as const, retry_after: quotaExhausted ? 3600 : 60, provider_status: res.status, quota_exhausted: quotaExhausted };
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
      max_tokens: resolveMaxTokens(task),
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
      // Hard quota/billing exhaustion ("insufficient_quota") will not recover — don't waste retries.
      if (/insufficient_quota|exceeded your current quota|billing/i.test(errBody)) {
        console.error("[ai-gateway] OpenAI quota exhausted (no retry). Body: " + errBody.slice(0, 300));
        return {
          message: "Winkly AI has reached its usage quota for now. Please try again later.",
          suggestions: [],
          statusCode: 429 as const,
          retry_after: 3600,
          provider_status: 429,
          quota_exhausted: true,
        };
      }
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

async function resolveConciergeToolResult(
  name: string,
  args: Record<string, unknown>,
  userId: string,
  context: Record<string, unknown>,
  supabase: ReturnType<typeof createClient>,
): Promise<string> {
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
      return await getWeather(lat, lng, args.date as string);
    }
    return JSON.stringify({ error: "Need latitude/longitude or city in context" });
  }
  if (name === "get_winkly_events") {
    return await getWinklyEvents(supabase, {
      mode: args.mode as string,
      dateFrom: args.date_from as string,
      dateTo: args.date_to as string,
      limit: (args.limit as number) ?? 10,
    });
  }
  if (name === "get_planner_items") {
    return await getPlannerItemsForUser(supabase, userId, args.source_mode as string);
  }
  return JSON.stringify({ error: "Unknown tool" });
}

async function runAnthropicWithTools(
  anthropicKey: string,
  userId: string,
  task: string,
  context: Record<string, unknown>,
  supabase: ReturnType<typeof createClient>,
  systemPrompt: string,
): Promise<ConciergeLlmResult> {
  const userContent = conciergeUserMessage(task, context);
  const sysFull = conciergeSystemPromptAugment(systemPrompt, context);
  const model = pickAnthropicModel(task);
  const url = "https://api.anthropic.com/v1/messages";

  type AnthropicContent =
    | { type: "text"; text: string }
    | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
    | { type: "tool_result"; tool_use_id: string; content: string };

  const messages: Array<{ role: "user" | "assistant"; content: string | AnthropicContent[] }> = [
    { role: "user", content: userContent },
  ];

  const maxTurns = 5;
  let turn = 0;

  while (turn < maxTurns) {
    const body: Record<string, unknown> = {
      model,
      max_tokens: resolveMaxTokens(task),
      temperature: 0.7,
      system: sysFull,
      messages,
    };
    if (["plan", "concierge", "event_suggest", "winkly_plan"].includes(task)) {
      body.tools = conciergeAnthropicTools(context);
    }

    const res = await fetchWithBackoff(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(body),
    }, { retries: 4, baseMs: 900 });

    if (!res.ok) {
      const err = await res.text();
      console.error("[ai-gateway] Anthropic !ok status=" + res.status + " body=" + err.slice(0, 400));
      const quotaExhausted = res.status === 429 && /rate_limit|quota|billing|exceeded/i.test(err);
      const friendly = quotaExhausted
        ? "Winkly AI has reached its usage quota for now. Please try again later."
        : res.status === 429
          ? "The AI provider is rate-limiting. Wait a minute and try again, or use a paid API key for higher limits."
          : res.status === 401 || res.status === 403
            ? "Invalid or restricted API key. Check your Anthropic/Gemini/OpenAI key in Supabase secrets."
            : `AI temporarily unavailable (${res.status}). Try again in a moment.`;
      if (res.status === 429) {
        return { message: friendly, suggestions: [], statusCode: 429, retry_after: quotaExhausted ? 3600 : 60, provider_status: res.status, quota_exhausted: quotaExhausted };
      }
      return { message: friendly, suggestions: [], provider_status: res.status };
    }

    const data = await res.json();
    const content = data.content as AnthropicContent[] | undefined;
    if (!Array.isArray(content) || content.length === 0) {
      return { message: "No response from AI.", suggestions: [], no_options_reason: "No response from AI." };
    }

    const toolUses = content.filter((b): b is Extract<AnthropicContent, { type: "tool_use" }> => b.type === "tool_use");
    if (toolUses.length > 0) {
      messages.push({ role: "assistant", content });
      const toolResults: AnthropicContent[] = [];
      for (const tu of toolUses) {
        const toolResult = await resolveConciergeToolResult(tu.name, tu.input ?? {}, userId, context, supabase);
        toolResults.push({ type: "tool_result", tool_use_id: tu.id, content: toolResult });
      }
      messages.push({ role: "user", content: toolResults });
      turn++;
      continue;
    }

    const text = content.find((b): b is Extract<AnthropicContent, { type: "text" }> => b.type === "text")?.text?.trim() ?? "";
    const options = parseConciergeOptions(text);
    const list = options ?? [];
    const noOptionsReason = list.length === 0 && text ? (text.slice(0, 120).replace(/\n/g, " ").trim() + (text.length > 120 ? "…" : "")) : undefined;
    return { message: text, suggestions: list, no_options_reason: noOptionsReason };
  }

  return { message: "Planning took too many steps. Please try again.", suggestions: [], no_options_reason: "Planning took too many steps." };
}

/** Tier-aware LLM chain: Premium/Enterprise → Anthropic first; Super → Gemini first. */
async function runConciergeLlmChain(
  tier: SubscriptionTier,
  userId: string,
  task: string,
  context: Record<string, unknown>,
  supabase: ReturnType<typeof createClient>,
  systemPrompt: string,
): Promise<ConciergeLlmResult> {
  const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
  const geminiKey = Deno.env.get("GEMINI_API_KEY");
  const openaiKey = Deno.env.get("OPENAI_API_KEY");

  if (isPremiumTier(tier) && anthropicKey) {
    let result = await runAnthropicWithTools(anthropicKey, userId, task, context, supabase, systemPrompt);
    const shouldFallback = result.statusCode === 429 ||
      (result.provider_status != null && result.provider_status >= 400);
    if (shouldFallback) {
      console.warn(`[ai-gateway] Anthropic failed (status=${result.provider_status ?? result.statusCode}); trying Gemini/OpenAI.`);
      if (geminiKey) {
        await new Promise((r) => setTimeout(r, 800));
        result = await runGeminiWithTools(geminiKey, userId, task, context, supabase, systemPrompt);
        if (result.statusCode === 429 && openaiKey) {
          await new Promise((r) => setTimeout(r, 1500));
          result = await runOpenAIWithTools(openaiKey, userId, task, context, supabase, systemPrompt);
        }
      } else if (openaiKey) {
        result = await runOpenAIWithTools(openaiKey, userId, task, context, supabase, systemPrompt);
      }
    }
    return result;
  }

  if (geminiKey) {
    let result = await runGeminiWithTools(geminiKey, userId, task, context, supabase, systemPrompt);
    if (result.statusCode === 429 && openaiKey) {
      console.warn("[ai-gateway] Gemini returned 429; trying OpenAI.");
      await new Promise((r) => setTimeout(r, 1500));
      result = await runOpenAIWithTools(openaiKey, userId, task, context, supabase, systemPrompt);
    }
    if (openaiKey) {
      const ps = (result as ConciergeLlmResult).provider_status;
      if (ps != null && ps !== 429) {
        const oai = await runOpenAIWithTools(openaiKey, userId, task, context, supabase, systemPrompt);
        if (oai.statusCode === 429) return oai;
        const oaps = (oai as ConciergeLlmResult).provider_status;
        if (oaps == null) return oai;
      }
    }
    return result;
  }
  if (openaiKey) {
    return await runOpenAIWithTools(openaiKey, userId, task, context, supabase, systemPrompt);
  }
  return {
    suggestions: [],
    no_options_reason: "AI is not configured for this environment. Add ANTHROPIC_API_KEY, OPENAI_API_KEY, or GEMINI_API_KEY to enable plans.",
  };
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

function mapsSearchUrlForVenue(venueName: string, city?: string, country?: string): string {
  const q = [venueName, city, country].filter(Boolean).join(" ");
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q).replace(/%20/g, "+")}`;
}

function isNoVenueFallbackPlan(plan: WinklyPlanOutput | null | undefined): boolean {
  if (!plan?.options?.length) return true;
  return plan.options.every((o) => o.venue?.name === "No suitable venue found");
}

function coerceDurationMinutes(v: unknown): number {
  if (typeof v === "number" && isFinite(v)) return Math.round(v);
  if (typeof v === "string") {
    const n = parseInt(v.replace(/[^\d]/g, ""), 10);
    if (isFinite(n) && n > 0) return n;
  }
  return 120;
}

function extractPlanOptionsArray(obj: Record<string, unknown>): unknown[] | null {
  const direct = obj.options;
  if (Array.isArray(direct) && direct.length > 0) return direct;
  const plan = obj.plan;
  if (plan && typeof plan === "object") {
    const nested = (plan as Record<string, unknown>).options;
    if (Array.isArray(nested) && nested.length > 0) return nested;
  }
  return null;
}

function parseWinklyPlanOutput(
  text: string,
  opts?: { city?: string; country?: string },
): WinklyPlanOutput | null {
  let raw = text.trim();
  const codeBlock = raw.match(/^```(?:json)?\s*([\s\S]*?)```$/);
  if (codeBlock) raw = codeBlock[1].trim();
  let obj: unknown;
  try {
    obj = JSON.parse(raw);
  } catch {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        obj = JSON.parse(raw.slice(start, end + 1));
      } catch {
        return null;
      }
    } else {
      return null;
    }
  }
  if (!obj || typeof obj !== "object") return null;
  const o = obj as Record<string, unknown>;

  const optionsRaw = extractPlanOptionsArray(o);
  if (!optionsRaw?.length) return null;

  const parseOpt = (v: unknown, id: "A" | "B"): WinklyPlanOptionOut | null => {
    if (!v || typeof v !== "object") return null;
    const x = v as Record<string, unknown>;

    const option_id = x.option_id === "A" || x.option_id === "B" ? (x.option_id as "A" | "B") : id;
    const venueRaw = x.venue;
    if (!venueRaw || typeof venueRaw !== "object") return null;
    const venue = venueRaw as Record<string, unknown>;
    const vname = typeof venue.name === "string" ? venue.name.trim() : "";
    if (!vname || vname === "No suitable venue found") return null;

    const character_label =
      typeof x.character_label === "string" && x.character_label.trim()
        ? x.character_label.trim()
        : id === "A"
          ? "Bolder pick"
          : "Reliable pick";
    const title =
      typeof x.title === "string" && x.title.trim()
        ? x.title.trim()
        : vname;
    const why_this_fits =
      typeof x.why_this_fits === "string" && x.why_this_fits.trim()
        ? x.why_this_fits.trim()
        : `A strong fit for ${opts?.city ?? "your area"}.`;
    let weather_note = typeof x.weather_note === "string" ? x.weather_note.trim() : "";
    if (!weather_note) weather_note = "Check the forecast closer to your date.";
    const duration_minutes = coerceDurationMinutes(x.duration_minutes);

    const vaddr = typeof venue.address === "string" ? venue.address.trim() : "";
    let vmap = typeof venue.google_maps_link === "string" ? venue.google_maps_link.trim() : "";
    let estimated_cost = typeof venue.estimated_cost === "string" ? venue.estimated_cost.trim() : "";
    if (!vmap) vmap = mapsSearchUrlForVenue(vname, opts?.city, opts?.country);
    if (!estimated_cost) estimated_cost = "Varies";
    const booking_url =
      typeof venue.booking_url === "string" && /^https?:\/\//i.test(venue.booking_url)
        ? String(venue.booking_url).slice(0, 600)
        : undefined;

    const itinRaw = x.itinerary;
    const itinerary =
      Array.isArray(itinRaw)
        ? itinRaw
            .filter((r) => r && typeof r === "object")
            .map((r) => {
              const rr = r as Record<string, unknown>;
              return {
                time: typeof rr.time === "string" ? rr.time.trim().slice(0, 12) : "",
                description: typeof rr.description === "string" ? rr.description.trim().slice(0, 220) : "",
              };
            })
            .filter((r) => r.time && r.description)
            .slice(0, 10)
        : [];

    return {
      option_id,
      character_label: character_label.slice(0, 40),
      title: title.slice(0, 140),
      why_this_fits: why_this_fits.slice(0, 340),
      itinerary,
      venue: {
        name: vname.slice(0, 120),
        address: vaddr.slice(0, 180),
        google_maps_link: vmap.slice(0, 600),
        estimated_cost: estimated_cost.slice(0, 60),
        ...(booking_url ? { booking_url } : {}),
      },
      weather_note: weather_note.slice(0, 220),
      duration_minutes: Math.min(24 * 60, Math.max(30, duration_minutes)),
    };
  };

  const parsed = optionsRaw
    .slice(0, 2)
    .map((opt, idx) => parseOpt(opt, idx === 0 ? "A" : "B"))
    .filter((opt): opt is WinklyPlanOptionOut => !!opt);

  if (!parsed.length) return null;
  if (parsed.length === 1) {
    const twin: WinklyPlanOptionOut = {
      ...parsed[0],
      option_id: "B",
      character_label: "Reliable pick",
      title: parsed[0].title.length < 120 ? `${parsed[0].title} (alt)` : parsed[0].title,
    };
    return { options: [parsed[0], twin] };
  }
  return { options: [parsed[0], parsed[1]] };
}

async function runOpenAIPlanJson(
  openaiKey: string,
  system: string,
  userContent: string,
): Promise<string | null> {
  const res = await fetchWithBackoff(
    "https://api.openai.com/v1/chat/completions",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${openaiKey}`,
      },
      body: JSON.stringify({
        model: Deno.env.get("OPENAI_MODEL_PLAN") ?? "gpt-4o-mini",
        max_tokens: resolveMaxTokens("winkly_plan"),
        temperature: 0.5,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: userContent },
        ],
      }),
    },
    { retries: 2, baseMs: 700 },
  );
  if (!res.ok) {
    const errBody = await res.text().catch(() => "");
    console.error("[ai-gateway] OpenAI plan !ok status=" + res.status + " body=" + errBody.slice(0, 300));
    return null;
  }
  const data = await res.json();
  const text = data.choices?.[0]?.message?.content;
  return typeof text === "string" ? text : null;
}

function noVenueFoundPlan(seedTitle: string): WinklyPlanOutput {
  const mk = (id: "A" | "B", label: string): WinklyPlanOptionOut => ({
    option_id: id,
    character_label: label,
    title: seedTitle.slice(0, 140) || "Plan",
    why_this_fits: "No suitable venue found.",
    itinerary: [{ time: "19:30", description: "Pick a different location or broaden constraints and try again." }],
    venue: { name: "No suitable venue found", address: "", google_maps_link: "", estimated_cost: "" },
    weather_note: "Weather not available.",
    duration_minutes: 120,
  });
  return { options: [mk("A", "Bolder pick"), mk("B", "Reliable pick")] };
}

/** When Places verification succeeded, force both options onto the grounded venue (booking URL optional). */
function applyVerifiedVenueToOptions(
  plan: WinklyPlanOutput,
  vv: { name: string; address: string; google_maps_link: string },
  bookingUrl: string | null,
): WinklyPlanOutput {
  const mergeOpt = (opt: WinklyPlanOptionOut): WinklyPlanOptionOut => ({
    ...opt,
    venue: {
      name: vv.name,
      address: vv.address,
      google_maps_link: vv.google_maps_link,
      estimated_cost: opt.venue.estimated_cost,
      ...(bookingUrl ? { booking_url: bookingUrl } : {}),
    },
  });
  return {
    options: [mergeOpt(plan.options[0]), mergeOpt(plan.options[1])],
  };
}

function inclusiveDayCountIso(dateFrom: string, dateTo: string): number {
  const a = new Date(`${dateFrom.slice(0, 10)}T12:00:00Z`);
  const b = new Date(`${dateTo.slice(0, 10)}T12:00:00Z`);
  if (isNaN(a.getTime()) || isNaN(b.getTime())) return 1;
  const diff = Math.round((b.getTime() - a.getTime()) / 86400000);
  return Math.max(1, diff + 1);
}

/** Readable weather for prompts and fallbacks — avoids raw JSON in model output / cards. */
function formatWeatherSnapshotProse(w: unknown): string {
  if (!w || typeof w !== "object") return "Weather: not provided.";
  const o = w as Record<string, unknown>;
  const parts: string[] = [];
  const period = typeof o.period_summary === "string" ? o.period_summary.trim() : "";
  const summary = typeof o.summary === "string" ? o.summary.trim() : "";
  if (period) parts.push(period);
  else if (summary) parts.push(summary);
  const amin = o.avg_temp_min;
  const amax = o.avg_temp_max;
  const tmin = o.temp_min;
  const tmax = o.temp_max;
  const atTime = o.temp_at_time;
  const hour = typeof o.forecast_hour === "string" ? o.forecast_hour.trim() : "";
  if (typeof atTime === "number" && hour) {
    parts.push(`At ${hour} local: ~${Math.round(atTime)}°C.`);
  }
  if (typeof amin === "number" && typeof amax === "number") {
    parts.push(`Typical temps ~${amin}–${amax}°C.`);
  } else if (typeof tmin === "number" && typeof tmax === "number") {
    parts.push(`Day temps ${tmin}–${tmax}°C.`);
  }
  const rainy = o.rainy_days;
  const total = o.total_days;
  if (typeof rainy === "number" && typeof total === "number" && total > 1) {
    parts.push(`Rain on ${rainy} of ${total} day(s).`);
  } else if (typeof o.precipitation === "number") {
    parts.push(`Precipitation at planned time: ${o.precipitation} mm.`);
    if (typeof o.precipitation_day === "number" && o.precipitation_day !== o.precipitation) {
      parts.push(`Daily total: ${o.precipitation_day} mm.`);
    }
  }
  const d = typeof o.date === "string" ? o.date.trim() : "";
  if (d) parts.push(`(Forecast anchor: ${d}.)`);
  return parts.length ? parts.join(" ") : "Weather: not provided.";
}

function slotSummaryFromUnknown(s: unknown): string {
  if (!s || typeof s !== "object") return "";
  const o = s as Record<string, unknown>;
  const summary = typeof o.summary === "string" ? o.summary.trim() : "";
  const title = typeof o.title === "string" ? o.title.trim() : "";
  const activity = typeof o.activity === "string" ? o.activity.trim() : "";
  return (summary || title || activity).slice(0, 500);
}

function parseMultiDayPlannerOutput(
  text: string,
  numDays: number,
  startIsoDate: string,
): { plan: WinklyPlanOutput; trip_days: PlannerTripDayOut[] } | null {
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
  const weather_context = typeof o.weather_context === "string" ? o.weather_context.trim() : "";
  const logic_reasoning = typeof o.logic_reasoning === "string" ? o.logic_reasoning.trim() : "";
  const booking_links = Array.isArray(o.booking_links)
    ? o.booking_links.filter((x) => typeof x === "string").map((s) => s.trim()).filter(Boolean).slice(0, 6)
    : [];
  const ld = o.location_details;
  let location_details: { name: string; address: string; google_maps_link: string } | null = null;
  if (ld && typeof ld === "object") {
    const ldo = ld as Record<string, unknown>;
    const name = typeof ldo.name === "string" ? ldo.name.trim() : "";
    const address = typeof ldo.address === "string" ? ldo.address.trim() : "";
    const link = typeof ldo.google_maps_link === "string" ? ldo.google_maps_link.trim() : "";
    if (name) location_details = { name, address, google_maps_link: link };
  }
  const daysRaw = o.days;
  if (!topic || !weather_context || !logic_reasoning || !location_details || !Array.isArray(daysRaw)) {
    return null;
  }

  const padDate = (idx: number): string => {
    const base = new Date(`${startIsoDate.slice(0, 10)}T12:00:00Z`);
    base.setUTCDate(base.getUTCDate() + idx);
    return base.toISOString().slice(0, 10);
  };

  const trip_days: PlannerTripDayOut[] = [];
  for (let i = 0; i < numDays; i++) {
    const row = daysRaw[i];
    const fallbackDate = padDate(i);
    if (!row || typeof row !== "object") {
      trip_days.push({
        day: i + 1,
        date: fallbackDate,
        morning: { summary: "Flexible morning — explore the area." },
        afternoon: { summary: "Flexible afternoon." },
        evening: { summary: "Relax or light evening plans." },
      });
      continue;
    }
    const ro = row as Record<string, unknown>;
    const dateStr = typeof ro.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(ro.date.slice(0, 10))
      ? ro.date.slice(0, 10)
      : fallbackDate;
    const mSummary = slotSummaryFromUnknown(ro.morning);
    const aSummary = slotSummaryFromUnknown(ro.afternoon);
    const eSummary = ro.evening !== undefined ? slotSummaryFromUnknown(ro.evening) : "";
    const day: PlannerTripDayOut = {
      day: typeof ro.day === "number" && isFinite(ro.day) ? Math.round(ro.day) : i + 1,
      date: dateStr,
      morning: { summary: mSummary || "Morning exploration." },
      afternoon: { summary: aSummary || "Afternoon plans." },
    };
    if (eSummary) day.evening = { summary: eSummary };
    trip_days.push(day);
  }

  const date_time = `${startIsoDate.slice(0, 10)}T10:00:00.000Z`;
  const planLegacy = {
    topic: topic.slice(0, 120),
    date_time,
    duration: Math.min(24 * 60 * 7, Math.max(180, numDays * 8 * 60)),
    location_details,
    weather_context: weather_context.slice(0, 400),
    booking_links,
    logic_reasoning: logic_reasoning.slice(0, 600),
  };
  return { plan: planLegacy as unknown as WinklyPlanOutput, trip_days };
}

async function runMultiDayWinklyGemini(params: {
  geminiKey: string;
  profiles: Array<Record<string, unknown>>;
  city: string;
  country?: string;
  userIdea: string;
  weather: unknown;
  amount: number | null;
  currency: string | null;
  dtIso: string;
  numDays: number;
  mode: string;
}): Promise<{ plan: WinklyPlanOutput; trip_days: PlannerTripDayOut[] }> {
  const startIso = params.dtIso.slice(0, 10);
  const SYSTEM = `You are Winkly Concierge Agent — multi-day trip planner.

Rules:
- Respect ALL participant allergies/constraints from profiles when naming activities.
- Produce exactly ${params.numDays} consecutive calendar days starting ${startIso} (use ISO date YYYY-MM-DD for each day).
- Each day MUST include morning and afternoon slots (specific venues or neighborhoods when possible). Evening is optional.
- booking_links must be [] unless you have verified HTTPS URLs (usually empty).
- Never fabricate booking URLs.
- Use realistic venue or area names for ${params.city}${params.country ? ", " + params.country : ""}.

Return JSON only:
{
  "topic": string,
  "days": [
    {
      "day": number,
      "date": string,
      "morning": { "summary": string },
      "afternoon": { "summary": string },
      "evening"?: { "summary": string }
    }
  ],
  "location_details": { "name": string, "address": string, "google_maps_link": string },
  "weather_context": string,
  "booking_links": string[],
  "logic_reasoning": string
}`;

  const payload = {
    mode: params.mode,
    participant_profiles: params.profiles,
    planning_hint: params.userIdea,
    budget: { amount: params.amount, currency: params.currency },
    weather_summary: formatWeatherSnapshotProse(params.weather),
    city: params.city,
    country: params.country ?? null,
    trip: { start_date: startIso, num_days: params.numDays },
  };

  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL_PLAN}:generateContent?key=${encodeURIComponent(params.geminiKey)}`;
  const body = {
    systemInstruction: { parts: [{ text: SYSTEM }] },
    contents: [{ role: "user", parts: [{ text: JSON.stringify(payload) }] }],
    generationConfig: {
      maxOutputTokens: resolveMaxTokens("planner_theme_plans"),
      temperature: 0.45,
      responseMimeType: "application/json",
    },
  };
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) {
    const seed = noVenueFoundPlan(params.userIdea.slice(0, 120) || "Trip");
    return { plan: seed, trip_days: [] };
  }
  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  const parsed = typeof text === "string" ? parseMultiDayPlannerOutput(text, params.numDays, startIso) : null;
  if (!parsed) {
    const seed = noVenueFoundPlan(params.userIdea.slice(0, 120) || "Trip");
    return { plan: seed, trip_days: [] };
  }
  return parsed;
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
  /** When set with num_days > 1, returns a day-by-day itinerary (skips single-day Maps verify path). */
  multiDay?: { num_days: number } | null;
  /** Premium/Enterprise → Anthropic (Claude) for single-day plan JSON when ANTHROPIC_API_KEY is set. */
  tier?: SubscriptionTier;
  /** Short label for fallback cards (e.g. activity theme) — not the full planning brief. */
  displaySeedTitle?: string;
  /** Verbatim Planner form text — preferred user brief for the model. */
  planRequestText?: string;
  /** Pre-fetched [SYSTEM_CONTEXT] location block from middleware. */
  systemContextBlock?: string;
}): Promise<{
  plan: WinklyPlanOutput;
  trip_days?: PlannerTripDayOut[];
  pending_plan_id: string | null;
  provider: "gemini" | "anthropic" | "openai" | "fallback";
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

  const planSeedTitle = (params.displaySeedTitle ?? userIdea ?? "Plan").trim().slice(0, 120) || "Plan";

  const geminiKey = Deno.env.get("GEMINI_API_KEY");
  const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
  const openaiKey = Deno.env.get("OPENAI_API_KEY");
  const useAnthropicPlan = params.tier && isPremiumTier(params.tier) && !!anthropicKey;
  const planRequestText = (params.planRequestText ?? userIdea).trim();

  const multiReq = params.multiDay;
  if (multiReq && multiReq.num_days > 1) {
    if (!geminiKey) {
      const fallback = noVenueFoundPlan(planSeedTitle);
      return {
        plan: fallback,
        trip_days: [],
        pending_plan_id: null,
        provider: "fallback",
        location_id: null,
        booking_url: null,
        participants: ensureRequester,
      };
    }
    const mdOut = await runMultiDayWinklyGemini({
      geminiKey,
      profiles: profiles as unknown as Array<Record<string, unknown>>,
      city,
      country,
      userIdea,
      weather,
      amount,
      currency,
      dtIso: dt,
      numDays: Math.min(7, Math.max(2, Math.round(multiReq.num_days))),
      mode: input.mode,
    });
    let pendingPlanId: string | null = null;
    if (persistDraft) {
      try {
        const planJsonEnvelope = {
          ...(mdOut.plan as unknown as Record<string, unknown>),
          date_time: dt,
          city,
          country: country ?? null,
        };
        const ins = await supabase.from("pending_plans").insert({
          created_by: requesterUserId,
          source_mode: input.mode,
          participant_ids: ensureRequester,
          conversation_id: conversationId ?? null,
          plan_json: planJsonEnvelope,
          status: "pending",
        }).select("id").single();
        if (!ins.error && ins.data) pendingPlanId = (ins.data as { id: string }).id;
      } catch {
        pendingPlanId = null;
      }
    }
    return {
      plan: mdOut.plan,
      trip_days: mdOut.trip_days.length ? mdOut.trip_days : undefined,
      pending_plan_id: pendingPlanId,
      provider: "gemini",
      location_id: null,
      booking_url: null,
      participants: ensureRequester,
    };
  }

  if (!geminiKey && !useAnthropicPlan && !openaiKey) {
    const fallback = noVenueFoundPlan(planSeedTitle);
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

  // Grounded venue payload (Text Search). Optional: when GOOGLE_PLACES_API_KEY is set, Gemini can be
  // aligned to a verified place + optional booking_url; without a key, Gemini still produces venues from world knowledge.
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

  const SYSTEM = `${params.systemContextBlock ? `${params.systemContextBlock}\n\n` : ""}You are Winkly Concierge Agent.

You will receive: multiple participant profiles (interests, allergies, lifestyle, location) and planning form data (idea/date_time/budget/weather).

Rules:
- Validate the user's idea against ALL participant constraints.
- Return exactly two plan options as JSON: { "options": [ {...}, {...} ] }.
- Keep every string SHORT (title ≤80 chars, why_this_fits ≤120 chars, itinerary descriptions ≤60 chars). JSON only — no prose.
- Option A — the bolder, more memorable choice. character_label: pick from ["Bolder pick","Surprising choice","Hidden gem","Local favourite"].
- Option B — the safer, reliable choice. character_label: pick from ["Classic choice","Safe & solid","Reliable pick","Crowd pleaser"].
- Use your world knowledge to suggest real, specific venues in the city and country provided (named restaurants, cafés, cultural venues, etc.). Do not invent fake URLs.
- When VERIFIED_VENUE is non-null, BOTH options MUST use that exact venue name, address, and google_maps_link for their venue objects (still vary titles, itinerary tone, and why_this_fits).
- When VERIFIED_VENUE is null, propose two distinct real venues. For google_maps_link use a Maps search URL: https://www.google.com/maps/search/?api=1&query=ENCODED_VENUE_NAME_AND_CITY (encode spaces as +).
- Put human-readable weather in weather_note — never paste raw JSON.
- booking_url inside venue must be omitted unless BOOKING_URL is provided (non-null).
- Output MUST be valid JSON and follow the required schema exactly.

Required JSON schema:
{
  "options": [
    {
      "option_id": "A" | "B",
      "character_label": string,
      "title": string,
      "why_this_fits": string,
      "itinerary": [{ "time": string, "description": string }],
      "venue": {
        "name": string,
        "address": string,
        "google_maps_link": string,
        "estimated_cost": string,
        "booking_url"?: string
      },
      "weather_note": string,
      "duration_minutes": number
    },
    { ... }
  ]
}`;

  const payload = {
    participant_profiles: profiles,
    planning_form: {
      user_idea: userIdea || null,
      date_time: dt,
      budget: { amount, currency },
      weather_summary: formatWeatherSnapshotProse(weather),
      city,
      country,
    },
    ...(verifiedVenue ? { VERIFIED_VENUE: verifiedVenue } : {}),
    ...(verifiedBookingUrl ? { BOOKING_URL: verifiedBookingUrl } : {}),
  };

  const planUserContent = planRequestText
    ? `USER_REQUEST (authoritative brief from the Planner form):\n\n${planRequestText}\n\n---\nStructured context:\n${JSON.stringify(payload)}`
    : JSON.stringify(payload);

  let parsed: WinklyPlanOutput | null = null;
  let planProvider: "gemini" | "anthropic" | "openai" | "fallback" = "fallback";

  if (useAnthropicPlan && anthropicKey) {
    const anthropicText = await runAnthropicJson(
      anthropicKey,
      SYSTEM,
      planUserContent,
      ANTHROPIC_MODEL_PLAN,
      resolveMaxTokens("winkly_plan"),
      0.5,
    );
    parsed = anthropicText ? parseWinklyPlanOutput(anthropicText, { city, country }) : null;
    if (parsed) planProvider = "anthropic";
  }

  if (!parsed && geminiKey) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL_PLAN}:generateContent?key=${encodeURIComponent(geminiKey)}`;
    const body = {
      systemInstruction: { parts: [{ text: SYSTEM }] },
      contents: [{ role: "user", parts: [{ text: planUserContent }] }],
      generationConfig: {
        maxOutputTokens: resolveMaxTokens("winkly_plan"),
        temperature: 0.5,
        responseMimeType: "application/json",
      },
    };
    const res = await fetchWithBackoff(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }, { retries: 2, baseMs: 700 });
    if (res.ok) {
      const data = await res.json();
      const candidate = data.candidates?.[0];
      const text = candidate?.content?.parts?.[0]?.text;
      parsed = typeof text === "string" ? parseWinklyPlanOutput(text, { city, country }) : null;
      if (parsed) {
        planProvider = "gemini";
      } else {
        console.error("[ai-gateway] Gemini plan parse failed", {
          finishReason: candidate?.finishReason,
          textPreview: typeof text === "string" ? text.slice(0, 500) : null,
        });
      }
    } else {
      const errBody = await res.text().catch(() => "");
      console.error("[ai-gateway] Gemini plan !ok status=" + res.status + " body=" + errBody.slice(0, 400));
    }
  }

  if (!parsed && openaiKey) {
    const openaiText = await runOpenAIPlanJson(openaiKey, SYSTEM, planUserContent);
    parsed = openaiText ? parseWinklyPlanOutput(openaiText, { city, country }) : null;
    if (parsed) planProvider = "openai";
  }

  if (!parsed && verifiedVenue) {
    const mkFromVenue = (id: "A" | "B", label: string, title: string): WinklyPlanOptionOut => ({
      option_id: id,
      character_label: label,
      title: title.slice(0, 140),
      why_this_fits: `Matches your brief in ${city}.`,
      itinerary: [
        { time: "18:30", description: `Meet at ${verifiedVenue.name}` },
        { time: "20:00", description: "Enjoy the experience" },
      ],
      venue: {
        name: verifiedVenue.name,
        address: verifiedVenue.address,
        google_maps_link: verifiedVenue.google_maps_link,
        estimated_cost: "Varies",
        ...(verifiedBookingUrl ? { booking_url: verifiedBookingUrl } : {}),
      },
      weather_note: formatWeatherSnapshotProse(weather),
      duration_minutes: 120,
    });
    parsed = {
      options: [
        mkFromVenue("A", "Bolder pick", planSeedTitle),
        mkFromVenue("B", "Reliable pick", `${planSeedTitle} — classic`),
      ],
    };
    planProvider = "fallback";
  }

  let finalPlan: WinklyPlanOutput = parsed ?? noVenueFoundPlan(planSeedTitle);
  if (!parsed) {
    planProvider = "fallback";
    console.error("[ai-gateway] generateWinklyPlan all providers failed — using fallback", {
      city,
      hasGemini: !!geminiKey,
      hasAnthropic: !!anthropicKey,
      hasOpenAI: !!openaiKey,
      seedTitle: planSeedTitle,
    });
  }

  if (verifiedVenue) {
    finalPlan = applyVerifiedVenueToOptions(finalPlan, verifiedVenue, verifiedBookingUrl);
  }

  const planJsonEnvelope = {
    options: finalPlan.options,
    date_time: dt,
    city,
    country: country ?? null,
  };

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
        plan_json: planJsonEnvelope,
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
    provider: planProvider,
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
      scrubbedSafeContext.user_prompt = scrubbedSafeContext.user_prompt.slice(0, AI_LIMITS.maxUserPromptChars);
    }

    const isAiTask = AI_TASKS.has(task);

    // Server-side AI access enforcement (source of truth — client gate is UX only).
    if (isAiTask) {
      // 1) Global kill switch — disable all AI without redeploying client.
      if (AI_GATEWAY_DISABLED) {
        return new Response(
          JSON.stringify({ error: "AI is temporarily disabled", code: "ai_disabled" }),
          { status: 503, headers: { "Content-Type": "application/json", ...Object.fromEntries(cors) } }
        );
      }
      // 2) Per-tier feature flag — disable AI for specific tiers via env.
      if (AI_DISABLED_TIERS.has(tier)) {
        return new Response(
          JSON.stringify({ error: "AI is not available on your plan", code: "ai_disabled_for_tier", tier }),
          { status: 403, headers: { "Content-Type": "application/json", ...Object.fromEntries(cors) } }
        );
      }
      // 3) Tier access matrix — enforce minimum subscription tier per task (with free planner quota).
      const taskAccess = await resolveTaskAccess(supabase, user.id, tier, task);
      if (!taskAccess.allowed) {
        if (taskAccess.reason === "free_quota_exhausted") {
          const retryAfterUtcMidnight = Math.max(
            60,
            Math.ceil((Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate() + 1) - Date.now()) / 1000),
          );
          return new Response(
            JSON.stringify({
              error: `You've used your ${FREE_TIER_PLANS_PER_DAY} free AI plans for today.`,
              message: `You've used your ${FREE_TIER_PLANS_PER_DAY} free AI plans for today.`,
              code: "limit_reached",
              limit_type: "daily_quota",
              tier,
              required_tier: TASK_MIN_TIER[task],
              upgrade_to: "super",
              free_plans_per_day: FREE_TIER_PLANS_PER_DAY,
              retry_after: retryAfterUtcMidnight,
            }),
            { status: 429, headers: { "Content-Type": "application/json", ...Object.fromEntries(cors) } }
          );
        }
        const upgradeTo = suggestedUpgradeTier(task);
        return new Response(
          JSON.stringify({
            error: upgradeTo === "premium"
              ? "Upgrade to Premium for full concierge AI"
              : "Upgrade to Super or Premium for AI",
            code: "ai_tier_required",
            tier,
            required_tier: TASK_MIN_TIER[task],
            upgrade_to: upgradeTo,
          }),
          { status: 403, headers: { "Content-Type": "application/json", ...Object.fromEntries(cors) } }
        );
      }
    }

    // Cost guard: reject oversized context up front (prevents token-cost abuse).
    if (isAiTask) {
      let contextChars = 0;
      try {
        contextChars = JSON.stringify(scrubbedSafeContext).length;
      } catch {
        contextChars = 0;
      }
      if (contextChars > AI_LIMITS.maxContextChars) {
        return new Response(
          JSON.stringify({ error: "Request context too large", code: "context_too_large", max_chars: AI_LIMITS.maxContextChars }),
          { status: 413, headers: { "Content-Type": "application/json", ...Object.fromEntries(cors) } }
        );
      }
    }

    // Cost guard: clamp candidate count for rank/suggest tasks.
    const candidatesGuarded = Array.isArray(candidates) ? candidates.slice(0, AI_LIMITS.maxCandidates) : [];

    // Redis-based rate limiter (prevents abuse + smooths bursts).
    // Free tier is blocked for AI tasks server-side even if client gating fails.
    if (isAiTask) {
      const rl = await rateLimitOrThrow({ userId: user.id, tier, task });
      if (!rl.ok) {
        return new Response(
          JSON.stringify({
            error: "You're sending requests too quickly. Wait a moment and try again.",
            message: "You're sending requests too quickly. Wait a moment and try again.",
            code: "limit_reached",
            limit_type: "burst",
            retry_after: rl.retry_after,
          }),
          { status: 429, headers: { "Content-Type": "application/json", ...Object.fromEntries(cors) } },
        );
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

      const locCtxWp = await applyLocationContextMiddleware({ ...scrubbedSafeContext });
      const wpInjection = locCtxWp.SYSTEM_CONTEXT_LOCATION as LocationContextInjection | undefined;
      const out = await generateWinklyPlan({
        supabase,
        requesterUserId: user.id,
        input,
        conversationId: convId,
        persistDraft: true,
        maps_grounding: "verify",
        tier,
        systemContextBlock: wpInjection ? formatSystemContextBlock(wpInjection) : undefined,
      });
      if (isNoVenueFallbackPlan(out.plan)) {
        return new Response(
          JSON.stringify({
            error: "Could not generate plan options right now. Please wait a moment and try again.",
            code: "plan_generation_failed",
            provider: out.provider,
          }),
          { status: 503, headers: { "Content-Type": "application/json", ...Object.fromEntries(cors) } },
        );
      }

      const agentic_planning_output = {
        topic: out.plan.options?.[0]?.title ?? "Plan",
        date_time: typeof scrubbedSafeContext.date_from === "string" ? scrubbedSafeContext.date_from : null,
        location_id: out.location_id,
        weather_check: true,
        booking_url: out.booking_url,
        participants: out.participants,
      };

      const insWp = await supabase.from("ai_requests").insert({
        user_id: user.id,
        mode,
        task,
      }).select("id").single();
      const requestIdWp = !insWp.error ? (insWp.data as { id?: string } | null)?.id ?? null : null;

      return new Response(JSON.stringify({
        options: out.plan.options,
        agentic_planning_output,
        pending_plan_id: out.pending_plan_id,
        provider: out.provider,
        request_id: requestIdWp,
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

      const dateToRaw = typeof scrubbedSafeContext.date_to === "string" ? scrubbedSafeContext.date_to.trim() : "";
      const dateFromRaw =
        typeof scrubbedSafeContext.date_from === "string" && scrubbedSafeContext.date_from.trim()
          ? scrubbedSafeContext.date_from.trim()
          : dateTime;
      const explicitNd = typeof scrubbedSafeContext.num_days === "number" ? scrubbedSafeContext.num_days : null;
      let tripNumDays = 1;
      if (explicitNd != null && explicitNd > 1) {
        tripNumDays = Math.min(7, Math.max(2, Math.round(explicitNd)));
      } else if (dateToRaw.length >= 10 && dateFromRaw.length >= 10) {
        tripNumDays = inclusiveDayCountIso(dateFromRaw, dateToRaw);
      }

      const pr = typeof scrubbedSafeContext.plan_request_text === "string" ? scrubbedSafeContext.plan_request_text.trim() : "";
      // Prefer the full Planner form text (includes anonymised persona + constraints) when present.
      const userIdeaBase = (pr || `${theme} plan`).trim();
      const weatherHint = (() => {
        if (!wf) return "";
        const summary = typeof (wf as any).summary === "string"
          ? String((wf as any).summary)
          : typeof (wf as any).period_summary === "string"
          ? String((wf as any).period_summary)
          : "";
        const tMin = typeof (wf as any).temp_min === "number" ? (wf as any).temp_min : null;
        const tMax = typeof (wf as any).temp_max === "number" ? (wf as any).temp_max : null;
        const range = tMin != null && tMax != null ? `${tMin}–${tMax}°C` : "";
        const s = [summary, range].filter(Boolean).join(" ").trim();
        return s ? `Weather: ${s}.` : "";
      })();
      const indoorOutdoorHint =
        typeof scrubbedSafeContext.weather_forecast === "string" && scrubbedSafeContext.weather_forecast.toLowerCase().includes("rain")
          ? "Prefer indoor venues or weather-proof options."
          : "Prefer outdoor-friendly options when feasible.";

      // Semantic caching: same theme/city/mode/day/trip length within 24h
      const semKey =
        // v4: higher plan token budget; skip caching fallback plans
        `sc:planner_theme_plans:v4:${mode}:${normalizeTag(city)}:${normalizeTag(theme)}:${dateTime.slice(0, 10)}:${tripNumDays}:${hashKeyMaterial(participantIds.slice().sort().join(","))}`;
      const cached = await redisGetJson<PlannerThemePlansOutput>(semKey);
      const cachedOptions = cached?.plan_options ?? [];
      if (
        cachedOptions.length &&
        !isNoVenueFallbackPlan({ options: cachedOptions as WinklyPlanOptionOut[] })
      ) {
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
      const multiDayOpt = tripNumDays > 1 ? { num_days: tripNumDays } : null;

      const locCtxPt = await applyLocationContextMiddleware({ ...scrubbedSafeContext, city, country: countryStr });
      const ptInjection = locCtxPt.SYSTEM_CONTEXT_LOCATION as LocationContextInjection | undefined;

      // Single canonical plan generator: returns two options (A/B) in the WinklyPlanOption shape.
      const out = await generateWinklyPlan({
        supabase,
        requesterUserId: user.id,
        input: inputA,
        conversationId: null,
        persistDraft: false,
        maps_grounding: "textsearch",
        multiDay: multiDayOpt,
        tier,
        displaySeedTitle: theme,
        planRequestText: pr || undefined,
        systemContextBlock: ptInjection ? formatSystemContextBlock(ptInjection) : undefined,
      });

      if (isNoVenueFallbackPlan(out.plan)) {
        return new Response(
          JSON.stringify({
            error: "Could not generate plan options right now. Please wait a moment and try again.",
            code: "plan_generation_failed",
            provider: out.provider,
          }),
          { status: 503, headers: { "Content-Type": "application/json", ...Object.fromEntries(cors) } },
        );
      }

      const options = Array.isArray(out.plan?.options) ? out.plan.options : [];
      const response: PlannerThemePlansOutput = {
        plan_options: options.slice(0, 2).map((opt: WinklyPlanOptionOut) => ({
          ...opt,
          ...(out.trip_days?.length ? { trip_days: out.trip_days } : {}),
        })),
      };

      if (!isNoVenueFallbackPlan(out.plan)) {
        await redisSetJson(semKey, response, 86400).catch(() => {});
      }

      const insPt = await supabase.from("ai_requests").insert({
        user_id: user.id,
        mode,
        task,
      }).select("id").single();
      const requestIdPt = !insPt.error ? (insPt.data as { id?: string } | null)?.id ?? null : null;

      return new Response(JSON.stringify({ ...response, request_id: requestIdPt, provider: out.provider }), {
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

      const pipeline = await runMatchAgentPipeline(supabase, user.id, mode, partnerUserId, scrubbedSafeContext, tier);
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

    if (task === "super_like_icebreaker") {
      if (mode !== "romance") {
        return new Response(JSON.stringify({ error: "super_like_icebreaker requires mode romance" }), {
          status: 400,
          headers: { "Content-Type": "application/json", ...Object.fromEntries(cors) },
        });
      }
      const partnerUserIdSl = scrubbedSafeContext.partner_user_id as string | undefined;
      if (!partnerUserIdSl || partnerUserIdSl === user.id) {
        return new Response(JSON.stringify({ error: "partner_user_id required" }), {
          status: 400,
          headers: { "Content-Type": "application/json", ...Object.fromEntries(cors) },
        });
      }

      const selfFromClient =
        scrubbedSafeContext.self_profile && typeof scrubbedSafeContext.self_profile === "object"
          ? (scrubbedSafeContext.self_profile as Record<string, unknown>)
          : {};
      const otherFromClient =
        scrubbedSafeContext.other_profile && typeof scrubbedSafeContext.other_profile === "object"
          ? (scrubbedSafeContext.other_profile as Record<string, unknown>)
          : {};

      const profileCtxSl = await getConciergeProfileContext(supabase, user.id, "romance", partnerUserIdSl);
      const slPayload: Record<string, unknown> = {
        self_profile: {
          interests: selfFromClient.interests ?? profileCtxSl.primary.interests ?? profileCtxSl.primary.activity_preferences,
          city: selfFromClient.city ?? profileCtxSl.primary.city,
        },
        other_profile: {
          name: otherFromClient.name,
          interests: otherFromClient.interests ?? profileCtxSl.partner?.interests,
          city: otherFromClient.city ?? profileCtxSl.partner?.city,
        },
      };

      const insSl = await supabase.from("ai_requests").insert({
        user_id: user.id,
        mode,
        task,
      }).select("id").single();
      const requestIdSl = !insSl.error ? (insSl.data as { id?: string } | null)?.id ?? null : null;

      const anthropicKeySl = Deno.env.get("ANTHROPIC_API_KEY");
      const geminiKeySl = Deno.env.get("GEMINI_API_KEY");

      let openerSl: string | null = null;
      if (geminiKeySl) {
        openerSl = await runSuperLikeIcebreakerGemini(geminiKeySl, slPayload);
      }
      if (!openerSl && anthropicKeySl) {
        openerSl = await runSuperLikeIcebreakerAnthropic(anthropicKeySl, slPayload);
      }

      if (!openerSl) {
        return new Response(JSON.stringify({ error: "Could not generate opener" }), {
          status: 503,
          headers: { "Content-Type": "application/json", ...Object.fromEntries(cors) },
        });
      }

      return new Response(
        JSON.stringify({
          super_like_icebreaker: { opener: openerSl },
          message: openerSl,
          request_id: requestIdSl,
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

      const mbLat = typeof scrubbedSafeContext.latitude === "number" ? scrubbedSafeContext.latitude : null;
      const mbLng = typeof scrubbedSafeContext.longitude === "number" ? scrubbedSafeContext.longitude : null;

      const [preEvents, businessSupply, sponsoredOffers, placeHints] = await Promise.all([
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
        prefetchRelevantBusinessOffers(supabase, {
          primaryUserId: user.id,
          partnerUserId,
          lat: mbLat,
          lng: mbLng,
          city,
          dateFrom,
          dateTo,
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
        WINKLY_SPONSORED_OFFERS: sponsoredOffers,
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

      const anthropicKeyMb = Deno.env.get("ANTHROPIC_API_KEY");
      const geminiKeyMb = Deno.env.get("GEMINI_API_KEY");
      const openaiKeyMb = Deno.env.get("OPENAI_API_KEY");

      let bridge: MatchBridgePayload | null = null;
      if (isPremiumTier(tier) && anthropicKeyMb) {
        bridge = await runMatchBridgeAnthropicJson(anthropicKeyMb, mbPayload);
      }
      if (!bridge && geminiKeyMb) {
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
      const planCity = String(scrubbedSafeContext.city ?? "").trim();
      const planLat = typeof scrubbedSafeContext.latitude === "number" ? scrubbedSafeContext.latitude : null;
      const planLng = typeof scrubbedSafeContext.longitude === "number" ? scrubbedSafeContext.longitude : null;
      const planDateFrom = typeof scrubbedSafeContext.date_from === "string" ? scrubbedSafeContext.date_from : undefined;
      const planDateTo = typeof scrubbedSafeContext.date_to === "string" ? scrubbedSafeContext.date_to : undefined;

      const [preEvents, businessSupply, sponsoredOffers] = await Promise.all([
        prefetchMatchingWinklyEvents(supabase, {
          mode,
          city: planCity,
          country: countryStr,
          dateFrom: planDateFrom,
          dateTo: planDateTo,
          activityHint: String(scrubbedSafeContext.activity_hint ?? ""),
          planRequest: String(scrubbedSafeContext.plan_request_text ?? scrubbedSafeContext.user_prompt ?? ""),
        }),
        prefetchMatchingBusinessSupply(supabase, {
          city: planCity,
          activityHint: String(scrubbedSafeContext.activity_hint ?? ""),
          planRequest: String(scrubbedSafeContext.plan_request_text ?? scrubbedSafeContext.user_prompt ?? ""),
          mode,
        }),
        prefetchRelevantBusinessOffers(supabase, {
          primaryUserId: user.id,
          partnerUserId: partnerUserIdEarly,
          lat: planLat,
          lng: planLng,
          city: planCity,
          dateFrom: planDateFrom,
          dateTo: planDateTo,
        }),
      ]);
      contextForLlm.WINKLY_EVENTS_CANDIDATES = preEvents;
      contextForLlm.WINKLY_SPONSORED_OFFERS = sponsoredOffers;
      contextForLlm.WINKLY_BUSINESS_CANDIDATES = businessSupply;
      contextForLlm = await applyLocationContextMiddleware(contextForLlm);
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
      result: { message?: string; retry_after?: number; provider_status?: number; quota_exhausted?: boolean }
    ) {
      return new Response(
        JSON.stringify({
          error: result.message,
          retry_after: result.retry_after ?? 60,
          provider_status: result.provider_status,
          code: result.quota_exhausted ? "quota_exhausted" : "limit_reached",
          limit_type: result.quota_exhausted ? "provider_quota" : "provider_burst",
          quota_exhausted: result.quota_exhausted ?? false,
        }),
        { status: 429, headers: { "Content-Type": "application/json", ...Object.fromEntries(cors) } }
      );
    }

    if (["plan", "concierge", "event_suggest"].includes(task)) {
      const result = await runConciergeLlmChain(tier, user.id, task, contextForLlm, supabase, systemPrompt);
      if (result.statusCode === 429) {
        return concierge429Response(result);
      }
      if (result.message != null || (result.suggestions && result.suggestions.length > 0) || result.no_options_reason) {
        return conciergeSuccessResponse(result);
      }
    }

    const openaiKey = Deno.env.get("OPENAI_API_KEY");

    // Stub for rank/suggest/summarize or when no AI key set (concierge/plan/event_suggest with no key fall through here)
    const result = {
      ranked: candidatesGuarded.slice(0, 5).map((c: Record<string, unknown>, i: number) => ({ ...c, rank: i + 1 })),
      suggestions: [] as unknown[],
      message: "" as string | undefined,
      no_options_reason: ["plan", "concierge", "event_suggest"].includes(task)
        ? "AI is not configured for this environment. Add ANTHROPIC_API_KEY, OPENAI_API_KEY, or GEMINI_API_KEY to enable plans."
        : undefined,
    };
    if (openaiKey && ["rank", "suggest"].includes(task) && candidatesGuarded.length > 0) {
      // Optional: call OpenAI for ranking without tools (same allowlisted context)
      result.ranked = result.ranked;
    }
    return new Response(JSON.stringify(result), {
      headers: { "Content-Type": "application/json", ...Object.fromEntries(cors) },
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error("ai-gateway error:", err);
    return new Response(
      JSON.stringify({ error: "Internal error", detail }),
      { status: 500, headers: { "Content-Type": "application/json", ...Object.fromEntries(corsHeaders(req)) } }
    );
  }
});
