import AsyncStorage from "@react-native-async-storage/async-storage";
import type { BusinessChipFilter } from "@/hooks/useBusinessSearch";

const KEY = "winkly:business:last_discover_query";

export type SavedDiscoverQuery = {
  searchQuery: string;
  chip: BusinessChipFilter | null;
};

export async function getLastDiscoverQuery(): Promise<SavedDiscoverQuery | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return null;
    return JSON.parse(raw) as SavedDiscoverQuery;
  } catch {
    return null;
  }
}

export async function saveLastDiscoverQuery(state: SavedDiscoverQuery): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // ignore
  }
}

export async function clearLastDiscoverQuery(): Promise<void> {
  try {
    await AsyncStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
