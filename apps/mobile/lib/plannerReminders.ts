// lib/plannerReminders.ts — Per-item reminder preferences (planner items, events, invitations)
// Stored in AsyncStorage; keyed by item/event/invite id. Used by EventReminderModal.

import AsyncStorage from "@react-native-async-storage/async-storage";

const PREFIX = "winkly_reminder_";

export type ReminderWhen =
  | "at_time"
  | "5m"
  | "10m"
  | "15m"
  | "30m"
  | "1h"
  | "1d";

export type ReminderPrefs = {
  push: boolean;
  email: boolean;
  when: ReminderWhen;
};

export const REMINDER_WHEN_OPTIONS: { value: ReminderWhen; label: string }[] = [
  { value: "at_time", label: "At time of event" },
  { value: "5m", label: "5 minutes before" },
  { value: "10m", label: "10 minutes before" },
  { value: "15m", label: "15 minutes before" },
  { value: "30m", label: "30 minutes before" },
  { value: "1h", label: "1 hour before" },
  { value: "1d", label: "1 day before" },
];

const defaultPrefs: ReminderPrefs = {
  push: true,
  email: false,
  when: "15m",
};

function storageKey(id: string): string {
  return `${PREFIX}${id}`;
}

/** Get reminder preferences for a planner item, event, or invitation. */
export async function getReminderPrefs(itemId: string): Promise<ReminderPrefs> {
  try {
    const raw = await AsyncStorage.getItem(storageKey(itemId));
    if (!raw) return { ...defaultPrefs };
    const parsed = JSON.parse(raw) as Partial<ReminderPrefs>;
    return {
      push: parsed.push ?? defaultPrefs.push,
      email: parsed.email ?? defaultPrefs.email,
      when: parsed.when ?? defaultPrefs.when,
    };
  } catch {
    return { ...defaultPrefs };
  }
}

/** Save reminder preferences for an item. */
export async function setReminderPrefs(
  itemId: string,
  prefs: Partial<ReminderPrefs>
): Promise<void> {
  try {
    const current = await getReminderPrefs(itemId);
    const next: ReminderPrefs = {
      push: prefs.push ?? current.push,
      email: prefs.email ?? current.email,
      when: prefs.when ?? current.when,
    };
    await AsyncStorage.setItem(storageKey(itemId), JSON.stringify(next));
  } catch {
    // ignore
  }
}
