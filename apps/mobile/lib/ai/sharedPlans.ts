// apps/mobile/lib/ai/sharedPlans.ts
// Reusable plans: record what a user actually ran, rate it afterwards, and offer
// highly-rated ones to the next person planning something similar.
//
// Lifecycle
//   1. User confirms a plan into the planner        → recordPlanSkeleton()  (visibility: private)
//   2. The plan's end time passes                    → listPlansAwaitingRating()
//   3. User rates 1–5 (+ optional comment)           → ratePlan()
//   4. User optionally publishes it                  → setPlanVisibility("community")
//   5. Another user planning the same city/theme     → getTopCommunityPlans()
//
// Requires migration 20260726120000_wishlist_places_and_shared_plans.sql.

import { supabase } from "@/lib/supabase";
import type { AppMode } from "@/types/database";

export type PlanVisibility = "private" | "community";
export type PlanAuthorDisplay = "anonymous" | "first_name" | "handle";

/** A plan skeleton: venue sequence, timing and logic — not a copy of someone's day. */
export type SharedPlan = {
  id: string;
  authorId?: string;
  title: string;
  summary?: string;
  theme?: string;
  city?: string;
  country?: string;
  mode: AppMode;
  numDays: number;
  planJson: Record<string, unknown>;
  visibility: PlanVisibility;
  authorDisplay: PlanAuthorDisplay;
  authorHandle?: string;
  ratingAvg: number;
  ratingCount: number;
  reuseCount: number;
  sourcePlannerItemId?: string;
  createdAt: string;
};

export type PlanRating = {
  id: string;
  sharedPlanId: string;
  userId: string;
  stars: number;
  comment?: string;
  wasAdjusted: boolean;
  createdAt: string;
};

const PLAN_COLUMNS =
  "id, author_id, title, summary, theme, city, country, mode, num_days, plan_json, " +
  "visibility, author_display, author_handle, rating_avg, rating_count, reuse_count, " +
  "source_planner_item_id, created_at";

type SharedPlanRow = {
  id: string;
  author_id: string | null;
  title: string;
  summary: string | null;
  theme: string | null;
  city: string | null;
  country: string | null;
  mode: AppMode;
  num_days: number;
  plan_json: Record<string, unknown> | null;
  visibility: PlanVisibility;
  author_display: PlanAuthorDisplay;
  author_handle: string | null;
  rating_avg: number | string | null;
  rating_count: number | null;
  reuse_count: number | null;
  source_planner_item_id: string | null;
  created_at: string;
};

function mapPlan(row: SharedPlanRow): SharedPlan {
  return {
    id: row.id,
    authorId: row.author_id ?? undefined,
    title: row.title,
    summary: row.summary ?? undefined,
    theme: row.theme ?? undefined,
    city: row.city ?? undefined,
    country: row.country ?? undefined,
    mode: row.mode,
    numDays: Number(row.num_days ?? 1),
    planJson: row.plan_json ?? {},
    visibility: row.visibility,
    authorDisplay: row.author_display,
    authorHandle: row.author_handle ?? undefined,
    ratingAvg: Number(row.rating_avg ?? 0),
    ratingCount: Number(row.rating_count ?? 0),
    reuseCount: Number(row.reuse_count ?? 0),
    sourcePlannerItemId: row.source_planner_item_id ?? undefined,
    createdAt: row.created_at,
  };
}

async function requireUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  const uid = data?.user?.id;
  if (!uid) throw new Error("Sign in to use plans.");
  return uid;
}

/**
 * Strip a generated plan down to a reusable skeleton.
 *
 * A plan is intensely contextual — who was there, the weather that day, the
 * budget, where everyone started from. Storing all of it would both leak the
 * author's movements and produce bad reuse. Keep the shape (sequence, venues,
 * timing) and let the next user's specifics be regenerated around it.
 */
export function toPlanSkeleton(planOption: Record<string, unknown>): Record<string, unknown> {
  const venue = (planOption.venue ?? {}) as Record<string, unknown>;
  const itinerary = Array.isArray(planOption.itinerary) ? planOption.itinerary : [];

  return {
    title: typeof planOption.title === "string" ? planOption.title : "",
    duration_minutes:
      typeof planOption.duration_minutes === "number" ? planOption.duration_minutes : undefined,
    venue: {
      // Deliberately no google_maps_link or exact cost — those are re-resolved
      // per requester so a stale link never gets handed on.
      name: typeof venue.name === "string" ? venue.name : "",
      place_id: typeof venue.place_id === "string" ? venue.place_id : undefined,
      address: typeof venue.address === "string" ? venue.address : undefined,
    },
    itinerary: itinerary.slice(0, 24).map((step) => {
      const s = (step ?? {}) as Record<string, unknown>;
      return {
        time: typeof s.time === "string" ? s.time : undefined,
        description:
          typeof s.description === "string"
            ? s.description
            : typeof s.activity === "string"
              ? s.activity
              : undefined,
        concierge_tip: typeof s.concierge_tip === "string" ? s.concierge_tip : undefined,
      };
    }),
    trip_days: Array.isArray(planOption.trip_days) ? planOption.trip_days : undefined,
  };
}

/**
 * Record the plan a user just committed to, so it can be rated once it happens.
 * Private by default — nothing is shared until the author explicitly publishes.
 */
export async function recordPlanSkeleton(input: {
  title: string;
  summary?: string;
  mode: AppMode;
  theme?: string;
  city?: string;
  country?: string;
  numDays?: number;
  planOption: Record<string, unknown>;
  plannerItemId?: string;
  pendingPlanId?: string;
  language?: string;
}): Promise<SharedPlan> {
  const uid = await requireUserId();
  const { data, error } = await supabase
    .from("shared_plans")
    .insert({
      author_id: uid,
      title: input.title.trim().slice(0, 200),
      summary: input.summary?.trim() || null,
      mode: input.mode,
      theme: input.theme?.trim() || null,
      city: input.city?.trim() || null,
      country: input.country?.trim() || null,
      num_days: Math.max(1, Math.min(30, input.numDays ?? 1)),
      plan_json: toPlanSkeleton(input.planOption),
      source_planner_item_id: input.plannerItemId ?? null,
      source_pending_plan_id: input.pendingPlanId ?? null,
      language: input.language ?? null,
      visibility: "private",
    })
    .select(PLAN_COLUMNS)
    .single();

  if (error) throw error;
  return mapPlan(data as unknown as SharedPlanRow);
}

/** Rate a plan after it happened. Re-rating updates in place (unique per user). */
export async function ratePlan(input: {
  sharedPlanId: string;
  stars: number;
  comment?: string;
  wasAdjusted?: boolean;
  plannerItemId?: string;
}): Promise<void> {
  const uid = await requireUserId();
  const stars = Math.max(1, Math.min(5, Math.round(input.stars)));

  const { error } = await supabase.from("plan_ratings").upsert(
    {
      shared_plan_id: input.sharedPlanId,
      user_id: uid,
      stars,
      comment: input.comment?.trim() || null,
      was_adjusted: input.wasAdjusted ?? false,
      planner_item_id: input.plannerItemId ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "shared_plan_id,user_id" }
  );

  if (error) throw error;
}

export async function getMyRating(sharedPlanId: string): Promise<PlanRating | null> {
  const uid = await requireUserId();
  const { data, error } = await supabase
    .from("plan_ratings")
    .select("id, shared_plan_id, user_id, stars, comment, was_adjusted, created_at")
    .eq("shared_plan_id", sharedPlanId)
    .eq("user_id", uid)
    .maybeSingle();

  if (error || !data) return null;
  const r = data as Record<string, unknown>;
  return {
    id: String(r.id),
    sharedPlanId: String(r.shared_plan_id),
    userId: String(r.user_id),
    stars: Number(r.stars),
    comment: (r.comment as string | null) ?? undefined,
    wasAdjusted: Boolean(r.was_adjusted),
    createdAt: String(r.created_at),
  };
}

/** Reviews shown under a community plan. RLS limits these to visible plans. */
export async function listPlanRatings(sharedPlanId: string, limit = 20): Promise<PlanRating[]> {
  const { data, error } = await supabase
    .from("plan_ratings")
    .select("id, shared_plan_id, user_id, stars, comment, was_adjusted, created_at")
    .eq("shared_plan_id", sharedPlanId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error || !Array.isArray(data)) return [];
  return data.map((row) => {
    const r = row as Record<string, unknown>;
    return {
      id: String(r.id),
      sharedPlanId: String(r.shared_plan_id),
      userId: String(r.user_id),
      stars: Number(r.stars),
      comment: (r.comment as string | null) ?? undefined,
      wasAdjusted: Boolean(r.was_adjusted),
      createdAt: String(r.created_at),
    };
  });
}

/**
 * Plans of mine that have already happened and that I haven't rated yet.
 *
 * Done as three small queries rather than a PostgREST embed: the embed syntax
 * depends on the FK constraint name, which is brittle across environments.
 */
export async function listPlansAwaitingRating(limit = 5): Promise<SharedPlan[]> {
  const uid = await requireUserId();

  const { data: plans, error } = await supabase
    .from("shared_plans")
    .select(PLAN_COLUMNS)
    .eq("author_id", uid)
    .not("source_planner_item_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error || !Array.isArray(plans) || plans.length === 0) return [];
  const mapped = (plans as unknown as SharedPlanRow[]).map(mapPlan);

  const { data: rated } = await supabase
    .from("plan_ratings")
    .select("shared_plan_id")
    .eq("user_id", uid);
  const ratedIds = new Set(
    (Array.isArray(rated) ? rated : []).map((r) => String((r as Record<string, unknown>).shared_plan_id))
  );

  const candidates = mapped.filter((p) => !ratedIds.has(p.id) && p.sourcePlannerItemId);
  if (candidates.length === 0) return [];

  // Only prompt once the plan is actually over — asking beforehand trains people
  // to dismiss the prompt.
  const { data: items } = await supabase
    .from("planner_items")
    .select("id, starts_at, ends_at")
    .in("id", candidates.map((p) => p.sourcePlannerItemId as string));

  const now = Date.now();
  const finished = new Set(
    (Array.isArray(items) ? items : [])
      .filter((row) => {
        const r = row as { starts_at?: string; ends_at?: string | null };
        const end = r.ends_at ? Date.parse(r.ends_at) : r.starts_at ? Date.parse(r.starts_at) : NaN;
        return Number.isFinite(end) && end < now;
      })
      .map((row) => String((row as { id: string }).id))
  );

  return candidates.filter((p) => finished.has(p.sourcePlannerItemId as string)).slice(0, limit);
}

/** Publish or un-publish. Community plans become eligible for reuse by others. */
export async function setPlanVisibility(
  sharedPlanId: string,
  visibility: PlanVisibility,
  attribution?: { display: PlanAuthorDisplay; handle?: string }
): Promise<boolean> {
  const uid = await requireUserId();
  const patch: Record<string, unknown> = { visibility };
  if (attribution) {
    patch.author_display = attribution.display;
    patch.author_handle =
      attribution.display === "handle" ? attribution.handle?.trim().replace(/^@/, "") || null : null;
  }

  const { error } = await supabase
    .from("shared_plans")
    .update(patch)
    .eq("id", sharedPlanId)
    .eq("author_id", uid);

  return !error;
}

export type CommunityPlan = SharedPlan & { authorLabel: string };

function authorLabel(row: {
  author_display?: PlanAuthorDisplay;
  author_handle?: string | null;
}): string {
  if (row.author_display === "handle" && row.author_handle) return `@${row.author_handle}`;
  if (row.author_display === "first_name") return "A Winkly member";
  return "Anonymous";
}

/**
 * Top-rated community plans for a city + mode, via the top_community_plans RPC.
 * SECURITY INVOKER, so RLS still decides what the caller can see.
 */
export async function getTopCommunityPlans(params: {
  city?: string;
  mode: AppMode;
  theme?: string;
  numDays?: number;
  limit?: number;
}): Promise<CommunityPlan[]> {
  const { data, error } = await supabase.rpc("top_community_plans", {
    p_city: params.city ?? null,
    p_mode: params.mode,
    p_theme: params.theme ?? null,
    p_num_days: params.numDays ?? 1,
    p_limit: params.limit ?? 3,
  });

  if (error || !Array.isArray(data)) return [];
  return data.map((row) => {
    const r = row as Record<string, unknown>;
    return {
      ...mapPlan({
        ...(r as unknown as SharedPlanRow),
        author_id: null,
        country: null,
        visibility: "community",
        source_planner_item_id: null,
        created_at: new Date().toISOString(),
      }),
      authorLabel: authorLabel({
        author_display: r.author_display as PlanAuthorDisplay,
        author_handle: r.author_handle as string | null,
      }),
    };
  });
}

/** Count an accepted reuse, so genuinely useful plans surface above novelties. */
export async function incrementPlanReuse(sharedPlanId: string): Promise<void> {
  await supabase.rpc("increment_shared_plan_reuse", { p_plan_id: sharedPlanId }).then(
    () => undefined,
    () => undefined
  );
}
