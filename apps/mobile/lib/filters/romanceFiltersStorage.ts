/**
 * Persist Romance filter preferences (AI matching + full filter state).
 * Discover screen reads these to apply sorting and client-side filtering.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY_AI_MATCHING = "winkly_romance_ai_matching";
const KEY_FILTERS = "winkly_romance_filters";

export interface RomanceFiltersState {
  distanceKm: number;
  ageMin: number;
  ageMax: number;
  languages: string[];
  interests: string[];
  relationshipGoals: string[];
  lifestyle: string;
  smoking: string;
  alcohol: string;
  kids: string;
  sexualViews: string;
  religion: string;
  politicalViews: string;
  values: string[];
  pets: string[];
  allergies: string[];
  food: string;
}

const DEFAULT_ROMANCE_FILTERS: RomanceFiltersState = {
  distanceKm: 50,
  ageMin: 18,
  ageMax: 100,
  languages: [],
  interests: [],
  relationshipGoals: [],
  lifestyle: "",
  smoking: "",
  alcohol: "",
  kids: "",
  sexualViews: "",
  religion: "",
  politicalViews: "",
  values: [],
  pets: [],
  allergies: [],
  food: "",
};

export async function getRomanceAiMatchingEnabled(): Promise<boolean> {
  try {
    const v = await AsyncStorage.getItem(KEY_AI_MATCHING);
    return v === "1";
  } catch {
    return true; // default on
  }
}

export async function setRomanceAiMatchingEnabled(enabled: boolean): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY_AI_MATCHING, enabled ? "1" : "0");
  } catch {
    // ignore
  }
}

export async function getRomanceFilters(): Promise<RomanceFiltersState> {
  try {
    const raw = await AsyncStorage.getItem(KEY_FILTERS);
    if (!raw) return { ...DEFAULT_ROMANCE_FILTERS };
    const parsed = JSON.parse(raw) as Partial<RomanceFiltersState>;
    return { ...DEFAULT_ROMANCE_FILTERS, ...parsed };
  } catch {
    return { ...DEFAULT_ROMANCE_FILTERS };
  }
}

export async function setRomanceFilters(filters: Partial<RomanceFiltersState>): Promise<void> {
  try {
    const current = await getRomanceFilters();
    const next = { ...current, ...filters };
    await AsyncStorage.setItem(KEY_FILTERS, JSON.stringify(next));
  } catch {
    // ignore
  }
}

/** Apply saved Romance filters to feed (age, languages, interests). Runs client-side after feed is loaded. */
export function applyRomanceFiltersToFeed<
  T extends { age?: number | null; languages?: string[] | null; interests?: string[] | null }
>(items: T[], filters: RomanceFiltersState): T[] {
  return items.filter((item) => {
    const age = item.age ?? null;
    if (age != null && (age < filters.ageMin || age > filters.ageMax)) return false;

    const itemLangs = item.languages ?? [];
    if (filters.languages.length > 0 && !filters.languages.includes("Any")) {
      const hasLang = itemLangs.some((l) => filters.languages.includes(l));
      if (!hasLang) return false;
    }

    if (filters.interests.length > 0) {
      const itemInterests = item.interests ?? [];
      const hasInterest = itemInterests.some((i) => filters.interests.includes(i));
      if (!hasInterest) return false;
    }

    return true;
  });
}
