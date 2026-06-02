/**
 * Per-mode location permission rationale — shown once before the OS prompt.
 * Never call Location.requestForegroundPermissionsAsync without showing rationale first.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import type { AppMode } from "@/lib/chats/types";

const KEY_PREFIX = "winkly_mode_location_rationale_shown_";

export function modeLocationRationaleKey(mode: AppMode): string {
  return `${KEY_PREFIX}${mode}`;
}

export async function hasShownModeLocationRationale(mode: AppMode): Promise<boolean> {
  try {
    const v = await AsyncStorage.getItem(modeLocationRationaleKey(mode));
    return v === "1";
  } catch {
    return false;
  }
}

export async function markModeLocationRationaleShown(mode: AppMode): Promise<void> {
  try {
    await AsyncStorage.setItem(modeLocationRationaleKey(mode), "1");
  } catch {
    // ignore
  }
}

export type ModeLocationCopy = {
  title: string;
  body: string;
  allowLabel: string;
  skipLabel: string;
};

export function getModeLocationCopy(mode: AppMode): ModeLocationCopy {
  switch (mode) {
    case "romance":
      return {
        title: "Find people nearby",
        body:
          "Winkly uses your location to show rounded distances on profiles and filter your Romance deck by how far away people are. Your exact GPS point is never shared.",
        allowLabel: "Enable location",
        skipLabel: "Not now",
      };
    case "friends":
      return {
        title: "Discover friends nearby",
        body:
          "Location helps Winkly suggest people and meetups in your area and show how far away a connection is. Coordinates are stored in a privacy-safe, rounded form.",
        allowLabel: "Enable location",
        skipLabel: "Not now",
      };
    case "business":
      return {
        title: "Explore businesses nearby",
        body:
          "Winkly can use your location to surface relevant businesses and services around you. You can change this anytime in Planner settings.",
        allowLabel: "Enable location",
        skipLabel: "Not now",
      };
    case "events":
      return {
        title: "Find events near you",
        body:
          "Location helps Winkly show nearby events, venues, and directions in your planner. We only store a coarse, rounded location for discovery.",
        allowLabel: "Enable location",
        skipLabel: "Not now",
      };
  }
}
