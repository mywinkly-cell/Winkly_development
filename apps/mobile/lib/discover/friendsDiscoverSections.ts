import { supabase } from "@/lib/supabase";
import {
  computeFriendsCompatibility,
  type FriendsProfile,
} from "@/lib/ai/friendsInsights";
import {
  getFriendsFilters,
  applyFriendsFiltersToFeed,
  getFriendsAiMatchingEnabled,
} from "@/lib/filters/friendsFiltersStorage";
import { combinedMatchScore, fetchBehaviorAffinityMap } from "@/lib/matching/behaviorAffinities";
import { getBlockedUserIdSet } from "@/lib/access/blocks";
import { getOrCreateDailySectionItems } from "./sectionStorage";
import { meetupGoalsFromMeta, sharedCount } from "./metaGoals";
import { DISCOVER_LIMITS } from "./storage";
import type { DiscoverProfileItem } from "./types";

type FriendsFeedRow = {
  id?: string;
  user_id?: string;
  display_name?: string;
  first_name?: string;
  last_name?: string;
  age?: number | null;
  city?: string | null;
  interests?: string[] | null;
  languages?: string[] | null;
  vibe_tags?: string[] | null;
  about_short?: string | null;
  main_photo_url?: string | null;
  avatar_url?: string | null;
  meta?: Record<string, unknown> | null;
  compatibility?: number | null;
};

function rowId(row: FriendsFeedRow): string {
  return row.user_id ?? row.id ?? "";
}

export function friendsRowToItem(row: FriendsFeedRow): DiscoverProfileItem {
  const name =
    row.display_name ??
    ([row.first_name, row.last_name].filter(Boolean).join(" ").trim() || "Someone");
  return {
    id: rowId(row),
    name,
    age: row.age ?? null,
    photoUrl: row.main_photo_url ?? row.avatar_url ?? null,
  };
}

export async function fetchFriendsDiscoverPool(
  authedUserId: string,
  self: FriendsProfile | null,
): Promise<FriendsFeedRow[]> {
  const blocked = await getBlockedUserIdSet(authedUserId);

  const { data: feedData, error } = await supabase.rpc("friends_discover_feed", {
    current_user_id: authedUserId,
    p_limit: 120,
  });

  let rows: FriendsFeedRow[] = ((feedData ?? []) as FriendsFeedRow[]).filter((r) => {
    const uid = rowId(r);
    return uid && uid !== authedUserId && !blocked.has(uid);
  });

  if (error || rows.length === 0) {
    const { data: iFollow } = await supabase
      .from("follows")
      .select("followee_id")
      .eq("follower_id", authedUserId);
    const iFollowIds = new Set((iFollow ?? []).map((r: { followee_id: string }) => r.followee_id));

    const { data: fpData } = await supabase
      .from("friend_profiles")
      .select(
        "id,user_id,display_name,first_name,last_name,city,age,vibe_tags,about_short,interests,main_photo_url,avatar_url,meta",
      )
      .order("created_at", { ascending: false })
      .limit(80);

    rows = ((fpData ?? []) as FriendsFeedRow[]).filter((r) => {
      const uid = rowId(r);
      return uid && uid !== authedUserId && !blocked.has(uid) && !iFollowIds.has(uid);
    });
  }

  const scored = rows.map((r) => {
    const uid = rowId(r);
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
  let filtered = applyFriendsFiltersToFeed(scored, filters);

  const aiFriends = await getFriendsAiMatchingEnabled();
  if (aiFriends) {
    const ids = filtered.map((r) => rowId(r)).filter(Boolean);
    const affMap = await fetchBehaviorAffinityMap(authedUserId, ids, "friends");
    filtered.sort((a, b) => {
      const ca = a.compatibility ?? 0;
      const cb = b.compatibility ?? 0;
      const sa = combinedMatchScore(ca, affMap.get(rowId(a)) ?? 0.5);
      const sb = combinedMatchScore(cb, affMap.get(rowId(b)) ?? 0.5);
      return sb - sa;
    });
  } else {
    filtered.sort((a, b) => (b.compatibility ?? 0) - (a.compatibility ?? 0));
  }

  return filtered;
}

export async function loadFriendsRecommended(
  authedUserId: string,
  self: FriendsProfile | null,
): Promise<DiscoverProfileItem[]> {
  const pool = await fetchFriendsDiscoverPool(authedUserId, self);
  const items = pool.map(friendsRowToItem);
  return getOrCreateDailySectionItems(
    "friends",
    "recommended",
    items,
    DISCOVER_LIMITS.categoryPerDay,
  );
}

export async function loadFriendsSameInterests(
  authedUserId: string,
  self: FriendsProfile | null,
  selfInterests: string[],
): Promise<DiscoverProfileItem[]> {
  const pool = await fetchFriendsDiscoverPool(authedUserId, self);
  const ranked = pool
    .map((row) => ({ row, overlap: sharedCount(selfInterests, row.interests ?? []) }))
    .filter((x) => x.overlap > 0)
    .sort((a, b) => b.overlap - a.overlap)
    .map((x) => friendsRowToItem(x.row));

  return getOrCreateDailySectionItems(
    "friends",
    "same_interests",
    ranked,
    DISCOVER_LIMITS.categoryPerDay,
  );
}

export async function loadFriendsSameGoals(
  authedUserId: string,
  self: FriendsProfile | null,
  selfGoals: string[],
): Promise<DiscoverProfileItem[]> {
  const pool = await fetchFriendsDiscoverPool(authedUserId, self);
  const ranked = pool
    .map((row) => ({
      row,
      overlap: sharedCount(selfGoals, meetupGoalsFromMeta(row.meta)),
    }))
    .filter((x) => x.overlap > 0)
    .sort((a, b) => b.overlap - a.overlap)
    .map((x) => friendsRowToItem(x.row));

  return getOrCreateDailySectionItems(
    "friends",
    "same_goals",
    ranked,
    DISCOVER_LIMITS.categoryPerDay,
  );
}

export async function loadFriendsNearby(
  authedUserId: string,
  self: FriendsProfile | null,
  selfCity?: string | null,
): Promise<DiscoverProfileItem[]> {
  const pool = await fetchFriendsDiscoverPool(authedUserId, self);
  const cityNorm = selfCity?.trim().toLowerCase() ?? "";
  const ranked = [...pool]
    .sort((a, b) => {
      if (!cityNorm) return 0;
      const aMatch = (a.city ?? "").trim().toLowerCase() === cityNorm ? 0 : 1;
      const bMatch = (b.city ?? "").trim().toLowerCase() === cityNorm ? 0 : 1;
      return aMatch - bMatch;
    })
    .map(friendsRowToItem);

  return getOrCreateDailySectionItems("friends", "nearby", ranked, DISCOVER_LIMITS.categoryPerDay);
}
