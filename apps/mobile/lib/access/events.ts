// lib/access/events.ts — Event access (participant/host only)

import { supabase } from "@/lib/supabase";

/** Get events user can see. RLS enforces creator/participant access. */
export async function getEventsForUser(userId: string, limit = 50) {
  const { data, error } = await supabase
    .from("events")
    .select("*")
    .order("start_at", { ascending: true })
    .limit(limit);

  if (error) return [];
  return data ?? [];
}

/** Get events in date range (for filtering by day/week/month). Uses start_at or starts_at. */
export async function getEventsInRange(opts: {
  from: string; // ISO
  to: string;   // ISO
  category?: string | null;
  limit?: number;
}) {
  const { from, to, category, limit = 100 } = opts;
  const col = "start_at"; // remaining_tables uses start_at; schema may use starts_at
  let query = supabase
    .from("events")
    .select("*")
    .gte(col, from)
    .lte(col, to)
    .order(col, { ascending: true })
    .limit(limit);
  if (category) {
    query = query.eq("category", category);
  }
  const { data, error } = await query;
  if (error) return [];
  return data ?? [];
}

/** Get event by id — RLS enforces access */
export async function getEvent(eventId: string) {
  const { data, error } = await supabase
    .from("events")
    .select("*")
    .eq("id", eventId)
    .single();
  if (error) return null;
  return data;
}

/** Add Winkly event to user's planner (events_planner_items). */
export async function addWinklyEventToPlanner(eventId: string): Promise<void> {
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) throw new Error("Not signed in");

  const { error } = await supabase.from("events_planner_items").upsert(
    { user_id: uid, event_id: eventId },
    { onConflict: "user_id,event_id" }
  );
  if (error) throw new Error(error.message);
}
