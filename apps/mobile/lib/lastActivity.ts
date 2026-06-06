// apps/mobile/lib/lastActivity.ts
// Local last-activity timestamp for cold-start routing (2-week returning-user window).

import AsyncStorage from "@react-native-async-storage/async-storage";

const KEYS = {
  LAST_ACTIVITY_AT: "winkly_last_activity_at",
  HAS_ACCOUNT: "winkly_has_account",
} as const;

/** Returning users with activity within this window may skip re-login when a session exists. */
export const RECENT_ACTIVITY_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

export async function getLastActivityAt(): Promise<number | null> {
  try {
    const raw = await AsyncStorage.getItem(KEYS.LAST_ACTIVITY_AT);
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

export async function recordLastActivity(): Promise<void> {
  try {
    await AsyncStorage.setItem(KEYS.LAST_ACTIVITY_AT, String(Date.now()));
  } catch {
    // ignore
  }
}

export async function markHasAccount(): Promise<void> {
  try {
    await AsyncStorage.setItem(KEYS.HAS_ACCOUNT, "true");
  } catch {
    // ignore
  }
}

export async function hasKnownAccount(): Promise<boolean> {
  try {
    const v = await AsyncStorage.getItem(KEYS.HAS_ACCOUNT);
    return v === "true";
  } catch {
    return false;
  }
}

/**
 * Effective last activity = max(local app open, Supabase last_sign_in_at).
 * Used when deciding whether a persisted session still qualifies as "recent".
 */
export function getEffectiveLastActivityMs(
  localActivityAt: number | null,
  lastSignInAt: string | undefined | null
): number | null {
  const local = localActivityAt ?? 0;
  const server = lastSignInAt ? Date.parse(lastSignInAt) : 0;
  const effective = Math.max(local, Number.isFinite(server) ? server : 0);
  return effective > 0 ? effective : null;
}

export function isActivityRecent(
  effectiveLastActivityMs: number | null,
  nowMs: number = Date.now()
): boolean {
  if (effectiveLastActivityMs == null) return false;
  return nowMs - effectiveLastActivityMs < RECENT_ACTIVITY_WINDOW_MS;
}
