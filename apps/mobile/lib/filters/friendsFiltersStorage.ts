/**
 * Persist Friends filter preferences (full filter state).
 * Discover screen reads these and applies client-side filtering.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY_FILTERS = "winkly_friends_filters";
const KEY_AI_MATCHING = "winkly_friends_ai_matching";

export interface FriendsFiltersState {
  distanceKm: number;
  ageMin: number;
  ageMax: number;
  languages: string[];
  interests: string[];
  meetupGoals: string[];
  pets: string[];
  food: string;
}

const DEFAULT_FRIENDS_FILTERS: FriendsFiltersState = {
  distanceKm: 50,
  ageMin: 18,
  ageMax: 100,
  languages: [],
  interests: [],
  meetupGoals: [],
  pets: [],
  food: "",
};

export async function getFriendsFilters(): Promise<FriendsFiltersState> {
  try {
    const raw = await AsyncStorage.getItem(KEY_FILTERS);
    if (!raw) return { ...DEFAULT_FRIENDS_FILTERS };
    const parsed = JSON.parse(raw) as Partial<FriendsFiltersState>;
    return { ...DEFAULT_FRIENDS_FILTERS, ...parsed };
  } catch {
    return { ...DEFAULT_FRIENDS_FILTERS };
  }
}

export async function setFriendsFilters(filters: Partial<FriendsFiltersState>): Promise<void> {
  try {
    const current = await getFriendsFilters();
    const next = { ...current, ...filters };
    await AsyncStorage.setItem(KEY_FILTERS, JSON.stringify(next));
  } catch {
    // ignore
  }
}

export async function getFriendsAiMatchingEnabled(): Promise<boolean> {
  try {
    const v = await AsyncStorage.getItem(KEY_AI_MATCHING);
    return v === "1";
  } catch {
    return false;
  }
}

export async function setFriendsAiMatchingEnabled(enabled: boolean): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY_AI_MATCHING, enabled ? "1" : "0");
  } catch {
    // ignore
  }
}

/** Apply saved Friends filters to feed items (interests overlap; optional age/languages if present on item). */
export function applyFriendsFiltersToFeed<T extends {
  interests?: string[] | null;
  city?: string | null;
  age?: number | null;
  languages?: string[] | null;
}>(
  items: T[],
  filters: FriendsFiltersState
): T[] {
  return items.filter((item) => {
    if (filters.interests.length > 0) {
      const itemInterests = item.interests ?? [];
      const hasOverlap = itemInterests.some((i) => filters.interests.includes(i));
      if (!hasOverlap) return false;
    }
    const age = item.age ?? null;
    if (age != null && (age < filters.ageMin || age > filters.ageMax)) return false;
    const itemLangs = item.languages ?? [];
    if (filters.languages.length > 0 && !filters.languages.includes("Any")) {
      const hasOverlap = itemLangs.some((l) => filters.languages.includes(l));
      if (!hasOverlap) return false;
    }
    return true;
  });
}
