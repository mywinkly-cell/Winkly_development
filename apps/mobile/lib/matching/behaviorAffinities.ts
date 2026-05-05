import { supabase } from "@/lib/supabase";
import type { Mode } from "@/types";

/** Returns map other_user_id → affinity in [0,1] from DM behavior signals (server RPC). */
export async function fetchBehaviorAffinityMap(
  userId: string,
  candidateIds: string[],
  mode: Mode
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (candidateIds.length === 0) return map;
  const { data, error } = await supabase.rpc("get_behavior_affinities", {
    p_user_id: userId,
    p_candidate_ids: candidateIds,
    p_mode: mode,
  });
  if (error) {
    console.warn("get_behavior_affinities", error);
    return map;
  }
  for (const row of data ?? []) {
    const r = row as { other_user_id: string; affinity: number };
    if (r.other_user_id) map.set(r.other_user_id, Number(r.affinity) ?? 0.5);
  }
  return map;
}

/** Blend client compatibility (0–100) with behavior affinity (0–1) for AI matching sort. */
export function combinedMatchScore(compatibility0to100: number, behaviorAffinity0to1: number): number {
  const c = Math.max(0, Math.min(100, compatibility0to100)) / 100;
  const b = Math.max(0, Math.min(1, behaviorAffinity0to1));
  return c * 0.65 + b * 0.35;
}
