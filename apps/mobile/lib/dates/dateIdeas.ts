/**
 * Curated in-chat date ideas — Winkly's activity-planning differentiator.
 *
 * Picks 3 context-aware date-idea categories for a new match conversation by
 * overlapping the two users' activity preferences / interests. No external
 * Places API yet (kept deliberately simple); each idea maps to an activity
 * label understood by InviteToPlanModal so one tap pre-fills the propose form.
 */

import { supabase } from "@/lib/supabase";

export type DateIdea = {
  /** Stable category key. */
  key: string;
  /** Short label shown on the chip AND used as the InviteToPlanModal activity. */
  activity: string;
  /** Ionicons glyph name for the chip. */
  icon: string;
  /** True when this idea was chosen because both people share the interest. */
  shared: boolean;
};

type Category = {
  key: string;
  activity: string;
  icon: string;
  /** Lowercase keywords that, if present in a user's prefs/interests, match this category. */
  match: string[];
};

/**
 * Curated catalog. Order here is the tie-break / fallback priority
 * (low-friction first-date ideas come first).
 */
const CATALOG: Category[] = [
  { key: "coffee", activity: "Coffee", icon: "cafe-outline", match: ["coffee", "café", "cafe", "tea", "brunch"] },
  { key: "walk", activity: "Walk", icon: "walk-outline", match: ["walk", "walking", "nature", "park", "outdoors", "hiking", "stroll"] },
  { key: "drinks", activity: "Drinks", icon: "wine-outline", match: ["wine", "drinks", "cocktails", "bar", "beer", "nightlife"] },
  { key: "dinner", activity: "Dinner", icon: "restaurant-outline", match: ["dinner", "food", "foodie", "restaurant", "cooking", "dining", "sushi"] },
  { key: "museum", activity: "Museum", icon: "business-outline", match: ["museum", "art", "gallery", "history", "culture", "exhibition"] },
  { key: "live-music", activity: "Live music", icon: "musical-notes-outline", match: ["music", "concert", "live music", "gigs", "festival", "dancing"] },
  { key: "movie", activity: "Movie", icon: "film-outline", match: ["movie", "movies", "cinema", "film", "netflix"] },
  { key: "picnic", activity: "Picnic", icon: "sunny-outline", match: ["picnic", "outdoors", "nature", "beach", "park"] },
  { key: "sports", activity: "Tennis", icon: "tennisball-outline", match: ["tennis", "sport", "sports", "gym", "fitness", "padel", "running"] },
  { key: "day-trip", activity: "Day trip", icon: "car-outline", match: ["travel", "day trip", "road trip", "adventure", "explore"] },
];

/** Default trio when there is no usable overlap (or prefs are missing). */
const DEFAULT_KEYS = ["coffee", "walk", "dinner"];

function normalizeTags(...lists: (string[] | null | undefined)[]): string[] {
  const out = new Set<string>();
  for (const list of lists) {
    if (!Array.isArray(list)) continue;
    for (const raw of list) {
      if (typeof raw !== "string") continue;
      const t = raw.trim().toLowerCase();
      if (t) out.add(t);
    }
  }
  return [...out];
}

/** Tags a category matches against a flat set of lowercase preference tags. */
function categoryMatches(cat: Category, tags: Set<string>): boolean {
  return cat.match.some((kw) => {
    if (tags.has(kw)) return true;
    // light fuzzy: tag contains keyword or vice-versa (e.g. "live music gigs")
    for (const t of tags) {
      if (t.includes(kw) || kw.includes(t)) return true;
    }
    return false;
  });
}

async function loadPreferenceTags(userId: string): Promise<string[]> {
  const { data } = await supabase
    .from("user_profiles")
    .select("activity_preferences, interests")
    .eq("id", userId)
    .maybeSingle();
  const ap = (data?.activity_preferences as string[] | null) ?? [];
  const interests = (data?.interests as string[] | null) ?? [];
  return normalizeTags(ap, interests);
}

function buildFromKeys(keys: string[], sharedKeys: Set<string>): DateIdea[] {
  return keys
    .map((k) => CATALOG.find((c) => c.key === k))
    .filter((c): c is Category => !!c)
    .map((c) => ({ key: c.key, activity: c.activity, icon: c.icon, shared: sharedKeys.has(c.key) }));
}

/**
 * Returns up to 3 date ideas for a 1:1 match, ranked by shared activity
 * preferences. Falls back to a sensible curated trio when there is no overlap.
 */
export async function getDateIdeasForChat(meId: string, partnerId: string): Promise<DateIdea[]> {
  let mineTags: string[] = [];
  let theirsTags: string[] = [];
  try {
    [mineTags, theirsTags] = await Promise.all([
      loadPreferenceTags(meId),
      loadPreferenceTags(partnerId),
    ]);
  } catch {
    // Network/permission hiccup — still return curated defaults below.
  }

  const mine = new Set(mineTags);
  const theirs = new Set(theirsTags);
  const overlap = new Set([...mine].filter((t) => theirs.has(t)));

  const sharedKeys = new Set<string>();
  if (overlap.size > 0) {
    for (const cat of CATALOG) {
      if (categoryMatches(cat, overlap)) sharedKeys.add(cat.key);
    }
  }

  const ordered: string[] = [];
  // 1) categories backed by a shared interest (preserve catalog priority order)
  for (const cat of CATALOG) {
    if (sharedKeys.has(cat.key)) ordered.push(cat.key);
  }
  // 2) categories either user likes individually
  if (ordered.length < 3) {
    const union = new Set([...mine, ...theirs]);
    for (const cat of CATALOG) {
      if (ordered.includes(cat.key)) continue;
      if (categoryMatches(cat, union)) ordered.push(cat.key);
      if (ordered.length >= 3) break;
    }
  }
  // 3) curated defaults to backfill
  if (ordered.length < 3) {
    for (const k of DEFAULT_KEYS) {
      if (!ordered.includes(k)) ordered.push(k);
      if (ordered.length >= 3) break;
    }
  }

  return buildFromKeys(ordered.slice(0, 3), sharedKeys);
}
