// lib/access/planner.ts — Mode-filtered planner items

import { supabase } from "@/lib/supabase";
import type { Mode } from "@/types";

type PlannerSource = "romance" | "friends" | "business" | "events";

/** Get planner items for user, optionally filtered by source_mode. RLS enforces participant access. */
export async function getPlannerItems(
  userId: string,
  sourceMode?: PlannerSource | "all",
  limit = 50
) {
  let query = supabase
    .from("planner_items")
    .select("*")
    .order("starts_at", { ascending: true })
    .limit(limit);

  if (sourceMode && sourceMode !== "all") {
    query = query.eq("source_mode", sourceMode);
  }

  const { data, error } = await query;
  if (error) return [];
  return data ?? [];
}
