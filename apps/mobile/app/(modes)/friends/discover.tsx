// Friends Discover — five horizontal categories (scroll vertically between rows).

import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  ActivityIndicator,
  Alert,
  ScrollView,
  RefreshControl,
} from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { usePostHog } from "posthog-react-native";

import { ModeHeader } from "@/components/layout/ModeHeader";
import { FriendsBottomNav } from "@/components/layout/FriendsBottomNav";
import { Colors } from "@/constants/tokens";
import { supabase } from "@/lib/supabase";
import { type FriendsProfile } from "@/lib/ai/friendsInsights";
import { useModeContext } from "@/providers";
import { getBlockedUserIdSet } from "@/lib/access/blocks";
import { DiscoverHorizontalSection } from "@/components/discover/DiscoverHorizontalSection";
import { DiscoverBusinessOffersSection } from "@/components/business/DiscoverBusinessOffersSection";
import { DiscoverModeToggle, type DiscoverViewMode } from "@/components/discover/DiscoverModeToggle";
import { TopPicksSection } from "@/components/discover/TopPicksSection";
import type { DiscoverTopPick } from "@/lib/discover/topPicks";
import { discoverOpen } from "@/lib/discover/analytics";
import { meetupGoalsFromMeta } from "@/lib/discover/metaGoals";
import {
  friendsRowToItem,
  loadFriendsNearby,
  loadFriendsRecommended,
  loadFriendsSameGoals,
  loadFriendsSameInterests,
  loadFriendsTopPicks,
} from "@/lib/discover/friendsDiscoverSections";
import type { DiscoverProfileItem } from "@/lib/discover/types";

type FriendProfileRow = {
  id: string;
  user_id?: string;
  display_name: string;
  age?: number | null;
  vibe_tags?: string[] | null;
  interests?: string[] | null;
  main_photo_url?: string | null;
  avatar_url?: string | null;
};

export default function FriendsDiscover() {
  const router = useRouter();
  const posthog = usePostHog();
  const { context } = useModeContext();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [wantToConnect, setWantToConnect] = useState<DiscoverProfileItem[]>([]);
  const [recommended, setRecommended] = useState<DiscoverProfileItem[]>([]);
  const [sameInterests, setSameInterests] = useState<DiscoverProfileItem[]>([]);
  const [sameGoals, setSameGoals] = useState<DiscoverProfileItem[]>([]);
  const [nearby, setNearby] = useState<DiscoverProfileItem[]>([]);

  // "Top 3 for you" is the landing state; the full category rows are a deliberate "See all".
  const [viewMode, setViewMode] = useState<DiscoverViewMode>("top");
  const [topPicks, setTopPicks] = useState<DiscoverTopPick[]>([]);

  const subscriptionTier = context.subscription_tier ?? "free";
  const canViewFull = ["super", "premium", "enterprise"].includes(subscriptionTier);

  const loadWantToConnect = useCallback(async (userId: string): Promise<DiscoverProfileItem[]> => {
    const { data: followMe } = await supabase
      .from("follows")
      .select("follower_id")
      .eq("followee_id", userId);
    const followerIds = (followMe ?? []).map((r: { follower_id: string }) => r.follower_id);
    if (followerIds.length === 0) return [];

    const { data: iFollow } = await supabase
      .from("follows")
      .select("followee_id")
      .eq("follower_id", userId);
    const iFollowIds = new Set((iFollow ?? []).map((r: { followee_id: string }) => r.followee_id));
    const wantIds = followerIds.filter((id: string) => !iFollowIds.has(id));
    if (wantIds.length === 0) return [];

    const { data: fp } = await supabase
      .from("friend_profiles")
      .select("id,user_id,display_name,age,vibe_tags,interests,main_photo_url,avatar_url")
      .in("user_id", wantIds);

    return ((fp ?? []) as FriendProfileRow[]).map((r) => friendsRowToItem(r));
  }, []);

  const loadData = useCallback(async () => {
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData?.user) return;

      const uid = userData.user.id;
      const blocked = await getBlockedUserIdSet(uid);

      const [{ data: me }, { data: core }] = await Promise.all([
        supabase
          .from("profiles_mode")
          .select("interests, meta")
          .eq("user_id", uid)
          .eq("mode", "friends")
          .maybeSingle(),
        supabase.from("user_profiles").select("city").eq("id", uid).maybeSingle(),
      ]);

      const self: FriendsProfile | null = me
        ? {
            id: uid,
            interests: (me.interests as string[]) ?? [],
            vibe_tags: (me.meta as { vibe_tags?: string[] })?.vibe_tags,
            city: (me.meta as { city?: string })?.city ?? (core as { city?: string } | null)?.city,
          }
        : null;

      const selfInterests = (me?.interests as string[]) ?? [];
      const selfGoals = meetupGoalsFromMeta(me?.meta);
      const selfCity =
        (me?.meta as { city?: string })?.city ?? (core as { city?: string } | null)?.city ?? null;

      const [wantList, recList, interestsList, goalsList, nearbyList, picksList] = await Promise.all([
        loadWantToConnect(uid),
        loadFriendsRecommended(uid, self),
        loadFriendsSameInterests(uid, self, selfInterests),
        loadFriendsSameGoals(uid, self, selfGoals),
        loadFriendsNearby(uid, self, selfCity),
        loadFriendsTopPicks(uid, self, selfInterests, selfGoals, selfCity),
      ]);

      const filterBlocked = (list: DiscoverProfileItem[]) => list.filter((p) => !blocked.has(p.id));

      setWantToConnect(filterBlocked(wantList));
      setRecommended(filterBlocked(recList));
      setSameInterests(filterBlocked(interestsList));
      setSameGoals(filterBlocked(goalsList));
      setNearby(filterBlocked(nearbyList));
      setTopPicks(picksList.filter((p) => !blocked.has(p.id)));
    } catch (err) {
      console.warn("FriendsDiscover loadData error", err);
      Alert.alert("Error", "Could not load discover.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [loadWantToConnect]);

  useEffect(() => {
    setLoading(true);
    loadData();
  }, [loadData]);

  useFocusEffect(
    useCallback(() => {
      discoverOpen(posthog ?? null, "friends");
      loadData();
    }, [loadData, posthog]),
  );

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const primaryColor = Colors.friends.primary;
  const openProfile = (item: DiscoverProfileItem) =>
    router.push(`/(modes)/friends/profile-view?user_id=${item.id}&source=discover`);

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: Colors.backgroundLight }}>
        <ModeHeader currentMode="friends" />
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator size="large" color={primaryColor} />
        </View>
        <FriendsBottomNav />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: Colors.backgroundLight }}>
      <ModeHeader currentMode="friends" />

      <DiscoverModeToggle value={viewMode} onChange={setViewMode} primaryColor={primaryColor} />

      <ScrollView
        style={{ flex: 1 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={primaryColor} />
        }
        contentContainerStyle={{ paddingTop: 8, paddingBottom: 32 }}
      >
        {viewMode === "top" ? (
          <TopPicksSection
            picks={topPicks.map((p) => ({
              id: p.id,
              title: p.name,
              subtitle: p.age != null ? String(p.age) : null,
              photoUrl: p.photoUrl,
              fitReason: p.fitReason,
            }))}
            loading={false}
            primaryColor={primaryColor}
            subheading="People you'll click with — start here instead of scrolling."
            emptyText="No standout matches yet. Tap See all to browse everyone."
            placeholderEmoji="👋"
            onPressPick={(id) => router.push(`/(modes)/friends/profile-view?user_id=${id}&source=discover`)}
            onSeeAll={() => setViewMode("all")}
            seeAllLabel="See all"
          />
        ) : (
          <>
        <DiscoverBusinessOffersSection source="friends_discover" />

        <DiscoverHorizontalSection
          mode="friends"
          title={`Want to connect (${wantToConnect.length})`}
          items={wantToConnect}
          primaryColor={primaryColor}
          variant="liked_you"
          canViewFull={canViewFull}
          onViewProfile={openProfile}
        />

        <DiscoverHorizontalSection
          mode="friends"
          title="Recommended by Winkly"
          items={recommended}
          primaryColor={primaryColor}
          variant="recommended"
          canViewFull={canViewFull}
          onViewProfile={openProfile}
        />

        <DiscoverHorizontalSection
          mode="friends"
          title="Same Interests"
          items={sameInterests}
          primaryColor={primaryColor}
          variant="category"
          canViewFull
          onViewProfile={openProfile}
        />

        <DiscoverHorizontalSection
          mode="friends"
          title="Same meetup goals"
          items={sameGoals}
          primaryColor={primaryColor}
          variant="category"
          canViewFull
          onViewProfile={openProfile}
        />

        <DiscoverHorizontalSection
          mode="friends"
          title="New people nearby"
          items={nearby}
          primaryColor={primaryColor}
          variant="category"
          canViewFull
          onViewProfile={openProfile}
        />
          </>
        )}
      </ScrollView>

      <FriendsBottomNav />
    </View>
  );
}
