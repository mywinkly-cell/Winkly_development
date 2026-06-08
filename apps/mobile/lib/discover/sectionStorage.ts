/**
 * Persist daily Discover section picks (up to N new profiles per section per day).
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import type { DiscoverProfileItem, DiscoverSectionKey } from "./types";

const PREFIX = "winkly_discover_section_";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function sectionKey(mode: "romance" | "friends", section: DiscoverSectionKey): string {
  return `${PREFIX}${mode}_${section}_${today()}`;
}

/** Return stored daily picks, or pick up to `limit` new profiles from candidates and persist. */
export async function getOrCreateDailySectionItems(
  mode: "romance" | "friends",
  section: DiscoverSectionKey,
  candidates: DiscoverProfileItem[],
  limit: number,
): Promise<DiscoverProfileItem[]> {
  const key = sectionKey(mode, section);
  const raw = await AsyncStorage.getItem(key);
  if (raw) {
    const data = JSON.parse(raw) as { ids?: string[] };
    const ids = data.ids ?? [];
    const byId = new Map(candidates.map((c) => [c.id, c]));
    return ids.map((id) => byId.get(id)).filter(Boolean) as DiscoverProfileItem[];
  }

  const picked = candidates.slice(0, limit);
  await AsyncStorage.setItem(key, JSON.stringify({ ids: picked.map((p) => p.id), date: today() }));
  return picked;
}
