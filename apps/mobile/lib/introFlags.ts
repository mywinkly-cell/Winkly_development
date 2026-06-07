// apps/mobile/lib/introFlags.ts
// Persistent storage for "shown once" intro screens
// Prevents flash: gate rendering until flags are loaded
//
// FUTURE: Add Settings menu entries for:
// - "About Winkly"
// - "How Winkly works" (more detailed documentation)

import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Mode } from "@/types";

const KEYS = {
  INTRO_SEEN: "winkly_intro_seen",
  WINKLY_WORLD_SEEN: "winkly_world_seen",
  WINKLY_WORLD_DONT_SHOW: "winkly_world_dont_show",
  ONBOARDING_SUBPROFILE_SKIPPED: "winkly_onboarding_subprofile_skipped",
} as const;

export type SkippedOnboardingMode = Exclude<Mode, "events">;

export async function getIntroSeen(): Promise<boolean> {
  try {
    const v = await AsyncStorage.getItem(KEYS.INTRO_SEEN);
    return v === "true";
  } catch {
    return false;
  }
}

export async function setIntroSeen(): Promise<void> {
  try {
    await AsyncStorage.setItem(KEYS.INTRO_SEEN, "true");
  } catch {
    // ignore
  }
}

/** Clear intro_seen — used when session is invalid (e.g. user deleted) so user gets full first-time flow */
export async function clearIntroSeen(): Promise<void> {
  try {
    await AsyncStorage.removeItem(KEYS.INTRO_SEEN);
  } catch {
    // ignore
  }
}

export async function getWinklyWorldSeen(): Promise<boolean> {
  try {
    const v = await AsyncStorage.getItem(KEYS.WINKLY_WORLD_SEEN);
    return v === "true";
  } catch {
    return false;
  }
}

export async function setWinklyWorldSeen(): Promise<void> {
  try {
    await AsyncStorage.setItem(KEYS.WINKLY_WORLD_SEEN, "true");
  } catch {
    // ignore
  }
}

export async function getWinklyWorldDontShow(): Promise<boolean> {
  try {
    const v = await AsyncStorage.getItem(KEYS.WINKLY_WORLD_DONT_SHOW);
    return v === "true";
  } catch {
    return false;
  }
}

export async function setWinklyWorldDontShow(): Promise<void> {
  try {
    await AsyncStorage.setItem(KEYS.WINKLY_WORLD_DONT_SHOW, "true");
  } catch {
    // ignore
  }
}

/** True if we should skip WinklyWorldScreen */
export async function shouldSkipWinklyWorld(): Promise<boolean> {
  const [seen, dontShow] = await Promise.all([
    getWinklyWorldSeen(),
    getWinklyWorldDontShow(),
  ]);
  return seen || dontShow;
}

/** Mode the user chose on onboarding step 4 but skipped completing. Cleared when that sub-profile hits 100%. */
export async function getOnboardingSubProfileSkipped(): Promise<SkippedOnboardingMode | null> {
  try {
    const v = await AsyncStorage.getItem(KEYS.ONBOARDING_SUBPROFILE_SKIPPED);
    if (v === "romance" || v === "friends" || v === "business") return v;
    return null;
  } catch {
    return null;
  }
}

export async function setOnboardingSubProfileSkipped(mode: SkippedOnboardingMode): Promise<void> {
  try {
    await AsyncStorage.setItem(KEYS.ONBOARDING_SUBPROFILE_SKIPPED, mode);
  } catch {
    // ignore
  }
}

export async function clearOnboardingSubProfileSkipped(): Promise<void> {
  try {
    await AsyncStorage.removeItem(KEYS.ONBOARDING_SUBPROFILE_SKIPPED);
  } catch {
    // ignore
  }
}
