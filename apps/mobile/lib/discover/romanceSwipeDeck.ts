import { supabase } from "@/lib/supabase";
import {
  computeCompatibilityScore,
  type RomanceProfile,
} from "@/lib/ai/romanceInsights";
import {
  getRomanceAiMatchingEnabled,
  getRomanceFilters,
  applyRomanceFiltersToFeed,
} from "@/lib/filters/romanceFiltersStorage";
import { combinedMatchScore, fetchBehaviorAffinityMap } from "@/lib/matching/behaviorAffinities";
import { getBlockedUserIdSet } from "@/lib/access/blocks";

export type RomanceSwipeCardProfile = {
  id: string;
  name: string;
  age: number;
  city: string;
  occupation?: string | null;
  chipItems: string[];
  photoUrl: string;
};

type FeedRow = {
  id: string;
  first_name: string;
  age?: number | null;
  city?: string | null;
  interests?: string[] | null;
  languages?: string[] | null;
  occupation?: string | null;
  bio_romance?: string | null;
  compatibility?: number | null;
  romance_photos?: (string | null)[];
  core_photos?: (string | null)[];
};

/**
 * Romance home swipe deck — same feed rules as Discover recommendations (RPC + filters + AI sort).
 */
export async function fetchRomanceSwipeDeckProfiles(
  authedUserId: string,
  self: RomanceProfile | null,
): Promise<RomanceSwipeCardProfile[]> {
  const blocked = await getBlockedUserIdSet(authedUserId);

  const { data: feedData, error } = await supabase.rpc("romance_discover_feed", {
    current_user_id: authedUserId,
  });

  let rows: FeedRow[] = (feedData ?? []) as FeedRow[];

  if (error) {
    const { data: fallback } = await supabase
      .from("public_profile_view")
      .select(
        "id, first_name, age, city, interests, languages, occupation, bio_romance, core_photos, romance_photos",
      )
      .neq("id", authedUserId)
      .limit(50);
    rows = (fallback || []) as FeedRow[];
    rows = rows.filter(
      (r) =>
        (Array.isArray(r.romance_photos) && r.romance_photos.some((p) => !!p)) ||
        (r.bio_romance != null && String(r.bio_romance).trim() !== ""),
    );
    rows = rows.filter((r) => !blocked.has(r.id));
  }

  rows = rows.filter((r) => !blocked.has(r.id));

  const scored = rows.map((r) => {
    const other: RomanceProfile = {
      id: r.id,
      first_name: r.first_name,
      age: r.age ?? undefined,
      city: r.city ?? undefined,
      interests: r.interests ?? [],
      languages: r.languages ?? [],
      occupation: r.occupation ?? undefined,
      bio_romance: r.bio_romance ?? undefined,
    };
    const compatibility = computeCompatibilityScore({ self: self ?? undefined, other });
    return { ...r, compatibility };
  });

  const filters = await getRomanceFilters();
  let filtered = applyRomanceFiltersToFeed(scored, filters);
  const aiOn = await getRomanceAiMatchingEnabled();
  if (aiOn) {
    const ids = filtered.map((r) => r.id);
    const affMap = await fetchBehaviorAffinityMap(authedUserId, ids, "romance");
    filtered.sort((a, b) => {
      const ca = a.compatibility ?? 72;
      const cb = b.compatibility ?? 72;
      const sa = combinedMatchScore(ca, affMap.get(a.id) ?? 0.5);
      const sb = combinedMatchScore(cb, affMap.get(b.id) ?? 0.5);
      return sb - sa;
    });
  }

  return filtered.map((r) => {
    const interests = r.interests ?? [];
    const chipItems = interests.slice(0, 3);
    const photo = r.romance_photos?.[0] ?? r.core_photos?.[0];
    return {
      id: r.id,
      name: r.first_name ?? "Someone",
      age: typeof r.age === "number" && r.age > 0 ? r.age : 25,
      city: r.city ?? "",
      occupation: r.occupation ?? null,
      chipItems: chipItems.length ? chipItems : ["Romance"],
      photoUrl: photo ?? "https://i.pravatar.cc/400?u=winkly",
    };
  });
}
