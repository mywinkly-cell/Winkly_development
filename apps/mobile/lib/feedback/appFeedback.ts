/**
 * General app feedback — the always-available "Send feedback" entry (settings + an occasional
 * prompt). Captures a rating and/or free text plus screen/mode context, for product review
 * during the beta. Separate from plan-specific feedback in lib/ai/planRecommendationFeedback.ts.
 */

import Constants from "expo-constants";
import { supabase } from "@/lib/supabase";
import type { Mode } from "@/types";

const APP_VERSION = Constants.expoConfig?.version ?? "1.0.0";

export type SubmitAppFeedbackParams = {
  rating?: number | null; // 1-5, optional
  note?: string;
  screen?: string;
  mode?: Mode;
};

/** Persists general product feedback. Requires at least a rating or a non-empty note. */
export async function submitAppFeedback({ rating, note, screen, mode }: SubmitAppFeedbackParams): Promise<boolean> {
  const trimmedNote = note?.trim() || null;
  if (rating == null && !trimmedNote) return false;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.id) return false;

  const { error } = await supabase.from("app_feedback").insert({
    user_id: user.id,
    rating: rating != null ? Math.min(5, Math.max(1, Math.round(rating))) : null,
    note: trimmedNote,
    screen: screen ?? null,
    mode: mode ?? null,
    app_version: APP_VERSION,
  });

  if (error) {
    console.warn("submitAppFeedback:", error.message);
    return false;
  }
  return true;
}
