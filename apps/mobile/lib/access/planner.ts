// lib/access/planner.ts — Mode-filtered planner items

import { supabase } from "@/lib/supabase";
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

export type GroupMeetup = {
  id: string;
  title: string;
  starts_at: string;
  ends_at: string | null;
  participant_count: number;
  is_owner: boolean;
};

/**
 * Group meetups for the current user: planner_items in a given mode where the
 * user is a participant AND the item has >= 2 participants (a real group plan,
 * not a solo entry or a 1:1 invite that was declined). RLS scopes the rows.
 */
export async function getGroupMeetups(
  userId: string,
  sourceMode: PlannerSource = "friends",
  limit = 50
): Promise<GroupMeetup[]> {
  const { data: items, error } = await supabase
    .from("planner_items")
    .select("id, title, starts_at, ends_at, created_by")
    .eq("source_mode", sourceMode)
    .order("starts_at", { ascending: true })
    .limit(limit);
  if (error || !items?.length) return [];

  const ids = items.map((i: { id: string }) => i.id);
  const { data: parts } = await supabase
    .from("planner_participants")
    .select("planner_item_id, user_id")
    .in("planner_item_id", ids);

  const countByItem: Record<string, number> = {};
  (parts ?? []).forEach((p: { planner_item_id: string }) => {
    countByItem[p.planner_item_id] = (countByItem[p.planner_item_id] ?? 0) + 1;
  });

  return items
    .map((i: { id: string; title: string; starts_at: string; ends_at: string | null; created_by: string }) => ({
      id: i.id,
      title: i.title,
      starts_at: i.starts_at,
      ends_at: i.ends_at,
      participant_count: countByItem[i.id] ?? 0,
      is_owner: i.created_by === userId,
    }))
    .filter((i) => i.participant_count >= 2);
}
