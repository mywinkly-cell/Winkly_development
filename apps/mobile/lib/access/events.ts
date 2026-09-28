// lib/access/events.ts — Event access (participant/host only)

import { supabase } from "@/lib/supabase";
import { createPlannerItemForSelf } from "@/lib/plannerInvitations";
import { addPlanToMyCalendars, removePlanFromMyCalendars } from "@/lib/integrations/plannerCalendars";

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

/** Get events in date range (for filtering by day/week/month). Uses canonical column starts_at. */
export async function getEventsInRange(opts: {
  from: string; // ISO
  to: string;   // ISO
  category?: string | null;
  limit?: number;
}) {
  const { from, to, category, limit = 100 } = opts;
  const col = "starts_at"; // canonical: events table was created with starts_at
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

export type EventRsvp = "going" | "interested";

/**
 * Joined / interested in a Winkly event → the user's own Planner entry for it (one per user,
 * linked by related_event_id), on their phone calendar and connected Google/Outlook
 * calendars. Idempotent: re-joining re-activates the same entry; "interested" → "going"
 * just updates it.
 */
export async function addWinklyEventToPlanner(eventId: string, rsvp: EventRsvp = "going"): Promise<string | null> {
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) throw new Error("Not signed in");

  const { data: ev } = await supabase
    .from("events")
    .select("id, title, description, starts_at, ends_at, city, venue_name, cover_url")
    .eq("id", eventId)
    .maybeSingle();
  const e = ev as {
    title: string;
    description: string | null;
    starts_at: string;
    ends_at: string | null;
    city: string | null;
    venue_name: string | null;
    cover_url: string | null;
  } | null;
  if (!e?.starts_at) return null;
  const location = [e.venue_name, e.city].filter(Boolean).join(", ") || null;

  const { data: existing } = await supabase
    .from("planner_items")
    .select("id, meta")
    .eq("created_by", uid)
    .eq("related_event_id", eventId)
    .maybeSingle();
  const row = existing as { id: string; meta: Record<string, unknown> | null } | null;

  if (row) {
    const { cancelled_at: wasCancelled, ...rest } = row.meta ?? {};
    await supabase
      .from("planner_items")
      .update({ meta: { ...rest, rsvp }, title: e.title, starts_at: e.starts_at, ends_at: e.ends_at })
      .eq("id", row.id);
    if (wasCancelled) {
      addPlanToMyCalendars({
        plannerItemId: row.id,
        creatorId: uid,
        userId: uid,
        title: e.title,
        description: e.description,
        location,
        startsAt: e.starts_at,
        endsAt: e.ends_at,
      });
    }
    return row.id;
  }

  // createPlannerItemForSelf adds the owner row and syncs phone + cloud calendars.
  const id = await createPlannerItemForSelf(uid, {
    title: e.title,
    description: e.description ?? undefined,
    source_mode: "events",
    starts_at: e.starts_at,
    ends_at: e.ends_at ?? undefined,
    location: location ?? undefined,
    item_meta: {
      rsvp,
      winkly_event_id: eventId,
      ...(location ? { location } : {}),
      ...(e.venue_name ? { venue_name: e.venue_name } : {}),
      ...(e.cover_url?.startsWith("https://") ? { image_url: e.cover_url } : {}),
    },
  });
  await supabase.from("planner_items").update({ related_event_id: eventId }).eq("id", id);
  return id;
}

/** Left the event / not going → the Planner entry is cancelled (Archive) and leaves the calendars. */
export async function removeWinklyEventFromPlanner(eventId: string): Promise<void> {
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) return;
  const { data: existing } = await supabase
    .from("planner_items")
    .select("id, meta")
    .eq("created_by", uid)
    .eq("related_event_id", eventId)
    .maybeSingle();
  const row = existing as { id: string; meta: Record<string, unknown> | null } | null;
  if (!row || row.meta?.cancelled_at) return;
  await supabase
    .from("planner_items")
    .update({ meta: { ...(row.meta ?? {}), cancelled_at: new Date().toISOString() } })
    .eq("id", row.id);
  await removePlanFromMyCalendars(row.id, uid);
}
