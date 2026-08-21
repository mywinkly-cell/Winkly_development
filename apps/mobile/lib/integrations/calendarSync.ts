// apps/mobile/lib/integrations/calendarSync.ts
// User preference for syncing planner items to the device calendar.
// Calendar access is only ever used when the user explicitly enables this toggle
// (see app/planner/settings.tsx). Defaults to OFF.

import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "@/lib/supabase";
import { createEvent, getCalendarPermissionStatus, getWritableDefaultCalendarId } from "@/lib/integrations/calendar";

export const CALENDAR_SYNC_STORAGE_KEY = "winkly_planner_calendar_sync_enabled";

/** Whether the user has opted in to syncing planner items to their device calendar. Defaults to false. */
export async function getCalendarSyncPreference(): Promise<boolean> {
  try {
    const v = await AsyncStorage.getItem(CALENDAR_SYNC_STORAGE_KEY);
    return v === "true";
  } catch {
    return false;
  }
}

/** Persist the calendar-sync opt-in preference. */
export async function setCalendarSyncPreference(enabled: boolean): Promise<void> {
  try {
    await AsyncStorage.setItem(CALENDAR_SYNC_STORAGE_KEY, String(enabled));
  } catch {
    // ignore — preference is best-effort local storage
  }
}

/**
 * Single source of truth for "should we write this planner item to the device calendar?".
 * Requires BOTH the user opt-in toggle AND a granted OS calendar permission.
 * Use this guard before any calendar write so access is never assumed to be always-on.
 */
export async function isCalendarSyncEnabled(): Promise<boolean> {
  const [pref, status] = await Promise.all([
    getCalendarSyncPreference(),
    getCalendarPermissionStatus(),
  ]);
  return pref && status === "granted";
}

const DEFAULT_EVENT_DURATION_MS = 60 * 60 * 1000;

export type PlannerCalendarEventInput = {
  plannerItemId: string;
  userId: string;
  title: string;
  description?: string | null;
  location?: string | null;
  startsAt: string;
  endsAt?: string | null;
};

/**
 * Best-effort: write a confirmed planner item to the device calendar and remember the
 * resulting event id on the caller's own planner_participants row. Sync is per participant
 * (each person writes to their own phone's calendar via their own device), never the shared
 * planner_items row. No-ops silently when sync is off, permission isn't granted, or the OS
 * write fails — must never throw or block the planner/invite flow it's called from.
 */
export async function syncPlannerItemToDeviceCalendar(input: PlannerCalendarEventInput): Promise<void> {
  try {
    if (!(await isCalendarSyncEnabled())) return;

    const start = new Date(input.startsAt);
    if (Number.isNaN(start.getTime())) return;
    const parsedEnd = input.endsAt ? new Date(input.endsAt) : null;
    const end = parsedEnd && !Number.isNaN(parsedEnd.getTime())
      ? parsedEnd
      : new Date(start.getTime() + DEFAULT_EVENT_DURATION_MS);

    const calendarId = await getWritableDefaultCalendarId();
    if (!calendarId) return;

    const eventId = await createEvent({
      calendarId,
      title: input.title,
      startDate: start,
      endDate: end,
      notes: input.description ?? undefined,
      location: input.location ?? undefined,
    });

    await supabase
      .from("planner_participants")
      .update({ device_calendar_event_id: eventId })
      .eq("planner_item_id", input.plannerItemId)
      .eq("user_id", input.userId);
  } catch {
    // Best-effort — a calendar write failure must never block the planner flow.
  }
}

/**
 * Sync every upcoming planner item the user hasn't yet written to their device calendar.
 * Called once when the user flips the sync toggle on, so items added before opting in
 * still show up on their phone's calendar (not just future ones).
 */
export async function backfillPlannerItemsToDeviceCalendar(userId: string): Promise<void> {
  try {
    if (!(await isCalendarSyncEnabled())) return;

    const { data: parts } = await supabase
      .from("planner_participants")
      .select("planner_item_id")
      .eq("user_id", userId)
      .in("role", ["owner", "attendee"])
      .is("device_calendar_event_id", null);
    const ids = Array.from(new Set((parts ?? []).map((p) => p.planner_item_id)));
    if (ids.length === 0) return;

    const { data: items } = await supabase
      .from("planner_items")
      .select("id, title, description, starts_at, ends_at, meta")
      .in("id", ids)
      .gte("starts_at", new Date().toISOString());
    if (!items?.length) return;

    for (const item of items) {
      const meta = (item.meta ?? null) as Record<string, unknown> | null;
      const location =
        (typeof meta?.location === "string" && meta.location) ||
        (typeof meta?.place === "string" && meta.place) ||
        (typeof meta?.venue_name === "string" && meta.venue_name) ||
        null;

      await syncPlannerItemToDeviceCalendar({
        plannerItemId: item.id,
        userId,
        title: item.title,
        description: item.description ?? null,
        location,
        startsAt: item.starts_at,
        endsAt: item.ends_at ?? null,
      });
    }
  } catch {
    // Best-effort — never block the settings toggle on a backfill failure.
  }
}
