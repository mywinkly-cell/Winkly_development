/**
 * Weekly Spark dismiss storage + Saturday planner nudge.
 * Heuristic "Winkly suggestion" cards were removed — Planner uses structured Weekly Sparks only.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { notifications } from "@/lib/notifications";

const KEY_WEEKEND_DISMISSED = "winkly_weekly_weekend_dismissed";
const KEY_SAT_PLANNER_NUDGE = "winkly_planner_sat_local_nudge_for";

/** Day/label rows used by weekend/Spark teaser builders. */
export type WeeklyWeekendIdea = {
  day: string;
  label: string;
  activityHint: string;
};

export type WeeklyWeekendSuggestion = {
  id: string;
  title: string;
  ideas: WeeklyWeekendIdea[];
};

/**
 * Soft-hide Weekly Sparks until cleared (header spark / deep-link) or until the
 * next Monday 00:00 local — Sparks are week-scoped (Mon–Sun), not Thu–Sun.
 */
export async function dismissWeeklyWeekend(): Promise<void> {
  const nextMon = getNextMonday();
  await AsyncStorage.setItem(KEY_WEEKEND_DISMISSED, String(nextMon.getTime()));
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

/** Clear dismiss so Weekly Sparks can show again (header spark / deep-link). */
export async function clearWeeklySparkDismissed(): Promise<void> {
  await AsyncStorage.removeItem(KEY_WEEKEND_DISMISSED);
}

/** Next Monday 00:00 local (always in the future — tomorrow if today is Monday). */
function getNextMonday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  const day = d.getDay(); // 0=Sun … 1=Mon
  let daysUntil = (1 - day + 7) % 7;
  if (daysUntil === 0) daysUntil = 7;
  d.setDate(d.getDate() + daysUntil);
  return d;
}

/** Next upcoming Saturday 10:00 local; if today is Sat before 10:00, use today. */
function getNextSaturdayMorningTen(): Date {
  const now = new Date();
  const target = new Date(now);
  const dow = now.getDay();
  let add = (6 - dow + 7) % 7;
  target.setDate(now.getDate() + add);
  target.setHours(10, 0, 0, 0);
  if (add === 0 && now.getTime() >= target.getTime()) {
    target.setDate(target.getDate() + 7);
  }
  return target;
}

/** One local notification per target Saturday (permission-gated). */
export async function scheduleSaturdayPlannerNudgeIfNeeded(): Promise<void> {
  try {
    if (!(await notifications.isAvailable())) return;
    const perm = await notifications.getPermissionStatus();
    if (perm !== "granted") return;

    const when = getNextSaturdayMorningTen();
    const weekKey = when.toISOString().slice(0, 10);

    const prev = await AsyncStorage.getItem(KEY_SAT_PLANNER_NUDGE);
    if (prev === weekKey) return;

    await notifications.scheduleLocal({
      title: "Plan something this weekend",
      body: "Open Winkly Planner for a personalized Saturday idea.",
      data: { kind: "proactive_weekend_planner" },
      triggerAt: when,
    });
    await AsyncStorage.setItem(KEY_SAT_PLANNER_NUDGE, weekKey);
  } catch {
    // ignore
  }
}
