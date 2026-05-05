/**
 * External events (Meetup, Eventbrite) — add to planner, fetch nearby (stub).
 * See docs/EXTERNAL_EVENTS_AND_FILTERING.md
 */

import { supabase } from "@/lib/supabase";
import type { EventCardItem } from "@/components/ui/EventCard";

/** Add an external event to the user's planner. Creates planner_item with source_mode events and meta. */
export async function addExternalEventToPlanner(item: EventCardItem): Promise<void> {
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) throw new Error("Not signed in");

  const { error } = await supabase.from("planner_items").insert({
    created_by: uid,
    source_mode: "events",
    title: item.title,
    description: item.description ?? null,
    starts_at: item.startAt,
    ends_at: item.endAt ?? null,
    related_event_id: null,
    related_user_id: null,
    meta: {
      external_url: item.externalUrl ?? null,
      external_platform: item.externalPlatform ?? null,
      external_id: item.id,
      image_url: item.imageUrl ?? null,
      host_name: item.hostName ?? null,
      location: item.location ?? item.venueName ?? null,
      venue_name: item.venueName ?? null,
    },
  });

  if (error) throw new Error(error.message);
}

/**
 * Fetch nearby external events (Meetup, Eventbrite) from Edge Function.
 * Stub: returns empty until get-nearby-external-events is deployed and API keys are set.
 */
export async function getNearbyExternalEvents(opts: {
  latitude: number;
  longitude: number;
  radiusKm?: number;
  category?: string | null;
  from?: string; // ISO date
  to?: string;   // ISO date
}): Promise<EventCardItem[]> {
  const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
  if (!SUPABASE_URL) return [];

  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) return [];

  const url = `${SUPABASE_URL.replace(/\/$/, "")}/functions/v1/get-nearby-external-events`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({
      latitude: opts.latitude,
      longitude: opts.longitude,
      radius_km: opts.radiusKm ?? 30,
      category: opts.category ?? null,
      from: opts.from ?? null,
      to: opts.to ?? null,
    }),
  });

  if (!res.ok) return [];
  const data = await res.json().catch(() => ({}));
  return Array.isArray(data.events) ? data.events : [];
}
