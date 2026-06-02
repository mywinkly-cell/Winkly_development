/**
 * Persist Business filter preferences.
 * Discover screen reads these and applies client-side filtering.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY_FILTERS = "winkly_business_filters";

export interface BusinessFiltersState {
  distanceKm: number;
  languages: string[];
  industries: string[];
  roles: string[];
  networkingGoals: string[];
  interests: string[];
  /** Free-text search on Business Home (name, role, interests, etc.). */
  searchQuery: string;
  /** City or region filter (client-side on profile location fields). */
  location: string;
}

const DEFAULT_BUSINESS_FILTERS: BusinessFiltersState = {
  distanceKm: 50,
  languages: [],
  industries: [],
  roles: [],
  networkingGoals: [],
  interests: [],
  searchQuery: "",
  location: "",
};

export async function getBusinessFilters(): Promise<BusinessFiltersState> {
  try {
    const raw = await AsyncStorage.getItem(KEY_FILTERS);
    if (!raw) return { ...DEFAULT_BUSINESS_FILTERS };
    const parsed = JSON.parse(raw) as Partial<BusinessFiltersState>;
    return { ...DEFAULT_BUSINESS_FILTERS, ...parsed };
  } catch {
    return { ...DEFAULT_BUSINESS_FILTERS };
  }
}

export async function setBusinessFilters(filters: Partial<BusinessFiltersState>): Promise<void> {
  try {
    const current = await getBusinessFilters();
    const next = { ...current, ...filters };
    await AsyncStorage.setItem(KEY_FILTERS, JSON.stringify(next));
  } catch {
    // ignore
  }
}

/** Apply saved Business filters to discover results (subtitle/meta = role, company, city). */
export function applyBusinessFiltersToFeed<T extends {
  subtitle?: string | null;
  meta?: string | null;
  title?: string | null;
}>(
  items: T[],
  filters: BusinessFiltersState
): T[] {
  const q = filters.searchQuery.trim().toLowerCase();
  const loc = filters.location.trim().toLowerCase();

  let out = items;

  if (q) {
    out = out.filter((item) => {
      const text = [item.title, item.subtitle, item.meta].filter(Boolean).join(" ").toLowerCase();
      return text.includes(q);
    });
  }

  if (loc) {
    out = out.filter((item) => {
      const text = [item.meta, item.subtitle].filter(Boolean).join(" ").toLowerCase();
      return text.includes(loc);
    });
  }

  if (
    filters.industries.length === 0 &&
    filters.roles.length === 0 &&
    filters.networkingGoals.length === 0 &&
    filters.interests.length === 0 &&
    (filters.languages.length === 0 || filters.languages.includes("Any"))
  ) {
    return out;
  }
  const searchText = (item: T) =>
    [item.title, item.subtitle, item.meta].filter(Boolean).join(" ").toLowerCase();
  return out.filter((item) => {
    const text = searchText(item);
    if (filters.industries.length > 0) {
      const match = filters.industries.some((i) => text.includes(i.toLowerCase()));
      if (!match) return false;
    }
    if (filters.roles.length > 0) {
      const match = filters.roles.some((r) => text.includes(r.toLowerCase()));
      if (!match) return false;
    }
    if (filters.networkingGoals.length > 0) {
      const match = filters.networkingGoals.some((g) => text.includes(g.toLowerCase()));
      if (!match) return false;
    }
    if (filters.interests.length > 0) {
      const match = filters.interests.some((i) => text.includes(i.toLowerCase()));
      if (!match) return false;
    }
    return true;
  });
}
