/**
 * Plan recommendation feedback — thumb up/down for AI-suggested plans.
 * Persists locally, updates ai_requests when linked, and stores on planner_items.meta.
 */

import { supabase } from "@/lib/supabase";
import { reportConciergeOutcome } from "@/lib/ai/conciergeClient";
import { saveConciergeFeedback } from "@/lib/ai/conciergeStorage";
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
