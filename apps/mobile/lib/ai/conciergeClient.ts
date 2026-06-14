// ────────────────────────────────────────────────
// Winkly AI Concierge — Client for ai-gateway (plan, concierge, event_suggest, match_agent)
// Uses allowlisted context only; session required.
// ────────────────────────────────────────────────

import { supabase } from "@/lib/supabase";
import { getConciergeDevLimitMockResponse } from "@/lib/ai/conciergeDevLimitMock";
import type { Mode } from "@/types";

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

function aiGatewayHeaders(accessToken: string): Record<string, string> {
  const h: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${accessToken}`,
  };
  if (SUPABASE_ANON_KEY) h.apikey = SUPABASE_ANON_KEY;
  return h;
}
const AI_GATEWAY_TASKS = [
  "plan",
  "concierge",
  "event_suggest",
  "match_agent",
  "super_like_icebreaker",
  // Strategic Host surfaces (2026)
  "chat_topics",
  "planner_theme_plans",
] as const;
export type ConciergeTask = (typeof AI_GATEWAY_TASKS)[number];

export type WinklyPlanOption = {
  option_id: "A" | "B";
  character_label: string;
  title: string;
  why_this_fits: string;
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

export type WinklyPlanResponse = {
  options: [WinklyPlanOption, WinklyPlanOption];
  pending_plan_id: string | null;
  provider: "gemini" | "fallback";
};

export async function callWinklyPlan(params: {
  context: ConciergeContext & { participant_user_ids?: string[] };
}): Promise<WinklyPlanResponse> {
  const { context } = params;
  if (!SUPABASE_URL) throw new Error("Missing Supabase URL");

  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !session?.access_token) throw new Error("Not signed in");

  const url = `${SUPABASE_URL.replace(/\/$/, "")}/functions/v1/ai-gateway`;
  const res = await fetch(url, {
    method: "POST",
    headers: aiGatewayHeaders(session.access_token),
    body: JSON.stringify({
      mode: context.mode,
      task: "winkly_plan",
      context: {
        mode: context.mode,
        city: context.city,
        country: context.country,
        date_from: context.date_from,
        activity_hint: context.activity_hint,
        user_prompt: context.user_prompt,
        budget_amount: context.budget_amount,
        budget_currency: context.budget_currency,
        weather_snapshot: context.weather_snapshot,
        partner_user_id: context.partner_user_id,
        participant_user_ids: context.participant_user_ids,
      },
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((typeof data?.error === "string" ? data.error : undefined) ?? `Request failed: ${res.status}`);
  }
  if (!data?.options || !Array.isArray(data.options) || data.options.length !== 2) throw new Error("No plan options returned");
  return data as WinklyPlanResponse;
}

export type PendingPlanConfirmResponse = {
  pending_plan_id: string;
  all_participants_confirmed: boolean;
  status: string;
  planner_item_id: string | null;
  counts?: { confirmed?: number; participants?: number };
};

export async function confirmPendingPlan(pendingPlanId: string): Promise<PendingPlanConfirmResponse> {
  if (!SUPABASE_URL) throw new Error("Missing Supabase URL");

  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !session?.access_token) throw new Error("Not signed in");

  const url = `${SUPABASE_URL.replace(/\/$/, "")}/functions/v1/pending-plan-confirm`;
  const res = await fetch(url, {
    method: "POST",
    headers: aiGatewayHeaders(session.access_token),
    body: JSON.stringify({ pending_plan_id: pendingPlanId }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((typeof data?.error === "string" ? data.error : undefined) ?? `Request failed: ${res.status}`);
  }
  return data as PendingPlanConfirmResponse;
}

/** Allowlisted context for concierge/plan (no raw chat, no PII beyond what's needed). */
export type ConciergeContext = {
  mode: Mode;
  /** Strategic Host / Planner theme plans: short theme label (e.g. "Custom plan", "Coffee meetup"). */
  theme?: string;
  city?: string;
  country?: string;
  date_from?: string;
  date_to?: string;
  activity_hint?: string;
  budget_tier?: "low" | "mid" | "high";
  /** Optional explicit amount and currency (e.g. 50, "EUR") for the chosen location. */
  budget_amount?: number;
  budget_currency?: string;
  latitude?: number;
  longitude?: number;
  timezone?: string;
  limit_events?: number;
  source_mode?: Mode;
  /** When planning with a partner (e.g. date/meetup), their user id for constraint intersection and DNA alignment. */
  partner_user_id?: string;
  /** Refinement request, e.g. "more chill", "earlier time", "different cuisine". */
  refinement_feedback?: string;
  /** Structured refinement so the model adjusts consistently (e.g. cheaper → lower budget, earlier → earlier times). */
  refinement_structured?: {
    cheaper?: boolean;
    earlier?: boolean;
    more_relaxed?: boolean;
    different_vibe?: boolean;
  };
  /** Previous options (e.g. from last response) for delta logic when refining. */
  previous_options?: unknown[];
  /** Where the user opened the concierge: "planner" | "chats". Drives context-aware behavior. */
  source_screen?: "planner" | "chats";
  /** When source_screen=planner: which tab (all, dates, meetups, business, events). */
  source_planner_tab?: "all" | "dates" | "meetups" | "business" | "events";
  /** Freeform user request (prompt). Combined with activity_hint for the AI. */
  user_prompt?: string;
  /**
   * Single block = what the user would paste into Gemini from the form (topic, place, dates, budget, weather).
   * Authoritative for "Generate plan"; set from planner/chats forms only.
   */
  plan_request_text?: string;
  /** When the user is free: "any" | "morning" | "afternoon" | "evening" | "weekends" | "weekdays" | "when_free" (use available_slots). */
  time_preference?: string;
  /** If time_preference is "when_free", ISO date-time ranges when user is free (from calendar). */
  available_slots?: string[];
  /** Optional client-fetched weather for date/location so AI can adapt without calling get_weather. */
  weather_snapshot?: {
    summary?: string;
    temp_min?: number;
    temp_max?: number;
    temp_at_time?: number;
    forecast_hour?: string;
    precipitation?: number;
    precipitation_day?: number;
    date?: string;
    period_summary?: string;
    rainy_days?: number;
    total_days?: number;
    avg_temp_min?: number;
    avg_temp_max?: number;
  };
  /** Unified Architecture: origin for context-aware AI (e.g. "Planner_Dates", "Chat_1:1_Romance"). */
  origin_context?: string;
  /** Compressed prompt from precomputed compatibility (Layer 1). When set, LLM uses this instead of full profiles. */
  compatibility_context?: string;
  /** Optional client-built merge line; otherwise ai-gateway merges user_concierge_signals + profiles. */
  preference_engine_summary?: string;
  /** Merged calendar white space (ISO slots or short text) for agency scheduling. */
  calendar_white_space?: string;
  /** Match Agent: 1:1 chat thread id (optional) to attach draft proposal. */
  conversation_id?: string;
  /** Match Agent: preferred meet time as ISO (date portion used for weather). */
  target_slot_iso?: string;
  /** Match Agent: search radius in miles (default 5, clamped server-side). */
  search_radius_miles?: number;
  /** Strategic Host: selected meeting date-time (falls back to date_from server-side). */
  selected_date_time?: string;
  /** Planner theme plans: optional forecast text for indoor/outdoor hinting. */
  weather_forecast?: string;
  /** OpenTable/Resy discovery URLs + disclaimer — not confirmed bookings. */
  booking_context?: Record<string, unknown>;
  /**
   * "menu" = three ranked options (default). "decisive" = one primary recommendation + one backup.
   * Omit or "menu" keeps three-option behavior.
   */
  presentation?: "menu" | "decisive";
  /** Winkly Plan / Strategic Host: explicit participants list (includes requester). */
  participant_user_ids?: string[];
  /** planner | chats | mode_context — how USER_REQUEST labels Mode (Planner vs mode-only). */
  planning_entry_surface?: "planner" | "chats" | "mode_context";
  /** User's current/origin location line when captured (e.g. GPS). */
  origin_location_label?: string;
  /** Optional precomputed origin→destination summary (e.g. Maps). */
  travel_from_origin_summary?: string;
  /** Single-day HH:mm local start time when set. */
  exact_time_hm?: string;
  /** Structured copy of sanitized persona line (also inside plan_request_text). */
  sanitized_requester_persona?: string;
  /** Multi-day trips: inclusive day count (gateway switches planner_theme_plans shape when > 1). */
  num_days?: number;
  /** Super Like icebreaker: viewer profile signals (interests, city). */
  self_profile?: { interests?: string[]; city?: string };
  /** Super Like icebreaker: target profile signals (name, interests, city). */
  other_profile?: { name?: string; interests?: string[]; city?: string };
}

/** Context object sent to ai-gateway (must stay in sync with allowlist server-side). */
function serializeConciergeContextForGateway(context: ConciergeContext) {
  return {
    mode: context.mode,
    theme: context.theme,
    participant_user_ids: context.participant_user_ids,
    city: context.city,
    country: context.country,
    date_from: context.date_from,
    date_to: context.date_to,
    activity_hint: context.activity_hint,
    budget_tier: context.budget_tier,
    budget_amount: context.budget_amount,
    budget_currency: context.budget_currency,
    latitude: context.latitude,
    longitude: context.longitude,
    timezone: context.timezone,
    limit_events: context.limit_events,
    source_mode: context.source_mode,
    partner_user_id: context.partner_user_id,
    refinement_feedback: context.refinement_feedback,
    refinement_structured: context.refinement_structured,
    previous_options: context.previous_options,
    source_screen: context.source_screen,
    source_planner_tab: context.source_planner_tab,
    user_prompt: context.user_prompt,
    plan_request_text: context.plan_request_text,
    time_preference: context.time_preference,
    available_slots: context.available_slots,
    weather_snapshot: context.weather_snapshot,
    weather_forecast: context.weather_forecast,
    origin_context: context.origin_context,
    compatibility_context: context.compatibility_context,
    preference_engine_summary: context.preference_engine_summary,
    calendar_white_space: context.calendar_white_space,
    booking_context: context.booking_context,
    presentation: context.presentation,
    conversation_id: context.conversation_id,
    target_slot_iso: context.target_slot_iso,
    search_radius_miles: context.search_radius_miles,
    selected_date_time: context.selected_date_time,
    planning_entry_surface: context.planning_entry_surface,
    origin_location_label: context.origin_location_label,
    travel_from_origin_summary: context.travel_from_origin_summary,
    exact_time_hm: context.exact_time_hm,
    sanitized_requester_persona: context.sanitized_requester_persona,
    num_days: context.num_days,
    self_profile: context.self_profile,
    other_profile: context.other_profile,
  };
}

/** Dev-only: log gateway calls to the Expo/Metro terminal without dumping full prompts in the UI. */
function conciergeContextSummaryForLog(ctx: ConciergeContext): Record<string, unknown> {
  const df = ctx.date_from;
  const dto = ctx.date_to;
  return {
    mode: ctx.mode,
    theme: ctx.theme,
    city: ctx.city,
    country: ctx.country,
    date_from_preview: typeof df === "string" ? df.slice(0, 19) : undefined,
    date_to_preview: typeof dto === "string" ? dto.slice(0, 19) : undefined,
    num_days: ctx.num_days,
    source_screen: ctx.source_screen,
    origin_context: ctx.origin_context,
    has_plan_request_text: !!(ctx.plan_request_text && ctx.plan_request_text.trim()),
    plan_request_chars: typeof ctx.plan_request_text === "string" ? ctx.plan_request_text.length : 0,
    plan_request_preview: (ctx.plan_request_text ?? "").slice(0, 200),
    has_partner_user_id: !!ctx.partner_user_id,
    participant_user_ids_count: Array.isArray(ctx.participant_user_ids) ? ctx.participant_user_ids.length : 0,
    refinement_feedback: ctx.refinement_feedback,
    presentation: ctx.presentation,
    selected_date_time_preview:
      typeof ctx.selected_date_time === "string" ? ctx.selected_date_time.slice(0, 19) : undefined,
    exact_time_hm: ctx.exact_time_hm,
  };
}

function summarizeGatewayJsonForLog(task: ConciergeTask, data: Record<string, unknown>): Record<string, unknown> {
  const planOptions = Array.isArray(data.plan_options) ? data.plan_options : [];
  const optionsAlt = Array.isArray(data.options) ? data.options : [];
  const sug = Array.isArray(data.suggestions) ? data.suggestions : [];
  const topics = Array.isArray(data.suggested_topics) ? data.suggested_topics : [];
  const trimmed: Record<string, unknown> = {
    task,
    keys: Object.keys(data).sort(),
    error: typeof data.error === "string" ? data.error : undefined,
    request_id: typeof data.request_id === "string" ? data.request_id : undefined,
    no_options_reason: typeof data.no_options_reason === "string" ? data.no_options_reason : undefined,
    message_chars: typeof data.message === "string" ? data.message.length : 0,
    suggestions_count: sug.length,
    suggested_topics_count: topics.length,
    plan_options_count: planOptions.length,
    /** e.g. winkly_plan */
    plain_options_count: optionsAlt.length,
    provider: typeof data.provider === "string" ? data.provider : undefined,
    pending_plan_id:
      typeof data.pending_plan_id === "string" || data.pending_plan_id === null
        ? (data.pending_plan_id as string | null)
        : undefined,
  };
  if (planOptions.length) {
    trimmed.plan_summary = planOptions.slice(0, 2).map((o: unknown, i: number) => {
      const row = (o ?? {}) as Record<string, unknown>;
      const venue = (row.venue ?? {}) as Record<string, unknown>;
      const why = row.why_this_fits;
      return {
        i,
        title: typeof row.title === "string" ? row.title.slice(0, 80) : undefined,
        venue_name: typeof venue.name === "string" ? venue.name : undefined,
        why_preview: typeof why === "string" ? why.slice(0, 120) : undefined,
      };
    });
  }
  return trimmed;
}

/** One step in an option's itinerary (detailed format). */
export type ConciergeItineraryStep = {
  time?: string;
  activity?: string;
  concierge_tip?: string;
  [key: string]: unknown;
};

/** Logistics block for an option (parking, weather protection, cost). */
export type ConciergeLogistics = {
  weather_protection?: string;
  parking?: string;
  estimated_cost?: string;
  [key: string]: unknown;
};

/** One "Menu Option" from the AI Concierge (Experience Architect). Supports minimal and detailed shapes. */
export type ExperienceOption = {
  option_id?: string;
  option_name?: string;
  narrative?: string;
  logic_bridge?: string;
  why_this_fits?: string;
  /** Detailed: ordered steps with time, activity, concierge_tip. */
  itinerary?: ConciergeItineraryStep[];
  schedule?: string[];
  logistics?: ConciergeLogistics;
  business_link?: string;
  weather_note?: string;
  price_indicator?: string;
  [key: string]: unknown;
};

/** Error classification for UI (retry, rate limit messaging, offline). */
export type ConciergeErrorCode =
  | "network"
  | "rate_limit"
  | "daily_quota"
  | "tier_required"
  | "unknown";

export type ConciergeLimitType = "burst" | "daily_quota" | "provider_burst" | "provider_quota";

/** Seconds until next UTC midnight (for daily quota retry hints). */
export function secondsUntilUtcMidnight(): number {
  const now = Date.now();
  const next = Date.UTC(
    new Date().getUTCFullYear(),
    new Date().getUTCMonth(),
    new Date().getUTCDate() + 1,
  );
  return Math.max(60, Math.ceil((next - now) / 1000));
}

function mapGatewayErrorResponse(
  data: Record<string, unknown>,
  status: number,
): Pick<ConciergeResponse, "error" | "error_code" | "retry_after" | "limit_type" | "upgrade_to"> {
  const code = typeof data.code === "string" ? data.code : undefined;
  const limitType =
    typeof data.limit_type === "string" ? (data.limit_type as ConciergeLimitType) : undefined;
  const retryAfter =
    typeof data.retry_after === "number"
      ? data.retry_after
      : limitType === "daily_quota"
        ? secondsUntilUtcMidnight()
        : undefined;
  const upgradeTo =
    data.upgrade_to === "super" || data.upgrade_to === "premium" ? data.upgrade_to : undefined;

  if (
    code === "limit_reached" ||
    code === "rate_limited" ||
    code === "quota_exhausted" ||
    status === 429
  ) {
    if (limitType === "daily_quota" || code === "ai_free_quota_exhausted") {
      return {
        error: undefined,
        error_code: "daily_quota",
        retry_after: retryAfter,
        limit_type: "daily_quota",
        upgrade_to: upgradeTo ?? "super",
      };
    }
    return {
      error: undefined,
      error_code: "rate_limit",
      retry_after: retryAfter ?? 60,
      limit_type: limitType ?? "burst",
    };
  }

  if (code === "ai_tier_required" || code === "ai_disabled_for_tier") {
    return {
      error: undefined,
      error_code: "tier_required",
      upgrade_to: upgradeTo ?? "super",
    };
  }

  const baseError =
    (typeof data.error === "string" ? data.error : undefined) ??
    (status === 429 ? "Request limit reached." : `Request failed: ${status}`);
  return { error: baseError, error_code: "unknown", retry_after: retryAfter };
}

/** Coerce gateway JSON options to typed suggestions (validated at runtime by UI). */
function coerceSuggestions(raw: unknown[] | undefined): ExperienceOption[] | undefined {
  if (!raw?.length) return undefined;
  return raw as ExperienceOption[];
}

export type ConciergeResponse = {
  message: string;
  /** When task is concierge/plan, parsed options (3 for menu, 2 for decisive). */
  suggestions?: ExperienceOption[];
  ranked?: (Record<string, unknown> & { rank?: number })[];
  error?: string;
  /** Strategic Host (2026): chat topics. */
  suggested_topics?: unknown[];
  /** Strategic Host (2026): planner theme plans. */
  plan_options?: unknown[];
  /** When set, UI can show Retry and friendly message (e.g. "Check connection", "Wait a moment"). */
  error_code?: ConciergeErrorCode;
  /** Gateway limit bucket when `error_code` is rate_limit or daily_quota. */
  limit_type?: ConciergeLimitType;
  /** Suggested upgrade tier for quota/tier upsell cards. */
  upgrade_to?: "super" | "premium";
  /** Seconds after which to retry (e.g. 60 for "Try after 1 minute"). */
  retry_after?: number;
  /** When message is set but suggestions empty: short reason to show in empty state. */
  no_options_reason?: string;
  /** Real-Time Advisory: hint shown as user fills form. */
  concierge_note?: string;
  /** For A/B: report outcome (add-to-planner, feedback) with this id. */
  request_id?: string;
  /** When task is match_agent: draft venue message, chain, proposal id, privacy hints. */
  match_agent?: {
    agent_message?: string;
    draft?: Record<string, unknown>;
    chain?: Record<string, unknown>;
    proposal_id?: string | null;
    request_id?: string | null;
    privacy?: {
      draft_state?: boolean;
      double_opt_in?: string;
      no_exact_home_addresses?: boolean;
    };
  };
  /** Super Like icebreaker (Romance swipe deck). */
  super_like_icebreaker?: { opener?: string };
};

function pickMatchAgentFromResponse(data: { match_agent?: unknown }): ConciergeResponse["match_agent"] {
  const ma = data.match_agent;
  return ma && typeof ma === "object" ? (ma as NonNullable<ConciergeResponse["match_agent"]>) : undefined;
}

const OPTIONS_CACHE_TTL_MS = 5 * 60 * 1000; // 5 min
const optionsCache = new Map<string, { data: ConciergeResponse; ts: number }>();

function optionsCacheKey(ctx: ConciergeContext): string | null {
  if (ctx.refinement_feedback || (ctx.previous_options?.length ?? 0) > 0) return null;
  const parts = [
    ctx.city ?? "",
    ctx.date_from ?? "",
    ctx.date_to ?? "",
    ctx.mode ?? "",
    (ctx.plan_request_text ?? "").slice(0, 120),
    (ctx.activity_hint ?? "").slice(0, 80),
    (ctx.user_prompt ?? "").slice(0, 80),
    ctx.presentation ?? "",
    String(ctx.num_days ?? ""),
  ];
  return "opt:" + parts.join("|");
}

/**
 * Call the ai-gateway for planning/concierge/event suggestions.
 * Requires valid session. Context is allowlisted on the server.
 */
export async function callConcierge(params: {
  task: ConciergeTask;
  context: ConciergeContext;
}): Promise<ConciergeResponse> {
  const { task, context } = params;
  const logPrefix = "[ai-gateway]";
  if (!SUPABASE_URL) {
    if (__DEV__) console.warn(logPrefix, "callConcierge aborted: missing EXPO_PUBLIC_SUPABASE_URL", { task });
    return { message: "", error: "Missing Supabase URL" };
  }
  if (!AI_GATEWAY_TASKS.includes(task)) {
    if (__DEV__) console.warn(logPrefix, "callConcierge aborted: invalid task", { task });
    return { message: "", error: "Invalid task" };
  }

  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !session?.access_token) {
    if (__DEV__) console.warn(logPrefix, "callConcierge aborted: no session", { task });
    return { message: "", error: "Not signed in" };
  }

  const devLimitMock = getConciergeDevLimitMockResponse();
  if (devLimitMock) {
    if (__DEV__) {
      console.log(logPrefix, `← ${task} (dev limit mock)`, {
        error_code: devLimitMock.error_code,
        limit_type: devLimitMock.limit_type,
      });
    }
    return devLimitMock;
  }

  const cacheKey = optionsCacheKey(context);
  if (cacheKey) {
    const entry = optionsCache.get(cacheKey);
    if (entry && Date.now() - entry.ts < OPTIONS_CACHE_TTL_MS) {
      if (__DEV__) {
        console.log(logPrefix, `← ${task} (cache hit)`, {
          cacheKeySnippet: cacheKey.slice(0, 80),
          plan_options: entry.data.plan_options?.length ?? 0,
          suggestions: entry.data.suggestions?.length ?? 0,
          error: entry.data.error ?? null,
        });
      }
      return entry.data;
    }
  }

  if (__DEV__) {
    console.log(logPrefix, `→ ${task}`, conciergeContextSummaryForLog(context));
  }

  const url = `${SUPABASE_URL.replace(/\/$/, "")}/functions/v1/ai-gateway`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: aiGatewayHeaders(session.access_token),
      body: JSON.stringify({
        mode: context.mode,
        task,
        context: serializeConciergeContextForGateway(context),
      }),
    });
  } catch (e) {
    const isNetwork = e instanceof TypeError && (e.message === "Failed to fetch" || (e as Error).message?.includes("network"));
    if (__DEV__) {
      console.warn(logPrefix, `✗ ${task} fetch threw`, {
        isNetwork,
        message: e instanceof Error ? e.message : String(e),
      });
    }
    return {
      message: "",
      error: "Check connection and try again.",
      error_code: isNetwork ? "network" : "unknown",
    };
  }

  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (__DEV__) {
    const summary = summarizeGatewayJsonForLog(task, data);
    if (res.ok) {
      console.log(logPrefix, `← ${task} HTTP ${res.status}`, summary);
    } else {
      const detail =
        typeof data?.detail === "string"
          ? data.detail
          : typeof data?.message === "string"
            ? data.message
            : undefined;
      console.error(logPrefix, `✗ ${task} HTTP ${res.status}`, {
        ...summary,
        detail,
        code: typeof data?.code === "string" ? data.code : undefined,
        required_tier: typeof data?.required_tier === "string" ? data.required_tier : undefined,
        body: data,
      });
    }
  }
  if (!res.ok) {
    const mapped = mapGatewayErrorResponse(data, res.status);
    if (mapped.error_code && mapped.error_code !== "unknown") {
      return { message: "", ...mapped };
    }
    const detail = typeof data?.detail === "string" ? data.detail.trim() : "";
    const error =
      __DEV__ && detail && mapped.error === "Internal error"
        ? `${mapped.error}: ${detail}`
        : mapped.error ?? `Request failed: ${res.status}`;
    return {
      message: "",
      error,
      error_code: mapped.error_code ?? "unknown",
      retry_after: mapped.retry_after,
    };
  }
  const response: ConciergeResponse = {
    message: typeof data.message === "string" ? data.message : "",
    suggestions: coerceSuggestions(Array.isArray(data.suggestions) ? data.suggestions : undefined),
    ranked: Array.isArray(data.ranked) ? (data.ranked as ConciergeResponse["ranked"]) : undefined,
    suggested_topics: Array.isArray(data.suggested_topics) ? data.suggested_topics : undefined,
    plan_options: Array.isArray(data.plan_options) ? data.plan_options : undefined,
    no_options_reason: typeof data.no_options_reason === "string" ? data.no_options_reason : undefined,
    concierge_note: typeof data.concierge_note === "string" ? data.concierge_note : undefined,
    request_id: typeof data.request_id === "string" ? data.request_id : undefined,
    match_agent: pickMatchAgentFromResponse(data),
    super_like_icebreaker:
      data.super_like_icebreaker && typeof data.super_like_icebreaker === "object"
        ? (data.super_like_icebreaker as NonNullable<ConciergeResponse["super_like_icebreaker"]>)
        : undefined,
  };
  if (cacheKey && !response.error && response.suggestions?.length) {
    optionsCache.set(cacheKey, { data: response, ts: Date.now() });
  }
  return response;
}

/** Stream concierge response: onDelta(content) called as message chunks arrive, then onDone(fullResponse). Uses cache when available (chunked so message still appears progressively). */
export async function callConciergeStream(
  params: {
    task: ConciergeTask;
    context: ConciergeContext;
    onDelta: (content: string) => void;
    onDone: (res: ConciergeResponse) => void;
  }
): Promise<void> {
  const { task, context, onDelta, onDone } = params;
  if (!SUPABASE_URL) {
    onDone({ message: "", error: "Missing Supabase URL" });
    return;
  }
  const cacheKey = optionsCacheKey(context);
  if (cacheKey) {
    const entry = optionsCache.get(cacheKey);
    if (entry && Date.now() - entry.ts < OPTIONS_CACHE_TTL_MS && entry.data.message && !entry.data.error) {
      const msg = entry.data.message;
      const chunkSize = 40;
      for (let i = 0; i < msg.length; i += chunkSize) {
        onDelta(msg.slice(i, i + chunkSize));
        await new Promise((r) => setTimeout(r, 20));
      }
      onDone(entry.data);
      return;
    }
  }
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !session?.access_token) {
    onDone({ message: "", error: "Not signed in" });
    return;
  }
  const devLimitMock = getConciergeDevLimitMockResponse();
  if (devLimitMock) {
    if (__DEV__) {
      console.log("[ai-gateway]", `← ${task} (stream, dev limit mock)`, {
        error_code: devLimitMock.error_code,
      });
    }
    onDone(devLimitMock);
    return;
  }
  const url = `${SUPABASE_URL.replace(/\/$/, "")}/functions/v1/ai-gateway`;
  let res: Response;
  if (__DEV__) {
    console.log("[ai-gateway]", `→ ${task} (stream)`, conciergeContextSummaryForLog(context));
  }
  try {
    res = await fetch(url, {
      method: "POST",
      headers: aiGatewayHeaders(session.access_token),
      body: JSON.stringify({
        mode: context.mode,
        task,
        stream: true,
        context: serializeConciergeContextForGateway(context),
      }),
    });
  } catch {
    onDone({
      message: "",
      error: "Check connection and try again.",
      error_code: "network",
    });
    return;
  }
  if (!res.ok) {
    let rawText = "";
    let parsedBody: Record<string, unknown> = {};
    try {
      rawText = await res.text();
      if (rawText.trim()) parsedBody = JSON.parse(rawText) as Record<string, unknown>;
    } catch {
      parsedBody = {};
    }
    if (__DEV__) {
      console.warn(
        "[ai-gateway]",
        `← ${task} (stream) HTTP ${res.status}`,
        Object.keys(parsedBody).length
          ? summarizeGatewayJsonForLog(task, parsedBody)
          : { rawSnippet: rawText.slice(0, 400) }
      );
    }
    const mapped = mapGatewayErrorResponse(parsedBody, res.status);
    if (mapped.error_code && mapped.error_code !== "unknown") {
      onDone({ message: "", ...mapped });
      return;
    }
    onDone({
      message: "",
      error:
        (typeof parsedBody.error === "string" ? parsedBody.error : undefined) ?? `Request failed: ${res.status}`,
      error_code: mapped.error_code ?? "unknown",
      retry_after: mapped.retry_after,
    });
    return;
  }
  // If no body stream (e.g. some RN environments), treat as JSON response
  if (!res.body) {
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (__DEV__) {
      console.log("[ai-gateway]", `← ${task} (stream) no body; JSON`, summarizeGatewayJsonForLog(task, data));
    }
    const list = Array.isArray(data.suggestions)
      ? data.suggestions
      : Array.isArray(data.options)
        ? data.options
        : undefined;
    onDone({
      message: typeof data.message === "string" ? data.message : "",
      suggestions: coerceSuggestions(list),
      no_options_reason: typeof data.no_options_reason === "string" ? data.no_options_reason : undefined,
      request_id: typeof data.request_id === "string" ? data.request_id : undefined,
      error: typeof data.error === "string" ? data.error : undefined,
      match_agent: pickMatchAgentFromResponse(data),
    });
    return;
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buffer = "";
  let streamSettled = false;
  const STREAM_TIMEOUT_MS = 90_000;
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const finishStream = (res: ConciergeResponse) => {
    if (streamSettled) return;
    streamSettled = true;
    if (timeoutId !== undefined) clearTimeout(timeoutId);
    onDone(res);
  };
  timeoutId = setTimeout(() => {
    finishStream({ message: "", error: "Request timed out. Try again." });
  }, STREAM_TIMEOUT_MS);
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += dec.decode(value, { stream: true });
      // SSE events are separated by double newline; parse full events so we don't miss "done" when chunked
      const events = buffer.split("\n\n");
      buffer = events.pop() ?? "";
      for (const event of events) {
        const line = event.trim();
        if (!line.startsWith("data: ")) continue;
        try {
          const payload = JSON.parse(line.slice(6).trim()) as { type?: string; content?: string; message?: string; suggestions?: unknown[]; no_options_reason?: string; request_id?: string; error?: string; match_agent?: unknown };
          if (payload.type === "delta" && typeof payload.content === "string") onDelta(payload.content);
          if (payload.type === "done") {
            const full: ConciergeResponse = {
              message: payload.message ?? "",
              suggestions: coerceSuggestions(payload.suggestions),
              no_options_reason: payload.no_options_reason,
              request_id: payload.request_id,
              match_agent: pickMatchAgentFromResponse(payload),
            };
            const key = optionsCacheKey(context);
            if (key && full.message && !full.error && (full.suggestions?.length ?? 0) > 0)
              optionsCache.set(key, { ts: Date.now(), data: full });
            finishStream(full);
            return;
          }
        } catch {
          // skip malformed event
        }
      }
    }
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
    reader.releaseLock();
  }
  if (streamSettled) return;
  // Stream ended: process any remaining buffer (last SSE event without trailing \n\n, or raw JSON response)
  const trimmed = buffer.trim();
  if (trimmed) {
    // 1) Try as SSE line (e.g. "data: {"type":"done",...}")
    if (trimmed.startsWith("data: ")) {
      try {
        const payload = JSON.parse(trimmed.slice(6).trim()) as { type?: string; content?: string; message?: string; suggestions?: unknown[]; no_options_reason?: string; request_id?: string; error?: string; match_agent?: unknown };
        if (payload.type === "done") {
          finishStream({
            message: payload.message ?? "",
            suggestions: coerceSuggestions(payload.suggestions),
            no_options_reason: payload.no_options_reason,
            request_id: payload.request_id,
            error: payload.error,
            match_agent: pickMatchAgentFromResponse(payload),
          });
          return;
        }
      } catch {
        // fall through to JSON parse
      }
    }
    // 2) Try as raw JSON (non-stream 200 response); backend may send "suggestions" or "options"
    try {
      const json = trimmed.startsWith("{")
        ? (JSON.parse(trimmed) as { message?: string; suggestions?: unknown[]; options?: unknown[]; no_options_reason?: string; request_id?: string; error?: string; match_agent?: unknown })
        : null;
      if (json && (typeof json.message === "string" || json.error != null || Array.isArray(json.suggestions) || Array.isArray(json.options) || json.match_agent != null)) {
        const list = Array.isArray(json.suggestions) ? json.suggestions : Array.isArray(json.options) ? json.options : undefined;
        finishStream({
          message: json.message ?? "",
          suggestions: coerceSuggestions(list),
          no_options_reason: json.no_options_reason,
          request_id: json.request_id,
          error: json.error,
          match_agent: pickMatchAgentFromResponse(json),
        });
        return;
      }
    } catch {
      // not JSON
    }
  }
  if (__DEV__ && trimmed) {
    console.warn("[conciergeClient] ai-gateway stream ended without parseable done; buffer preview:", trimmed.slice(0, 400));
  }
  finishStream({ message: "", suggestions: undefined, error: "Response ended unexpectedly. Try again." });
}

/** Report outcome for A/B (add-to-planner rate, satisfaction). Call when user adds to planner or submits feedback. */
export async function reportConciergeOutcome(
  requestId: string | undefined,
  outcome: "added_to_planner" | "went_well" | "didnt_use" | "not_quite_right"
): Promise<void> {
  if (!requestId) return;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.id) return;
  const now = new Date().toISOString();
  const payload = outcome === "added_to_planner"
    ? { outcome: "added_to_planner", outcome_at: now }
    : { outcome_satisfaction: outcome, outcome_at: now };
  await supabase.from("ai_requests").update(payload).eq("id", requestId).eq("user_id", user.id);
}

/** Build origin_context for Unified Architecture (Planner_*, Chat_1:1_*, Chat_Group_*). */
export function buildOriginContext(params: {
  source_screen: "planner" | "chats";
  mode: Mode;
  source_planner_tab?: "all" | "dates" | "meetups" | "business" | "events";
  hasPartner?: boolean;
}): string {
  const { source_screen, mode, source_planner_tab, hasPartner } = params;
  if (source_screen === "planner") {
    const tab = source_planner_tab && source_planner_tab !== "all" ? source_planner_tab : "Generic";
    const tabLabel = tab === "dates" ? "Romance" : tab === "meetups" ? "Friends" : tab === "business" ? "Business" : tab === "events" ? "Events" : "All";
    return `Planner_${tabLabel}`;
  }
  return hasPartner ? `Chat_1:1_${mode.charAt(0).toUpperCase() + mode.slice(1)}` : `Chat_${mode.charAt(0).toUpperCase() + mode.slice(1)}`;
}
