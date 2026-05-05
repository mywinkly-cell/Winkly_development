import { supabase } from "@/lib/supabase";
import {
  computeFriendsCompatibility,
  buildFriendsMatchTags,
  type FriendsProfile,
} from "@/lib/ai/friendsInsights";
import {
  getFriendsFilters,
  applyFriendsFiltersToFeed,
  getFriendsAiMatchingEnabled,
} from "@/lib/filters/friendsFiltersStorage";
import { combinedMatchScore, fetchBehaviorAffinityMap } from "@/lib/matching/behaviorAffinities";
import { getBlockedUserIdSet } from "@/lib/access/blocks";

export type FriendsSwipeCardProfile = {
  id: string;
  user_id: string;
  display_name: string;
  age?: number | null;
  city: string;
  occupation?: string | null;
  chipItems: string[];
  photoUrl: string;
  about?: string | null;
};

type FeedRow = {
  user_id?: string;
  id?: string;
  display_name?: string;
  city?: string | null;
  occupation?: string | null;
  age?: number | null;
  interests?: string[] | null;
  vibe_tags?: string[] | null;
  about_short?: string | null;
  main_photo_url?: string | null;
  avatar_url?: string | null;
  compatibility?: number | null;
};

/**
 * Friends Home swipe deck — RPC feed + filters + optional AI sort (reuses Smart matching toggle).
 */
export async function fetchFriendsSwipeDeckProfiles(
  authedUserId: string,
  self: FriendsProfile | null,
): Promise<FriendsSwipeCardProfile[]> {
  const blocked = await getBlockedUserIdSet(authedUserId);

  const { data: feedData, error } = await supabase.rpc("friends_discover_feed", {
    current_user_id: authedUserId,
    p_limit: 80,
  });

  let rows: FeedRow[] = ((feedData ?? []) as FeedRow[]).filter((r) => {
    const uid = r.user_id ?? r.id;
    return uid && uid !== authedUserId && !blocked.has(uid);
  });

  if (error) {
    const { data: fallback } = await supabase
      .from("friend_profiles")
      .select(
        "id,user_id,display_name,city,occupation,age,vibe_tags,about_short,interests,main_photo_url,avatar_url",
      )
      .limit(60);
    rows = ((fallback ?? []) as FeedRow[])
      .filter((r) => {
        const uid = r.user_id ?? r.id;
        return uid && uid !== authedUserId && !blocked.has(uid ?? "");
      })
      .map((r) => ({ ...r }));
  }

  const scored = rows.map((r) => {
    const uid = r.user_id ?? r.id ?? "";
    const other: FriendsProfile = {
      id: uid,
      display_name: r.display_name ?? "Friend",
      city: r.city ?? undefined,
      interests: r.interests ?? [],
      vibe_tags: r.vibe_tags ?? [],
      about: r.about_short ?? undefined,
    };
    const compatibility = computeFriendsCompatibility({ self: self ?? undefined, other });
    return { ...r, user_id: uid, compatibility };
  });

  const filters = await getFriendsFilters();
  const filtered = applyFriendsFiltersToFeed(scored, filters);

  const aiFriends = await getFriendsAiMatchingEnabled();
  if (aiFriends) {
    const ids = filtered.map((r) => r.user_id ?? r.id).filter(Boolean) as string[];
    const affMap = await fetchBehaviorAffinityMap(authedUserId, ids, "friends");
    filtered.sort((a, b) => {
      const ca = (a as { compatibility?: number }).compatibility ?? 0;
      const cb = (b as { compatibility?: number }).compatibility ?? 0;
      const sa = combinedMatchScore(ca, affMap.get(a.user_id ?? "") ?? 0.5);
      const sb = combinedMatchScore(cb, affMap.get(b.user_id ?? "") ?? 0.5);
      return sb - sa;
    });
  } else {
    filtered.sort(
      (a, b) =>
        ((b as { compatibility?: number }).compatibility ?? 0) -
        ((a as { compatibility?: number }).compatibility ?? 0),
    );
  }

  return filtered.map((r) => {
    const uid = r.user_id ?? r.id ?? "";
    const interests = r.interests ?? [];
    const vibeTags = r.vibe_tags ?? [];
    const chipItems = [...interests, ...vibeTags].slice(0, 3);
    const other: FriendsProfile = {
      id: uid,
      display_name: r.display_name ?? "Friend",
      city: r.city ?? undefined,
      interests,
      vibe_tags: vibeTags,
      about: r.about_short ?? undefined,
    };
    const tags = buildFriendsMatchTags({ self: self ?? undefined, other });
    return {
      id: uid,
      user_id: uid,
      display_name: r.display_name ?? "Friend",
      age: r.age ?? null,
      city: r.city ?? "",
      occupation: r.occupation ?? null,
      chipItems: chipItems.length ? chipItems : tags.slice(0, 3),
      photoUrl:
        r.main_photo_url ?? r.avatar_url ?? "https://i.pravatar.cc/400?u=winklyfriends",
      about: r.about_short ?? null,
    };
  });
}
