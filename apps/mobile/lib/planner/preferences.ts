/**
 * Planner view preferences (the planner "Filters" screen).
 *
 * Source of truth is the per-user `public.user_settings` row in Supabase
 * (settings -> 'planner'), so toggles sync across the user's devices.
 * A local AsyncStorage mirror is kept so reads still work offline and the
 * planner doesn't flash defaults on a slow network.
 *
 * Defaults intentionally match the planner's built-in behavior, so a fresh
 * account behaves exactly as before until the user changes them.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "@/lib/supabase";

/** Local mirror of the server value (offline cache only). */
const CACHE_KEY = "winkly_planner_preferences";
/** Key under `user_settings.settings` JSON that holds these toggles. */
const SETTINGS_KEY = "planner";

export type PlannerPreferences = {
  /** Hide past items from planner lists (default true — matches built-in behavior). */
  onlyUpcoming: boolean;
  /** Include completed/archived items inline in planner lists (default false). */
  showCompleted: boolean;
  /** Show AI suggestion cards (concierge promo, proactive nudges) in the planner. */
  aiSuggestions: boolean;
};

export const DEFAULT_PLANNER_PREFERENCES: PlannerPreferences = {
  onlyUpcoming: true,
  showCompleted: false,
  aiSuggestions: true,
};

/** Normalize an untrusted value (server JSON / cached JSON) into full prefs. */
function coercePrefs(value: unknown): PlannerPreferences {
  const p = (value && typeof value === "object" ? value : {}) as Partial<PlannerPreferences>;
  return {
    onlyUpcoming:
      typeof p.onlyUpcoming === "boolean" ? p.onlyUpcoming : DEFAULT_PLANNER_PREFERENCES.onlyUpcoming,
    showCompleted:
      typeof p.showCompleted === "boolean" ? p.showCompleted : DEFAULT_PLANNER_PREFERENCES.showCompleted,
    aiSuggestions:
      typeof p.aiSuggestions === "boolean" ? p.aiSuggestions : DEFAULT_PLANNER_PREFERENCES.aiSuggestions,
  };
}

async function readCache(): Promise<PlannerPreferences | null> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    return raw ? coercePrefs(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

async function writeCache(prefs: PlannerPreferences): Promise<void> {
  try {
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(prefs));
  } catch {
    // best-effort offline mirror
  }
}

/**
 * Read planner prefs. Prefers the synced Supabase value; on any failure
 * (offline, table not yet migrated, signed out) falls back to the local
 * mirror and then to defaults — never throws.
 */
export async function getPlannerPreferences(): Promise<PlannerPreferences> {
  try {
    const { data: auth } = await supabase.auth.getUser();
    const uid = auth.user?.id;
    if (!uid) return (await readCache()) ?? { ...DEFAULT_PLANNER_PREFERENCES };

    const { data, error } = await supabase
      .from("user_settings")
      .select("settings")
      .eq("user_id", uid)
      .maybeSingle();
    if (error) throw error;

    const settings = (data?.settings as Record<string, unknown> | null | undefined) ?? null;
    const prefs = coercePrefs(settings?.[SETTINGS_KEY]);
    await writeCache(prefs);
    return prefs;
  } catch {
    return (await readCache()) ?? { ...DEFAULT_PLANNER_PREFERENCES };
  }
}

/**
 * Persist planner prefs to the user's `user_settings` row, merging into any
 * existing settings JSON so other keys are preserved. Throws on failure so the
 * Filters screen can surface a "couldn't save" message; the local mirror is
 * updated only after a successful server write (keeps cache == server truth).
 */
export async function savePlannerPreferences(prefs: PlannerPreferences): Promise<void> {
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) throw new Error("Not signed in");

  const { data: existing } = await supabase
    .from("user_settings")
    .select("settings")
    .eq("user_id", uid)
    .maybeSingle();
  const base = (existing?.settings as Record<string, unknown> | null) ?? {};

  const { error } = await supabase
    .from("user_settings")
    .upsert({ user_id: uid, settings: { ...base, [SETTINGS_KEY]: prefs } }, { onConflict: "user_id" });
  if (error) throw error;

  await writeCache(prefs);
}
