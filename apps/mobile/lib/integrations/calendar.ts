// apps/mobile/lib/integrations/calendar.ts
// Native calendar integration (Expo Calendar).

import * as ExpoCalendar from "expo-calendar";
import { Platform } from "react-native";

export type CalendarPermissionStatus = "undetermined" | "denied" | "granted";

export async function getCalendarPermissionStatus(): Promise<CalendarPermissionStatus> {
  const res = await ExpoCalendar.getCalendarPermissionsAsync();
  if (res.status === "granted") return "granted";
  if (res.status === "denied") return "denied";
  return "undetermined";
}

export async function requestCalendarPermissions(): Promise<CalendarPermissionStatus> {
  const res = await ExpoCalendar.requestCalendarPermissionsAsync();
  if (res.status === "granted") return "granted";
  if (res.status === "denied") return "denied";
  return "undetermined";
}

export async function listCalendars() {
  return await ExpoCalendar.getCalendarsAsync(ExpoCalendar.EntityTypes.EVENT);
}

export type CreateEventInput = {
  calendarId: string;
  title: string;
  startDate: Date;
  endDate: Date;
  notes?: string;
  location?: string;
  url?: string;
  alarms?: ExpoCalendar.Alarm[];
};

export async function createEvent(input: CreateEventInput) {
  const id = await ExpoCalendar.createEventAsync(input.calendarId, {
    title: input.title,
    startDate: input.startDate,
    endDate: input.endDate,
    notes: input.notes,
    location: input.location,
    url: input.url,
    alarms: input.alarms,
    timeZone: undefined,
  });
  return id;
}

export async function updateEvent(calendarId: string, eventId: string, patch: Partial<Omit<CreateEventInput, "calendarId">>) {
  await ExpoCalendar.updateEventAsync(eventId, {
    calendarId,
    title: patch.title,
    startDate: patch.startDate,
    endDate: patch.endDate,
    notes: patch.notes,
    location: patch.location,
    url: patch.url,
    alarms: patch.alarms,
  });
}

export async function deleteEvent(eventId: string) {
  await ExpoCalendar.deleteEventAsync(eventId);
}

/**
 * Best-effort helper to choose a writable default calendar.
 * On iOS, Expo exposes the default calendar id via `getDefaultCalendarAsync`.
 * On Android, we pick the first calendar that allows modifications.
 */
export async function getWritableDefaultCalendarId(): Promise<string | null> {
  try {
    if (Platform.OS === "ios") {
      const def = await ExpoCalendar.getDefaultCalendarAsync();
      return def?.allowsModifications ? def.id : null;
    }
  } catch {
    // fall through to list
  }

  const calendars = await listCalendars();
  const writable = calendars.find((c) => c.allowsModifications);
  return writable?.id ?? null;
}

