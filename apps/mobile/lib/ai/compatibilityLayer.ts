/**
 * Layer 1 (precomputed) + Layer 2 (cache) — scalable compatibility and AI plan cache.
 * Free: no AI suggestions. Paid: compatibility from DB; AI plans from cache or on-demand.
 */

import { supabase } from "@/lib/supabase";
import type { Mode } from "@/types";

export type CompatibilityRow = {
  compatibility_score: number;
  shared_interest_tags: string[];
  shared_activity_tags: string[];
  budget_overlap: boolean;
  location_proximity_bucket: string | null;
  confidence_score: number;
  updated_at: string;
};

const CACHE_TTL_HOURS = 24;

/**
 * Get precomputed compatibility for a pair (Layer 1). Returns null if not computed.
 */
export async function getCompatibilityScore(
  myUserId: string,
  otherUserId: string,
  mode: Mode
): Promise<CompatibilityRow | null> {
  if (mode === "events") return null;
  const { data, error } = await supabase.rpc("get_compatibility_score", {
    p_user_id: myUserId,
    p_other_user_id: otherUserId,
    p_mode: mode,
  });
  if (error || !data?.length) return null;
  const row = data[0] as CompatibilityRow;
  return row;
}

/**
 * Get cached AI plan if present and not expired (Layer 2 cache). Returns null on miss or expiry.
 */
export async function getCachedAiPlan(
  myUserId: string,
  otherUserId: string,
  mode: Mode,
  ttlHours: number = CACHE_TTL_HOURS
): Promise<{
  title?: string;
  itinerary?: { time?: string; activity: string }[];
  estimated_duration?: string;
  estimated_budget?: string;
  place_type_tags?: string[];
} | null> {
  if (mode === "events") return null;
  const { data, error } = await supabase.rpc("get_cached_ai_plan", {
    p_user_id: myUserId,
    p_other_user_id: otherUserId,
    p_mode: mode,
    p_ttl_hours: ttlHours,
  });
  if (error) return null;
  const plan = data as Record<string, unknown> | null;
  if (!plan || typeof plan !== "object") return null;
  return plan as {
    title?: string;
    itinerary?: { time?: string; activity: string }[];
    estimated_duration?: string;
    estimated_budget?: string;
    place_type_tags?: string[];
  };
}

/**
 * Store AI-generated plan in cache (Layer 2). Call after LLM returns a plan.
 */
export async function setCachedAiPlan(
  myUserId: string,
  otherUserId: string,
  mode: Mode,
  planJson: {
    title?: string;
    itinerary?: { time?: string; activity: string }[];
    estimated_duration?: string;
    estimated_budget?: string;
    place_type_tags?: string[];
    [key: string]: unknown;
  }
): Promise<void> {
  if (mode === "events") return;
  await supabase.rpc("set_cached_ai_plan", {
    p_user_id: myUserId,
    p_other_user_id: otherUserId,
    p_mode: mode,
    p_plan_json: planJson as unknown as Record<string, unknown>,
  });
}

/**
 * Build compressed context for LLM from precomputed compatibility (no full profiles).
 */
export function buildCompressedPromptFromCompatibility(
  compatibility: CompatibilityRow | null,
  options: { city?: string; budgetRange?: string; suggestedTime?: string }
): string {
  const parts: string[] = [];
  if (compatibility) {
    parts.push(`Compatibility score: ${(compatibility.compatibility_score * 100).toFixed(0)}%`);
    if (compatibility.shared_interest_tags?.length)
      parts.push(`Shared interests: ${compatibility.shared_interest_tags.slice(0, 10).join(", ")}`);
    if (compatibility.shared_activity_tags?.length)
      parts.push(`Shared activities: ${compatibility.shared_activity_tags.slice(0, 10).join(", ")}`);
    if (compatibility.budget_overlap) parts.push("Budget overlap: yes");
    if (compatibility.location_proximity_bucket)
      parts.push(`Location: ${compatibility.location_proximity_bucket}`);
  }
  if (options.city) parts.push(`Location: ${options.city}`);
  if (options.budgetRange) parts.push(`Budget range: ${options.budgetRange}`);
  if (options.suggestedTime) parts.push(`Suggested time: ${options.suggestedTime}`);
  return parts.join(". ");
}
