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
import { chatRoutes } from "@/lib/navigation/modeHub";
import { usePostHog } from "posthog-react-native";

import { ModeHeader } from "@/components/layout/ModeHeader";
import { FriendsBottomNav } from "@/components/layout/FriendsBottomNav";
import { Colors } from "@/constants/tokens";
import { supabase } from "@/lib/supabase";
import { type FriendsProfile } from "@/lib/ai/friendsInsights";
import { friendsFollowProfile } from "@/lib/access/connections";
import { blockUser, reportUser } from "@/lib/chats";
import { useModeContext } from "@/providers";
import { getBlockedUserIdSet } from "@/lib/access/blocks";
import { DiscoverHorizontalSection } from "@/components/discover/DiscoverHorizontalSection";
import { DiscoverBusinessOffersSection } from "@/components/business/DiscoverBusinessOffersSection";
import {
  discoverOpen,
  likedYouLikeBack,
  recommendationLike,
  discoverProfileBlock,
  discoverProfileReport,
  recommendationLimitReached,
} from "@/lib/discover/analytics";
import {
  getRecommendationLikesSentToday,
  incrementRecommendationLikeSentToday,
} from "@/lib/discover/storage";
import { meetupGoalsFromMeta } from "@/lib/discover/metaGoals";
import {
  friendsRowToItem,
  loadFriendsNearby,
  loadFriendsRecommended,
  loadFriendsSameGoals,
  loadFriendsSameInterests,
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
  const [likesUsedToday, setLikesUsedToday] = useState(0);

  const subscriptionTier = context.subscription_tier ?? "free";
  const canViewFull = ["super", "premium", "enterprise"].includes(subscriptionTier);
  const canLikeUnlimited = canViewFull;

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

      const [wantList, recList, interestsList, goalsList, nearbyList] = await Promise.all([
        loadWantToConnect(uid),
        loadFriendsRecommended(uid, self),
        loadFriendsSameInterests(uid, self, selfInterests),
        loadFriendsSameGoals(uid, self, selfGoals),
        loadFriendsNearby(uid, self, selfCity),
      ]);

      const filterBlocked = (list: DiscoverProfileItem[]) => list.filter((p) => !blocked.has(p.id));

      setWantToConnect(filterBlocked(wantList));
      setRecommended(filterBlocked(recList));
      setSameInterests(filterBlocked(interestsList));
      setSameGoals(filterBlocked(goalsList));
      setNearby(filterBlocked(nearbyList));

      const used = await getRecommendationLikesSentToday("friends");
      setLikesUsedToday(used);
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
  }, []);

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

  const removeFromAll = (id: string) => {
    const drop = (prev: DiscoverProfileItem[]) => prev.filter((p) => p.id !== id);
    setWantToConnect(drop);
    setRecommended(drop);
    setSameInterests(drop);
    setSameGoals(drop);
    setNearby(drop);
  };

  const handleConnectBack = async (item: DiscoverProfileItem) => {
    try {
      const res = await friendsFollowProfile(item.id);
      likedYouLikeBack(posthog ?? null, "friends", item.id);
      removeFromAll(item.id);
      if (res.is_connection && res.chat_id) {
        router.push(chatRoutes.conversation("friends", res.chat_id) as Parameters<typeof router.push>[0]);
      }
    } catch (e) {
      Alert.alert("Error", (e as Error).message ?? "Could not connect.");
    }
  };

  const handleRecommendationLike = async (item: DiscoverProfileItem) => {
    if (!canLikeUnlimited && likesUsedToday >= 1) {
      recommendationLimitReached(posthog ?? null, "friends");
      return;
    }
    try {
      const res = await friendsFollowProfile(item.id);
      await incrementRecommendationLikeSentToday("friends");
      setLikesUsedToday((c) => c + 1);
      recommendationLike(posthog ?? null, "friends", item.id);
      removeFromAll(item.id);
      if (res.is_connection && res.chat_id) {
        router.push(chatRoutes.conversation("friends", res.chat_id) as Parameters<typeof router.push>[0]);
      }
    } catch (e) {
      Alert.alert("Error", (e as Error).message ?? "Could not send like.");
    }
  };

  const handleCategoryConnect = async (item: DiscoverProfileItem) => {
    try {
      const res = await friendsFollowProfile(item.id);
      removeFromAll(item.id);
      if (res.is_connection && res.chat_id) {
        router.push(chatRoutes.conversation("friends", res.chat_id) as Parameters<typeof router.push>[0]);
      }
    } catch (e) {
      Alert.alert("Error", (e as Error).message ?? "Could not connect.");
    }
  };

  const handleBlock = async (item: DiscoverProfileItem) => {
    try {
      await blockUser(item.id);
      discoverProfileBlock(posthog ?? null, "friends", item.id);
      removeFromAll(item.id);
    } catch (e) {
      Alert.alert("Error", (e as Error).message ?? "Could not block.");
    }
  };

  const handleReport = async (item: DiscoverProfileItem) => {
    try {
      await reportUser(item.id, "other", "Reported from Discover");
      discoverProfileReport(posthog ?? null, "friends", item.id);
      removeFromAll(item.id);
      Alert.alert("Report sent", "Thanks for helping keep Winkly safe.");
    } catch (e) {
      Alert.alert("Error", (e as Error).message ?? "Could not report.");
    }
  };

  const primaryColor = Colors.friends.primary;
  const openProfile = (item: DiscoverProfileItem) =>
    router.push(`/(modes)/friends/profile-view?user_id=${item.id}`);

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

      <ScrollView
        style={{ flex: 1 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={primaryColor} />
        }
        contentContainerStyle={{ paddingTop: 8, paddingBottom: 32 }}
      >
        <DiscoverBusinessOffersSection source="friends_discover" />

        <DiscoverHorizontalSection
          mode="friends"
          title={`Want to connect (${wantToConnect.length})`}
          items={wantToConnect}
          primaryColor={primaryColor}
          variant="liked_you"
          canViewFull={canViewFull}
          onPrimary={handleConnectBack}
          onViewProfile={openProfile}
          onBlock={handleBlock}
          onReport={handleReport}
        />

        <DiscoverHorizontalSection
          mode="friends"
          title="Recommended by Winkly"
          items={recommended}
          primaryColor={primaryColor}
          variant="recommended"
          canViewFull={canViewFull}
          canLikeUnlimited={canLikeUnlimited}
          likesUsedToday={likesUsedToday}
          onPrimary={handleRecommendationLike}
          onViewProfile={openProfile}
          onBlock={handleBlock}
          onReport={handleReport}
        />

        <DiscoverHorizontalSection
          mode="friends"
          title="Same Interests"
          items={sameInterests}
          primaryColor={primaryColor}
          variant="category"
          canViewFull
          onPrimary={handleCategoryConnect}
          onViewProfile={openProfile}
          onBlock={handleBlock}
          onReport={handleReport}
        />

        <DiscoverHorizontalSection
          mode="friends"
          title="Same meetup goals"
          items={sameGoals}
          primaryColor={primaryColor}
          variant="category"
          canViewFull
          onPrimary={handleCategoryConnect}
          onViewProfile={openProfile}
          onBlock={handleBlock}
          onReport={handleReport}
        />

        <DiscoverHorizontalSection
          mode="friends"
          title="New people nearby"
          items={nearby}
          primaryColor={primaryColor}
          variant="category"
          canViewFull
          onPrimary={handleCategoryConnect}
          onViewProfile={openProfile}
          onBlock={handleBlock}
          onReport={handleReport}
        />
      </ScrollView>

      <FriendsBottomNav />
    </View>
  );
}
