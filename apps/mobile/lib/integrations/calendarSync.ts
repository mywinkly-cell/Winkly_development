// apps/mobile/lib/integrations/calendarSync.ts
// User preference for syncing planner items to the device calendar.
// Calendar access is only ever used when the user explicitly enables this toggle
// (see app/planner/settings.tsx). Defaults to OFF.

import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "@/lib/supabase";
import {
  createEvent,
  deleteEvent,
  getCalendarPermissionStatus,
  getWritableDefaultCalendarId,
} from "@/lib/integrations/calendar";

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

    // Remember which version of the plan the phone has, so a later reschedule is noticed.
    const { data: rev } = await supabase
      .from("planner_items")
      .select("revision")
      .eq("id", input.plannerItemId)
      .maybeSingle();
    await supabase
      .from("planner_participants")
      .update({
        device_calendar_event_id: eventId,
        device_calendar_revision: (rev as { revision?: number } | null)?.revision ?? 0,
      })
      .eq("planner_item_id", input.plannerItemId)
      .eq("user_id", input.userId);
  } catch {
    // Best-effort — a calendar write failure must never block the planner flow.
  }
}

function planLocation(meta: Record<string, unknown> | null): string | null {
  return (
    (typeof meta?.location === "string" && meta.location) ||
    (typeof meta?.place === "string" && meta.place) ||
    (typeof meta?.venue_name === "string" && meta.venue_name) ||
    null
  );
}

/**
 * Keep the phone's calendar in step with changes other people made (or made on another
 * phone): a plan that was moved is re-written at its new time; a plan that was cancelled —
 * or that the user dropped out of — is taken off. Runs on Planner load. Only touches events
 * Winkly wrote itself (device_calendar_event_id).
 */
export async function reconcileDeviceCalendar(userId: string): Promise<void> {
  try {
    if ((await getCalendarPermissionStatus()) !== "granted") return;
    const { data: parts } = await supabase
      .from("planner_participants")
      .select("planner_item_id, device_calendar_event_id, device_calendar_revision, cancelled_at")
      .eq("user_id", userId)
      .not("device_calendar_event_id", "is", null);
    const rows = (parts ?? []) as {
      planner_item_id: string;
      device_calendar_event_id: string;
      device_calendar_revision: number | null;
      cancelled_at: string | null;
    }[];
    if (!rows.length) return;
    const { data: items } = await supabase
      .from("planner_items")
      .select("id, title, description, starts_at, ends_at, meta, revision")
      .in("id", rows.map((r) => r.planner_item_id));
    const byId = new Map(
      ((items ?? []) as {
        id: string; title: string; description: string | null; starts_at: string; ends_at: string | null;
        meta: Record<string, unknown> | null; revision: number | null;
      }[]).map((i) => [i.id, i])
    );

    for (const r of rows) {
      const item = byId.get(r.planner_item_id);
      const off = !item || !!r.cancelled_at || !!item.meta?.cancelled_at;
      const moved = !!item && (item.revision ?? 0) > (r.device_calendar_revision ?? 0);
      if (!off && !moved) continue;
      await deleteEvent(r.device_calendar_event_id).catch(() => undefined);
      await supabase
        .from("planner_participants")
        .update({ device_calendar_event_id: null })
        .eq("planner_item_id", r.planner_item_id)
        .eq("user_id", userId);
      if (off || !item || Date.parse(item.starts_at) < Date.now()) continue;
      // Moved: write it again at the new time (a fresh event also brings fresh reminders).
      await syncPlannerItemToDeviceCalendar({
        plannerItemId: item.id,
        userId,
        title: item.title,
        description: item.description,
        location: planLocation(item.meta),
        startsAt: item.starts_at,
        endsAt: item.ends_at,
      });
    }
  } catch {
    // best-effort
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
      .is("cancelled_at", null)
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
      if (meta?.cancelled_at) continue; // cancelled plans stay off the calendar
      const location = planLocation(meta);

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
