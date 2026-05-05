/**
 * Proactive AI Concierge — suggestion types, storage, and client-side suggestion generator.
 * One suggestion at a time; never spam. Dismiss hides for 24h.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY_DISMISSED_UNTIL = "winkly_proactive_suggestion_dismissed_until";
const KEY_WEEKEND_DISMISSED = "winkly_weekly_weekend_dismissed";
const DISMISS_HOURS = 24;

export type PlannerTabKey = "all" | "dates" | "meetups" | "business" | "events" | "archive";

/** Single proactive suggestion shown at top of Planner. */
export type ProactiveSuggestion = {
  id: string;
  title: string;
  subtitle: string;
  activities: string[];
  timeRange: string;
  /** For "View plan" — pre-fill concierge context. */
  activityHint?: string;
  datePreset?: "today" | "tomorrow" | "weekend";
  timeOfDay?: "morning" | "lunch" | "afternoon" | "evening";
};

/** Weekend ideas (Fri/Sat/Sun) — shown Thu–Sun. */
export type WeeklyWeekendIdea = {
  day: "Friday" | "Saturday" | "Sunday";
  label: string;
  activityHint: string;
};

export type WeeklyWeekendSuggestion = {
  id: string;
  title: string;
  ideas: WeeklyWeekendIdea[];
};

function makeSuggestionId(tab: PlannerTabKey, seed: string): string {
  return `proactive_${tab}_${seed}`;
}

/** Check if user has dismissed a suggestion until a given time. */
export async function getDismissedUntil(): Promise<number | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY_DISMISSED_UNTIL);
    if (!raw) return null;
    const ts = parseInt(raw, 10);
    return Number.isNaN(ts) ? null : ts;
  } catch {
    return null;
  }
}

export async function setDismissedUntil(until: number): Promise<void> {
  await AsyncStorage.setItem(KEY_DISMISSED_UNTIL, String(until));
}

/** Dismiss current suggestion for DISMISS_HOURS. */
export async function dismissSuggestion(): Promise<void> {
  const until = Date.now() + DISMISS_HOURS * 60 * 60 * 1000;
  await setDismissedUntil(until);
}

/** Whether we should show a proactive suggestion (not dismissed). */
export async function shouldShowProactiveSuggestion(): Promise<boolean> {
  const until = await getDismissedUntil();
  if (until == null) return true;
  return Date.now() > until;
}

/** Dismiss weekly weekend card until next week. */
export async function dismissWeeklyWeekend(): Promise<void> {
  const nextThu = getNextThursday();
  await AsyncStorage.setItem(KEY_WEEKEND_DISMISSED, String(nextThu.getTime()));
}

export async function getWeeklyWeekendDismissedUntil(): Promise<number | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY_WEEKEND_DISMISSED);
    if (!raw) return null;
    return parseInt(raw, 10) || null;
  } catch {
    return null;
  }
}

function getNextThursday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  const thu = 4;
  let daysUntil = thu - day;
  if (daysUntil <= 0) daysUntil += 7;
  d.setDate(d.getDate() + daysUntil);
  return d;
}

/** Is it Thursday evening or Friday–Sunday? Show weekly weekend card. */
export function isWeekendIdeasPeriod(): boolean {
  const d = new Date();
  const day = d.getDay();
  const hour = d.getHours();
  if (day === 4 && hour >= 18) return true;
  if (day === 5 || day === 6 || day === 0) return true;
  return false;
}

/**
 * Generate one proactive suggestion based on tab, day, and time.
 * Uses simple heuristics; can be replaced by API later.
 */
export function getProactiveSuggestion(activeTab: PlannerTabKey): ProactiveSuggestion | null {
  const now = new Date();
  const day = now.getDay();
  const hour = now.getHours();
  const isWeekend = day === 0 || day === 6;
  const isFriday = day === 5;
  const isSaturday = day === 6;
  const isEvening = hour >= 17;
  const isAfternoon = hour >= 12;
  const isMorning = hour < 12;

  const tab = activeTab;

  if (tab === "archive") return null;

  const suggestions: ProactiveSuggestion[] = [];

  if (tab === "all") {
    if (isSaturday || day === 0) {
      suggestions.push({
        id: makeSuggestionId("all", "weekend_sun"),
        title: "Weekend idea",
        subtitle: "Perfect for a brunch and a walk.",
        activities: ["Brunch spot", "Park or river walk"],
        timeRange: "10:00 – 14:00",
        activityHint: "Brunch and a walk",
        datePreset: "weekend",
        timeOfDay: "lunch",
      });
    }
    if (isFriday && isEvening) {
      suggestions.push({
        id: makeSuggestionId("all", "friday_eve"),
        title: "After-work idea",
        subtitle: "Wine bar nearby.",
        activities: ["Wine bar"],
        timeRange: "18:00 – 21:00",
        activityHint: "Wine bar",
        datePreset: "today",
        timeOfDay: "evening",
      });
    }
    if (isAfternoon && !isWeekend) {
      suggestions.push({
        id: makeSuggestionId("all", "art_today"),
        title: "Art exhibition nearby today",
        subtitle: "Culture and a coffee.",
        activities: ["Exhibition", "Coffee"],
        timeRange: "14:00 – 17:00",
        activityHint: "Exhibition and coffee",
        datePreset: "today",
        timeOfDay: "afternoon",
      });
    }
  }

  if (tab === "dates") {
    if (isSaturday || isFriday && isEvening) {
      suggestions.push({
        id: makeSuggestionId("dates", "date_night"),
        title: "Perfect first date idea tonight",
        subtitle: "Romantic dinner or wine bar.",
        activities: ["Romantic dinner", "Wine bar"],
        timeRange: "19:00 – 22:00",
        activityHint: "Romantic dinner",
        datePreset: "today",
        timeOfDay: "evening",
      });
    }
    if (isWeekend && isMorning) {
      suggestions.push({
        id: makeSuggestionId("dates", "brunch_date"),
        title: "Saturday looks sunny",
        subtitle: "Perfect for brunch and a walk.",
        activities: ["Brunch", "River walk"],
        timeRange: "12:30 – 15:00",
        activityHint: "Brunch and a walk",
        datePreset: "weekend",
        timeOfDay: "lunch",
      });
    }
  }

  if (tab === "meetups") {
    if (isWeekend) {
      suggestions.push({
        id: makeSuggestionId("meetups", "friends_weekend"),
        title: "Sunny Sunday",
        subtitle: "Outdoor suggestion.",
        activities: ["Bike ride", "Park hangout"],
        timeRange: "11:00 – 15:00",
        activityHint: "Bike ride or park",
        datePreset: "weekend",
        timeOfDay: "afternoon",
      });
    }
    if (isFriday && isEvening) {
      suggestions.push({
        id: makeSuggestionId("meetups", "friends_eve"),
        title: "Friday evening",
        subtitle: "Drinks with friends?",
        activities: ["Drinks", "Bar"],
        timeRange: "18:00 – 22:00",
        activityHint: "Drinks with friends",
        datePreset: "today",
        timeOfDay: "evening",
      });
    }
  }

  if (tab === "business") {
    if (!isWeekend && isMorning) {
      suggestions.push({
        id: makeSuggestionId("business", "coffee_chat"),
        title: "Coffee chat idea",
        subtitle: "Network over coffee.",
        activities: ["Coffee chat", "Meeting"],
        timeRange: "09:00 – 11:00",
        activityHint: "Coffee chat",
        datePreset: "today",
        timeOfDay: "morning",
      });
    }
    if (isFriday && isAfternoon) {
      suggestions.push({
        id: makeSuggestionId("business", "lunch_meeting"),
        title: "Lunch meeting",
        subtitle: "Impress a contact over lunch.",
        activities: ["Lunch meeting"],
        timeRange: "12:00 – 14:00",
        activityHint: "Lunch meeting",
        datePreset: "today",
        timeOfDay: "lunch",
      });
    }
  }

  if (tab === "events") {
    suggestions.push({
      id: makeSuggestionId("events", "event_nearby"),
      title: "Events nearby",
      subtitle: "Something happening today or this weekend.",
      activities: ["Local event", "Concert or exhibition"],
      timeRange: isEvening ? "18:00 – 22:00" : "14:00 – 18:00",
      activityHint: "Event or concert",
      datePreset: isWeekend ? "weekend" : "today",
      timeOfDay: isEvening ? "evening" : "afternoon",
    });
  }

  if (suggestions.length === 0) return null;
  const daySeed = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`;
  const index = Math.abs(hashCode(daySeed + tab)) % suggestions.length;
  return suggestions[index];
}

function hashCode(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i);
    h |= 0;
  }
  return h;
}

/**
 * Weekly weekend ideas — shown Thu eve – Sun.
 * Example: Friday Wine bar, Saturday Art exhibition, Sunday Day trip.
 */
export function getWeeklyWeekendSuggestion(): WeeklyWeekendSuggestion {
  const ideas: WeeklyWeekendIdea[] = [
    { day: "Friday", label: "Wine bar", activityHint: "Wine bar" },
    { day: "Saturday", label: "Art exhibition", activityHint: "Art exhibition" },
    { day: "Sunday", label: "Day trip", activityHint: "Day trip" },
  ];
  return {
    id: `weekly_weekend_${Date.now()}`,
    title: "Your weekend ideas",
    ideas,
  };
}
