/**
 * Business Home — recent text searches and recently viewed professionals.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "winkly_business_home_recent";
const MAX_ENTRIES = 12;

export type BusinessRecentEntry =
  | { kind: "query"; text: string; at: number }
  | {
      kind: "profile";
      id: string;
      name: string;
      subtitle?: string;
      meta?: string;
      photoUrl?: string | null;
      at: number;
    };

export async function getBusinessRecentEntries(): Promise<BusinessRecentEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as BusinessRecentEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function saveBusinessRecentEntries(entries: BusinessRecentEntry[]): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(entries.slice(0, MAX_ENTRIES)));
  } catch {
    // ignore
  }
}

export async function recordBusinessSearchQuery(text: string): Promise<void> {
  const q = text.trim();
  if (!q) return;
  const entries = await getBusinessRecentEntries();
  const without = entries.filter((e) => !(e.kind === "query" && e.text.toLowerCase() === q.toLowerCase()));
  await saveBusinessRecentEntries([{ kind: "query", text: q, at: Date.now() }, ...without]);
}

export async function recordBusinessProfileView(entry: Omit<Extract<BusinessRecentEntry, { kind: "profile" }>, "kind" | "at">): Promise<void> {
  const entries = await getBusinessRecentEntries();
  const without = entries.filter((e) => !(e.kind === "profile" && e.id === entry.id));
  await saveBusinessRecentEntries([{ kind: "profile", ...entry, at: Date.now() }, ...without]);
}
