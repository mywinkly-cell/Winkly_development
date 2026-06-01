/**
 * External events (Meetup, Eventbrite) — add to planner, fetch nearby (with retry + graceful fallback).
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

export type ExternalEventsOpts = {
  latitude: number;
  longitude: number;
  radiusKm?: number;
  category?: string | null;
  from?: string; // ISO date
  to?: string;   // ISO date
};

/**
 * Outcome of an external-events fetch.
 * - "ok": at least one external event returned.
 * - "empty": request succeeded but no external events (e.g. no API keys configured, or none nearby).
 * - "unavailable": both providers / the Edge Function could not be reached (network error, timeout, 5xx).
 *
 * Callers should ALWAYS keep showing Winkly-native events regardless of this status — never a blank screen.
 */
export type ExternalEventsStatus = "ok" | "empty" | "unavailable";

export type ExternalEventsResult = {
  events: EventCardItem[];
  status: ExternalEventsStatus;
};

const REQUEST_TIMEOUT_MS = 8000;
const MAX_ATTEMPTS = 2;

/** fetch with an abort timeout; returns null on network error / timeout. */
async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number
): Promise<Response | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fetch nearby external events (Meetup, Eventbrite) from the Edge Function, with retry + timeout.
 *
 * Graceful degradation: transient failures (network error, timeout, 5xx) are retried once, then
 * reported as "unavailable" with an empty list so the UI can fall back to Winkly-only without
 * surfacing an error or rendering a blank screen.
 */
export async function fetchNearbyExternalEvents(opts: ExternalEventsOpts): Promise<ExternalEventsResult> {
  const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
  if (!SUPABASE_URL) return { events: [], status: "unavailable" };

  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) return { events: [], status: "unavailable" };

  const url = `${SUPABASE_URL.replace(/\/$/, "")}/functions/v1/get-nearby-external-events`;
  const init: RequestInit = {
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
  };

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const res = await fetchWithTimeout(url, init, REQUEST_TIMEOUT_MS);

    // Network error / timeout — retry, then give up gracefully.
    if (!res) {
      if (attempt < MAX_ATTEMPTS - 1) continue;
      return { events: [], status: "unavailable" };
    }

    // Transient server error — retry, then give up gracefully.
    if (res.status >= 500) {
      if (attempt < MAX_ATTEMPTS - 1) continue;
      return { events: [], status: "unavailable" };
    }

    // Other non-OK (auth, bad request) — not retryable; degrade gracefully.
    if (!res.ok) return { events: [], status: "unavailable" };

    const data = await res.json().catch(() => null);
    if (!data || typeof data !== "object") return { events: [], status: "unavailable" };

    const events = Array.isArray((data as { events?: unknown }).events)
      ? ((data as { events: EventCardItem[] }).events)
      : [];
    return { events, status: events.length > 0 ? "ok" : "empty" };
  }

  return { events: [], status: "unavailable" };
}

/**
 * Fetch nearby external events, returning just the list (empty on any failure).
 * Prefer {@link fetchNearbyExternalEvents} when you need to distinguish "empty" from "unavailable".
 */
export async function getNearbyExternalEvents(opts: ExternalEventsOpts): Promise<EventCardItem[]> {
  const { events } = await fetchNearbyExternalEvents(opts);
  return events;
}
