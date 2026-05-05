/**
 * Get "when I'm free" slots from device calendar for Concierge time_preference.
 */

import * as Calendar from "expo-calendar";

/** Returns ISO date-time strings for start of free evening slots (18:00) in the next 7 days that don't overlap calendar events. */
export async function getFreeEveningSlots(): Promise<string[]> {
  try {
    const { status } = await Calendar.getCalendarPermissionsAsync();
    if (status !== "granted") {
      const { status: requested } = await Calendar.requestCalendarPermissionsAsync();
      if (requested !== "granted") return [];
    }
    const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
    const calendarIds = calendars.map((c) => c.id);
    const now = new Date();
    const end = new Date(now);
    end.setDate(end.getDate() + 8);
    end.setHours(0, 0, 0, 0);
    const events = await Calendar.getEventsAsync(calendarIds, now, end);
    const slots: string[] = [];
    for (let d = 0; d < 7; d++) {
      const date = new Date(now);
      date.setDate(date.getDate() + d);
      date.setHours(18, 0, 0, 0);
      const eveningEnd = new Date(date);
      eveningEnd.setHours(23, 59, 59, 999);
      const hasEvent = events.some((e) => {
        const start = new Date(e.startDate);
        const endTime = new Date(e.endDate ?? e.startDate);
        return start < eveningEnd && endTime > date;
      });
      if (!hasEvent) {
        slots.push(date.toISOString());
      }
    }
    return slots;
  } catch {
    return [];
  }
}

/** Start times (ISO) for free daytime slots in the next 7 days — used by Match Bridge (coffee / lunch windows). */
export async function getFreeDaytimeSlotsForBridge(): Promise<string[]> {
  try {
    const { status } = await Calendar.getCalendarPermissionsAsync();
    if (status !== "granted") {
      const { status: requested } = await Calendar.requestCalendarPermissionsAsync();
      if (requested !== "granted") return [];
    }
    const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
    const calendarIds = calendars.map((c) => c.id);
    const now = new Date();
    const rangeEnd = new Date(now);
    rangeEnd.setDate(rangeEnd.getDate() + 8);
    rangeEnd.setHours(0, 0, 0, 0);
    const events = await Calendar.getEventsAsync(calendarIds, now, rangeEnd);
    const slots: string[] = [];
    const dayHours = [9, 10, 11, 14, 15, 16, 17];
    for (let d = 0; d < 7; d++) {
      for (const h of dayHours) {
        const date = new Date(now);
        date.setDate(date.getDate() + d);
        date.setHours(h, 0, 0, 0);
        if (date.getTime() < now.getTime()) continue;
        const slotEnd = new Date(date);
        slotEnd.setHours(h + 1, 0, 0, 0);
        const hasEvent = events.some((e) => {
          const start = new Date(e.startDate);
          const endTime = new Date(e.endDate ?? e.startDate);
          return start < slotEnd && endTime > date;
        });
        if (!hasEvent) {
          slots.push(date.toISOString());
          if (slots.length >= 24) return slots;
        }
      }
    }
    return slots;
  } catch {
    return [];
  }
}
