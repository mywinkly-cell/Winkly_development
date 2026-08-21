/**
 * Weekly Sparks location / radius prefs — locked once per Mon–Sun week
 * so Sparks don’t churn when the user tweaks city mid-week.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { getWeeklySparkWeekKey } from "@/lib/ai/weeklySpark";

const KEY = "winkly_weekly_spark_location_prefs_v1";
const TIMING_KEY = "winkly_weekly_spark_timing_prefs_v1";

export const WEEKLY_SPARK_RADIUS_KM_OPTIONS = [5, 10, 20, 40] as const;
export const DEFAULT_WEEKLY_SPARK_RADIUS_KM = 20;

export type WeeklySparkLocationPrefs = {
  weekKey: string;
  location: string;
  city: string;
  country?: string;
  searchRadiusKm: number;
  /** True after the user saves settings for this week — further edits wait until next Monday. */
  locked: boolean;
};

type StoredShape = WeeklySparkLocationPrefs;

export async function getWeeklySparkLocationPrefs(): Promise<WeeklySparkLocationPrefs | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredShape;
    if (!parsed?.weekKey || !parsed?.city) return null;
    const weekKey = getWeeklySparkWeekKey();
    if (parsed.weekKey !== weekKey) return null; // expired with the week
    return {
      weekKey: parsed.weekKey,
      location: String(parsed.location ?? parsed.city),
      city: String(parsed.city),
      country: parsed.country ? String(parsed.country) : undefined,
      searchRadiusKm:
        typeof parsed.searchRadiusKm === "number" && parsed.searchRadiusKm > 0
          ? parsed.searchRadiusKm
          : DEFAULT_WEEKLY_SPARK_RADIUS_KM,
      locked: !!parsed.locked,
    };
  } catch {
    return null;
  }
}

/** Persist prefs for the current week. Passing `lock: true` freezes edits until next Monday. */
export async function saveWeeklySparkLocationPrefs(
  prefs: Omit<WeeklySparkLocationPrefs, "weekKey" | "locked"> & { lock?: boolean }
): Promise<WeeklySparkLocationPrefs> {
  const weekKey = getWeeklySparkWeekKey();
  const existing = await getWeeklySparkLocationPrefs();
  if (existing?.locked && existing.weekKey === weekKey) {
    return existing;
  }
  const next: WeeklySparkLocationPrefs = {
    weekKey,
    location: prefs.location.trim() || prefs.city.trim(),
    city: prefs.city.trim(),
    country: prefs.country?.trim() || undefined,
    searchRadiusKm: prefs.searchRadiusKm > 0 ? prefs.searchRadiusKm : DEFAULT_WEEKLY_SPARK_RADIUS_KM,
    locked: prefs.lock === true || !!existing?.locked,
  };
  await AsyncStorage.setItem(KEY, JSON.stringify(next));
  return next;
}

export type SparkDaypart = "morning" | "afternoon" | "evening";

export const SPARK_DAYPARTS: SparkDaypart[] = ["morning", "afternoon", "evening"];

/**
 * When Sparks may be scheduled. Winkly's default ("smart") keeps work days for the evening and
 * only offers morning plans at the weekend; users can widen either window.
 */
export type WeeklySparkTimingPrefs = {
  /** Follow Winkly's recommendation instead of the custom windows below. */
  smart: boolean;
  weekdayParts: SparkDaypart[];
  weekendParts: SparkDaypart[];
};

export const SMART_WEEKLY_SPARK_TIMING: WeeklySparkTimingPrefs = {
  smart: true,
  weekdayParts: ["evening"],
  weekendParts: ["morning", "afternoon", "evening"],
};

function sanitizeParts(value: unknown, fallback: SparkDaypart[]): SparkDaypart[] {
  if (!Array.isArray(value)) return fallback;
  const parts = SPARK_DAYPARTS.filter((p) => value.includes(p));
  return parts.length ? parts : fallback;
}

export async function getWeeklySparkTimingPrefs(): Promise<WeeklySparkTimingPrefs> {
  try {
    const raw = await AsyncStorage.getItem(TIMING_KEY);
    if (!raw) return SMART_WEEKLY_SPARK_TIMING;
    const parsed = JSON.parse(raw) as Partial<WeeklySparkTimingPrefs>;
    if (parsed?.smart !== false) return SMART_WEEKLY_SPARK_TIMING;
    return {
      smart: false,
      weekdayParts: sanitizeParts(parsed.weekdayParts, SMART_WEEKLY_SPARK_TIMING.weekdayParts),
      weekendParts: sanitizeParts(parsed.weekendParts, SMART_WEEKLY_SPARK_TIMING.weekendParts),
    };
  } catch {
    return SMART_WEEKLY_SPARK_TIMING;
  }
}

export async function saveWeeklySparkTimingPrefs(
  prefs: WeeklySparkTimingPrefs
): Promise<WeeklySparkTimingPrefs> {
  const next: WeeklySparkTimingPrefs = prefs.smart
    ? SMART_WEEKLY_SPARK_TIMING
    : {
        smart: false,
        weekdayParts: sanitizeParts(prefs.weekdayParts, SMART_WEEKLY_SPARK_TIMING.weekdayParts),
        weekendParts: sanitizeParts(prefs.weekendParts, SMART_WEEKLY_SPARK_TIMING.weekendParts),
      };
  await AsyncStorage.setItem(TIMING_KEY, JSON.stringify(next));
  return next;
}

export function sparkTimingCacheKey(timing?: WeeklySparkTimingPrefs | null): string {
  const t = timing ?? SMART_WEEKLY_SPARK_TIMING;
  return t.smart ? "smart" : `${t.weekdayParts.join("+")}/${t.weekendParts.join("+")}`;
}

export function sparkLocationCacheKey(prefs: {
  weekKey?: string;
  city: string;
  country?: string;
  searchRadiusKm: number;
  context: string;
  timing?: WeeklySparkTimingPrefs | null;
}): string {
  const week = prefs.weekKey ?? getWeeklySparkWeekKey();
  return `${week}|${prefs.context}|${prefs.city.trim().toLowerCase()}|${(prefs.country ?? "").trim().toLowerCase()}|${prefs.searchRadiusKm}|${sparkTimingCacheKey(prefs.timing)}`;
}
