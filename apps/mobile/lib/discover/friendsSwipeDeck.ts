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
import { modeDisplayName } from "@/lib/profile/otherUserCore";

export type FriendsSwipeCardProfile = {
  id: string;
  user_id: string;
  display_name: string;
  age?: number | null;
  city: string;
  occupation?: string | null;
  chipItems: string[];
  /** Subset of chipItems shared with the viewer — highlighted on the card. */
  highlightChips?: string[];
  photoUrl: string;
  about?: string | null;
};

type FeedRow = {
  user_id?: string;
  id?: string;
  display_name?: string;
  first_name?: string | null;
  last_name?: string | null;
  show_full_name?: boolean | null;
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
        "id,user_id,display_name,first_name,last_name,show_full_name,city,occupation,age,vibe_tags,about_short,interests,main_photo_url,avatar_url",
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

  const selfSet = new Set((self?.interests ?? []).concat(self?.vibe_tags ?? []).map((s) => s.trim().toLowerCase()));

  return filtered.map((r) => {
    const uid = r.user_id ?? r.id ?? "";
    const interests = r.interests ?? [];
    const vibeTags = r.vibe_tags ?? [];
    const allChips = [...interests, ...vibeTags];
    const shared = allChips.filter((c) => selfSet.has(c.trim().toLowerCase()));
    const rest = allChips.filter((c) => !selfSet.has(c.trim().toLowerCase()));
    const chipItems = [...shared, ...rest].slice(0, 3);
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
      // Privacy: full name only if the user opted in (first name otherwise).
      display_name: modeDisplayName(
        {
          first_name: r.first_name,
          last_name: r.last_name,
          show_full_name: r.show_full_name,
          display_name: r.display_name,
        },
        "friends",
        r.display_name ?? "Friend"
      ),
      age: r.age ?? null,
      city: r.city ?? "",
      occupation: r.occupation ?? null,
      chipItems: chipItems.length ? chipItems : tags.slice(0, 3),
      highlightChips: shared,
      photoUrl:
        r.main_photo_url ?? r.avatar_url ?? "https://i.pravatar.cc/400?u=winklyfriends",
      about: r.about_short ?? null,
    };
  });
}
