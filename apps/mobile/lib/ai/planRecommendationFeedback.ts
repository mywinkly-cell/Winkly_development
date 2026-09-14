/**
 * Plan recommendation feedback — thumb up/down for AI-suggested plans, and the post-plan
 * review (rating + structured signals + free text) captured once a plan's time has passed.
 * Persists locally, updates ai_requests when linked, and stores on planner_items.meta.
 */

import { supabase } from "@/lib/supabase";
import { reportConciergeOutcome } from "@/lib/ai/conciergeClient";
import { saveConciergeFeedback } from "@/lib/ai/conciergeStorage";
import { recordPairBehaviorSignal } from "@/lib/matching/behaviorSignals";
import type { Mode } from "@/types";

export type PlanRecommendationRating = "up" | "down";

export type SavePlanRecommendationFeedbackParams = {
  rating: PlanRecommendationRating;
  planSummary: string;
  mode: Mode;
  aiRequestId?: string;
  plannerItemId?: string;
};

function ratingToOutcome(rating: PlanRecommendationRating): "went_well" | "not_quite_right" {
  return rating === "up" ? "went_well" : "not_quite_right";
}

/** Save thumb feedback across local history, ai_requests, and planner_items.meta. */
export async function savePlanRecommendationFeedback({
  rating,
  planSummary,
  mode,
  aiRequestId,
  plannerItemId,
}: SavePlanRecommendationFeedbackParams): Promise<void> {
  const outcome = ratingToOutcome(rating);
  await saveConciergeFeedback(planSummary, outcome, mode);

  if (aiRequestId) {
    void reportConciergeOutcome(aiRequestId, outcome);
  }

  if (plannerItemId) {
    const { data: row } = await supabase
      .from("planner_items")
      .select("meta")
      .eq("id", plannerItemId)
      .maybeSingle();

    const prevMeta =
      row?.meta && typeof row.meta === "object" && !Array.isArray(row.meta)
        ? (row.meta as Record<string, unknown>)
        : {};

    await supabase
      .from("planner_items")
      .update({
        meta: {
          ...prevMeta,
          from_concierge: prevMeta.from_concierge ?? true,
          recommendation_feedback: rating,
          recommendation_feedback_at: new Date().toISOString(),
        },
      })
      .eq("id", plannerItemId);
  }
}

// --- Post-plan review: shown once a plan's time has passed, feeds behavior/compatibility recompute ---

export type TimeOfDay = "morning" | "afternoon" | "evening" | "night";

export function timeOfDayFromIso(iso: string | null | undefined): TimeOfDay | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const h = d.getHours();
  if (h < 5) return "night";
  if (h < 12) return "morning";
  if (h < 17) return "afternoon";
  if (h < 21) return "evening";
  return "night";
}

export type PendingPlanReview = {
  plannerItemId: string;
  title: string;
  mode: Mode;
  endsAt: string; // resolved end (or start, when no end) used to judge "has passed"
  activityType: string | null;
  venue: string | null;
  relatedUserId: string | null;
};

type PlannerItemMetaShape = {
  activity?: unknown;
  location?: unknown;
  place?: unknown;
  venue_name?: unknown;
  cancelled_at?: unknown;
  post_plan_review_prompted_at?: unknown;
};

function readMeta(meta: unknown): PlannerItemMetaShape {
  return meta && typeof meta === "object" && !Array.isArray(meta) ? (meta as PlannerItemMetaShape) : {};
}

function metaString(v: unknown): string | null {
  return typeof v === "string" && v.trim().length > 0 ? v : null;
}

/**
 * The current user's most recently completed plan that is eligible for a post-plan review:
 * its time has passed, it wasn't cancelled, and it hasn't already been asked about. Only plans
 * the user is a real participant of (not a still-pending invite) are considered. Returns null
 * when there's nothing to ask about — callers should never nag, so this is meant to be checked
 * lazily (e.g. on Planner tab focus / app foreground), not polled.
 */
export async function getNextPendingPlanReview(now: Date = new Date()): Promise<PendingPlanReview | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.id) return null;

  const { data: participantRows } = await supabase
    .from("planner_participants")
    .select("planner_item_id")
    .eq("user_id", user.id)
    .neq("role", "invitee");

  const itemIds = (participantRows ?? [])
    .map((r: { planner_item_id: string }) => r.planner_item_id)
    .filter(Boolean);
  if (itemIds.length === 0) return null;

  const { data: items } = await supabase
    .from("planner_items")
    .select("id, title, source_mode, starts_at, ends_at, related_user_id, meta")
    .in("id", itemIds)
    .order("starts_at", { ascending: false })
    .limit(50);

  type Row = {
    id: string;
    title: string;
    source_mode: Mode;
    starts_at: string;
    ends_at: string | null;
    related_user_id: string | null;
    meta: unknown;
  };

  const candidates = ((items ?? []) as Row[])
    .map((row) => {
      const meta = readMeta(row.meta);
      const effectiveEnd = row.ends_at ?? row.starts_at;
      return { row, meta, effectiveEnd };
    })
    .filter(({ meta, effectiveEnd }) => {
      if (!effectiveEnd) return false;
      if (new Date(effectiveEnd).getTime() > now.getTime()) return false;
      if (metaString(meta.cancelled_at)) return false;
      if (metaString(meta.post_plan_review_prompted_at)) return false;
      return true;
    })
    .sort((a, b) => new Date(b.effectiveEnd).getTime() - new Date(a.effectiveEnd).getTime());

  const next = candidates[0];
  if (!next) return null;

  return {
    plannerItemId: next.row.id,
    title: next.row.title,
    mode: next.row.source_mode,
    endsAt: next.effectiveEnd,
    activityType: metaString(next.meta.activity),
    venue: metaString(next.meta.location) ?? metaString(next.meta.place) ?? metaString(next.meta.venue_name),
    relatedUserId: next.row.related_user_id,
  };
}

/** Marks a plan as "asked" so it is never prompted for review again, regardless of whether the
 * user submits a rating or dismisses the card — this is what makes the prompt one-shot. */
export async function markPlanReviewPrompted(plannerItemId: string): Promise<void> {
  const { data: row } = await supabase
    .from("planner_items")
    .select("meta")
    .eq("id", plannerItemId)
    .maybeSingle();

  const prevMeta = readMeta(row?.meta) as Record<string, unknown>;
  if (metaString(prevMeta.post_plan_review_prompted_at)) return;

  await supabase
    .from("planner_items")
    .update({ meta: { ...prevMeta, post_plan_review_prompted_at: new Date().toISOString() } })
    .eq("id", plannerItemId);
}

export type PostPlanReviewSignals = {
  venueGood?: boolean | null;
  timingGood?: boolean | null;
  wouldRepeat?: boolean | null;
};

export type SavePostPlanReviewParams = {
  plannerItemId: string;
  mode: Mode;
  rating: number; // 1-5
  signals?: PostPlanReviewSignals;
  note?: string;
  activityType?: string | null;
  venue?: string | null;
  timeOfDay?: TimeOfDay | null;
  relatedUserId?: string | null;
};

/** Persists a post-plan review: which plan, which user, the rating, the structured signals, and
 * the plan's own attributes (activity/venue/time-of-day) so the signal stays learnable — then
 * feeds it into the pair's behavior_affinity (for 1:1 plans) so recompute-behavior-ml and
 * recompute-compatibility pick it up for future suggestions. */
export async function savePostPlanReview(params: SavePostPlanReviewParams): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.id) return;

  await markPlanReviewPrompted(params.plannerItemId);

  const { error } = await supabase.from("plan_reviews").insert({
    planner_item_id: params.plannerItemId,
    user_id: user.id,
    mode: params.mode,
    rating: Math.min(5, Math.max(1, Math.round(params.rating))),
    venue_good: params.signals?.venueGood ?? null,
    timing_good: params.signals?.timingGood ?? null,
    would_repeat: params.signals?.wouldRepeat ?? null,
    note: params.note?.trim() ? params.note.trim() : null,
    activity_type: params.activityType ?? null,
    venue: params.venue ?? null,
    time_of_day: params.timeOfDay ?? null,
    related_user_id: params.relatedUserId ?? null,
  });

  if (error) {
    console.warn("savePostPlanReview:", error.message);
    return;
  }

  const { mode } = params;
  if (params.relatedUserId && (mode === "romance" || mode === "friends" || mode === "business")) {
    void recordPairBehaviorSignal({
      partnerUserId: params.relatedUserId,
      mode,
      kind: "plan_reviewed",
      payload: { rating: params.rating, would_repeat: params.signals?.wouldRepeat ?? null },
    });
  }
}

/** Skip without rating — still marks the plan as asked so it never prompts again. */
export async function dismissPostPlanReview(plannerItemId: string): Promise<void> {
  await markPlanReviewPrompted(plannerItemId);
}
