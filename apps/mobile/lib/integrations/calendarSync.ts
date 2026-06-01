// apps/mobile/lib/integrations/calendarSync.ts
// User preference for syncing planner items to the device calendar.
// Calendar access is only ever used when the user explicitly enables this toggle
// (see app/planner/settings.tsx). Defaults to OFF.

import AsyncStorage from "@react-native-async-storage/async-storage";
import { getCalendarPermissionStatus } from "@/lib/integrations/calendar";

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
