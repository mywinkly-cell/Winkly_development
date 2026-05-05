// lib/access/events.ts — Event access (participant/host only)

import { supabase } from "@/lib/supabase";

/** Get events user can see. RLS enforces creator/participant access. */
export async function getEventsForUser(userId: string, limit = 50) {
  const { data, error } = await supabase
    .from("events")
    .select("*")
    .order("starts_at", { ascending: true })
    .limit(limit);

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
