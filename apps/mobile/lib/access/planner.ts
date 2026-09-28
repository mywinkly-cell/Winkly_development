// lib/access/planner.ts — Mode-filtered planner items

import { supabase } from "@/lib/supabase";
type PlannerSource = "romance" | "friends" | "business" | "events";

/**
 * Get the user's *confirmed* planner items (role owner/attendee), optionally filtered by
 * source_mode. RLS enforces participant access, but RLS alone would also surface items where
 * the user is only a pending or declined "invitee" — createPlannerInvite seeds that row up front
 * so the recipient can read the proposed plan, and declining never removes it. Those aren't real
 * commitments, so callers doing conflict/availability checks (ConciergeConfirmStep, Weekly Spark
 * scheduling) must not treat them as busy time.
 */
export async function getPlannerItems(
  userId: string,
  sourceMode?: PlannerSource | "all",
  limit = 50
) {
  const { data: parts, error: partsError } = await supabase
    .from("planner_participants")
    .select("planner_item_id, cancelled_at")
    .eq("user_id", userId)
    .in("role", ["owner", "attendee"]);
  if (partsError) return [];
  const myRows = (parts ?? []) as { planner_item_id: string; cancelled_at: string | null }[];
  // When I dropped out ("can't make it") the plan goes on for the others but is off for me.
  const myCancelledAt = new Map(myRows.map((p) => [p.planner_item_id, p.cancelled_at]));
  const ids = Array.from(new Set(myRows.map((p) => p.planner_item_id)));
  if (ids.length === 0) return [];

  let query = supabase
    .from("planner_items")
    .select("*")
    .in("id", ids)
    .order("starts_at", { ascending: true })
    .limit(limit);

  if (sourceMode && sourceMode !== "all") {
    query = query.eq("source_mode", sourceMode);
  }

  const { data, error } = await query;
  if (error) return [];
  return ((data ?? []) as Record<string, unknown>[]).map((row): Record<string, unknown> => ({
    ...row,
    my_cancelled_at: myCancelledAt.get(String(row.id)) ?? null,
  }));
}

/**
 * A plan that no longer takes the user's time: cancelled by the organiser, or the user said
 * "can't make it". Rows come from getPlannerItems (which adds my_cancelled_at).
 */
export function isPlanOff(row: { meta?: unknown; my_cancelled_at?: unknown }): boolean {
  const meta = row.meta && typeof row.meta === "object" ? (row.meta as Record<string, unknown>) : null;
  return !!meta?.cancelled_at || !!row.my_cancelled_at;
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
