// Friends Discover: People Who Want to Connect (Section 1) + Recommended for You by Winkly AI (Section 2).
// Mode colors and copy; analytics; block/report; connect → Chats.

import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
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
import { Colors, Typography } from "@/constants/tokens";
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
import { friendsFollowProfile } from "@/lib/access/connections";
import { combinedMatchScore, fetchBehaviorAffinityMap } from "@/lib/matching/behaviorAffinities";
import { blockUser, reportUser } from "@/lib/chats";
import { useModeContext } from "@/providers";
import { getBlockedUserIdSet } from "@/lib/access/blocks";
import {
  DiscoverPeopleWhoLikedYou,
  type PeopleWhoLikedYouItem,
} from "@/components/discover/DiscoverPeopleWhoLikedYou";
import {
  DiscoverRecommendedSection,
  type RecommendedItem,
} from "@/components/discover/DiscoverRecommendedSection";
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
  DISCOVER_LIMITS,
} from "@/lib/discover/storage";

type FriendProfileRow = {
  id: string;
  user_id?: string;
  display_name: string;
  city?: string | null;
  interests?: string[] | null;
  vibe_tags?: string[] | null;
  about_short?: string | null;
  main_photo_url?: string | null;
  avatar_url?: string | null;
};

export default function FriendsDiscover() {
  const router = useRouter();
  const posthog = usePostHog();
  const { context } = useModeContext();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selfProfile, setSelfProfile] = useState<FriendsProfile | null>(null);
  const [peopleWhoWantToConnect, setPeopleWhoWantToConnect] = useState<PeopleWhoLikedYouItem[]>([]);
  const [recommendations, setRecommendations] = useState<RecommendedItem[]>([]);
  const [likesUsedToday, setLikesUsedToday] = useState(0);

  const subscriptionTier = context.subscription_tier ?? "free";
  const canViewFull = ["super", "premium", "enterprise"].includes(subscriptionTier);
  const canLikeUnlimited = canViewFull;

  const loadPeopleWhoWantToConnect = useCallback(async (userId: string) => {
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
    const wantToConnectIds = followerIds.filter((id: string) => !iFollowIds.has(id));
    if (wantToConnectIds.length === 0) return [];

    const { data: fp } = await supabase
      .from("friend_profiles")
      .select("id,user_id,display_name,city,vibe_tags,about_short,interests,main_photo_url,avatar_url")
      .in("user_id", wantToConnectIds);

    const rows = (fp ?? []) as FriendProfileRow[];
    return rows.map((r) => ({
      id: r.user_id ?? r.id,
      name: r.display_name ?? "Someone",
      age: null,
      tag: (r.vibe_tags?.[0] ?? r.interests?.[0]) ?? null,
      distance: null,
      photoUrl: r.main_photo_url ?? r.avatar_url ?? null,
    })) as PeopleWhoLikedYouItem[];
  }, []);

  const loadRecommendations = useCallback(
    async (userId: string, self: FriendsProfile | null): Promise<RecommendedItem[]> => {
      const { data: feedData, error: rpcErr } = await supabase.rpc("friends_discover_feed", {
        current_user_id: userId,
        p_limit: 80,
      });

      let rows: FriendProfileRow[] = [];
      if (!rpcErr && Array.isArray(feedData) && feedData.length > 0) {
        rows = feedData as FriendProfileRow[];
      } else {
        const { data: iFollow } = await supabase
          .from("follows")
          .select("followee_id")
          .eq("follower_id", userId);
        const iFollowIds = new Set((iFollow ?? []).map((r: { followee_id: string }) => r.followee_id));

        const { data: fpData } = await supabase
          .from("friend_profiles")
          .select("id,user_id,display_name,city,vibe_tags,about_short,interests,main_photo_url,avatar_url")
          .order("created_at", { ascending: false })
          .limit(50);

        rows = (fpData ?? []).filter(
          (r: { user_id?: string; id: string }) => (r.user_id ?? r.id) !== userId,
        ) as FriendProfileRow[];
        rows = rows.filter((r) => !iFollowIds.has(r.user_id ?? r.id));
      }

      const scored = rows.map((r) => {
        const other: FriendsProfile = {
          id: r.user_id ?? r.id,
          display_name: r.display_name,
          city: r.city ?? undefined,
          interests: r.interests ?? [],
          vibe_tags: r.vibe_tags ?? [],
          about: r.about_short ?? undefined,
        };
        const compatibility = computeFriendsCompatibility({ self: self ?? undefined, other });
        return { ...r, compatibility };
      });

      const filters = await getFriendsFilters();
      const filtered = applyFriendsFiltersToFeed(scored, filters);

      const aiFriends = await getFriendsAiMatchingEnabled();
      if (aiFriends) {
        const ids = filtered.map((r) => r.user_id ?? r.id).filter(Boolean) as string[];
        const affMap = await fetchBehaviorAffinityMap(userId, ids, "friends");
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

      const take = DISCOVER_LIMITS.recommendationsPerDay;
      return filtered.slice(0, take).map((r) => {
        const other: FriendsProfile = {
          id: r.user_id ?? r.id,
          display_name: r.display_name,
          city: r.city ?? undefined,
          interests: r.interests ?? [],
          vibe_tags: r.vibe_tags ?? [],
          about: r.about_short ?? undefined,
        };
        const tags = buildFriendsMatchTags({ self: self ?? undefined, other });
        const photo = r.main_photo_url ?? r.avatar_url ?? null;
        return {
          id: r.user_id ?? r.id,
          name: r.display_name ?? "Someone",
          age: null,
          location: r.city ?? null,
          compatibility: (r as { compatibility?: number }).compatibility ?? null,
          sharedInterests: [...(r.interests ?? []).slice(0, 2), ...(r.vibe_tags ?? []).slice(0, 1)].slice(0, 3),
          lifestyleTag: tags[0] ?? null,
          goalSnippet: r.about_short ? r.about_short.slice(0, 80) + (r.about_short.length > 80 ? "…" : "") : null,
          photoUrl: photo ?? null,
        } as RecommendedItem;
      });
    },
    []
  );

  const loadData = useCallback(async () => {
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData?.user) return;

      const uid = userData.user.id;
      const blocked = await getBlockedUserIdSet(uid);

      const { data: me } = await supabase
        .from("profiles_mode")
        .select("interests, meta")
        .eq("user_id", uid)
        .eq("mode", "friends")
        .maybeSingle();

      const self: FriendsProfile | null = me
        ? {
            id: uid,
            interests: (me.interests as string[]) ?? [],
            vibe_tags: (me.meta as { vibe_tags?: string[] })?.vibe_tags,
            city: (me.meta as { city?: string })?.city,
          }
        : null;
      setSelfProfile(self);

      const [wantToConnectList, recList] = await Promise.all([
        loadPeopleWhoWantToConnect(uid),
        loadRecommendations(uid, self),
      ]);

      setPeopleWhoWantToConnect(wantToConnectList.filter((p) => !blocked.has(p.id)));
      setRecommendations(recList.filter((r) => !blocked.has(r.id)));

      const used = await getRecommendationLikesSentToday("friends");
      setLikesUsedToday(used);
    } catch (err) {
      console.warn("FriendsDiscover loadData error", err);
      Alert.alert("Error", "Could not load discover.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [loadPeopleWhoWantToConnect, loadRecommendations]);

  useEffect(() => {
    setLoading(true);
    loadData();
  }, []);

  useFocusEffect(
    useCallback(() => {
      discoverOpen(posthog ?? null, "friends");
      loadData();
    }, [loadData, posthog])
  );

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const handleConnectBack = async (item: PeopleWhoLikedYouItem) => {
    try {
      const res = await friendsFollowProfile(item.id);
      likedYouLikeBack(posthog ?? null, "friends", item.id);
      setPeopleWhoWantToConnect((prev) => prev.filter((p) => p.id !== item.id));
      if (res.is_connection && res.chat_id) {
        router.push(
          chatRoutes.conversation("friends", res.chat_id) as Parameters<typeof router.push>[0]
        );
      }
    } catch (e) {
      Alert.alert("Error", (e as Error).message ?? "Could not connect.");
    }
  };

  const handleRecommendationLike = async (item: RecommendedItem) => {
    if (!canLikeUnlimited && likesUsedToday >= 1) {
      recommendationLimitReached(posthog ?? null, "friends");
      return;
    }
    try {
      const res = await friendsFollowProfile(item.id);
      await incrementRecommendationLikeSentToday("friends");
      setLikesUsedToday((c) => c + 1);
      recommendationLike(posthog ?? null, "friends", item.id);
      setRecommendations((prev) => prev.filter((p) => p.id !== item.id));
      if (res.is_connection && res.chat_id) {
        router.push(
          chatRoutes.conversation("friends", res.chat_id) as Parameters<typeof router.push>[0]
        );
      }
    } catch (e) {
      Alert.alert("Error", (e as Error).message ?? "Could not send like.");
    }
  };

  const handleBlock = async (item: { id: string }) => {
    try {
      await blockUser(item.id);
      discoverProfileBlock(posthog ?? null, "friends", item.id);
      setPeopleWhoWantToConnect((prev) => prev.filter((p) => p.id !== item.id));
      setRecommendations((prev) => prev.filter((p) => p.id !== item.id));
    } catch (e) {
      Alert.alert("Error", (e as Error).message ?? "Could not block.");
    }
  };

  const handleReport = async (item: { id: string }) => {
    try {
      await reportUser(item.id, "other", "Reported from Discover");
      discoverProfileReport(posthog ?? null, "friends", item.id);
      setPeopleWhoWantToConnect((prev) => prev.filter((p) => p.id !== item.id));
      setRecommendations((prev) => prev.filter((p) => p.id !== item.id));
      Alert.alert("Report sent", "Thanks for helping keep Winkly safe.");
    } catch (e) {
      Alert.alert("Error", (e as Error).message ?? "Could not report.");
    }
  };

  const primaryColor = Colors.friends.primary;

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
        contentContainerStyle={{ paddingBottom: 24 }}
      >
        <DiscoverPeopleWhoLikedYou
          mode="friends"
          items={peopleWhoWantToConnect}
          canViewFull={canViewFull}
          primaryColor={primaryColor}
          sectionTitle="People Who Want to Connect"
          onLikeBack={handleConnectBack}
          onViewProfile={(item) => router.push(`/(modes)/friends/profile-view?user_id=${item.id}`)}
          onBlock={handleBlock}
          onReport={handleReport}
        />

        <DiscoverRecommendedSection
          mode="friends"
          items={recommendations}
          remainingToday={recommendations.length}
          totalPerDay={DISCOVER_LIMITS.recommendationsPerDay}
          primaryColor={primaryColor}
          canLikeUnlimited={canLikeUnlimited}
          likesUsedToday={likesUsedToday}
          onSendLike={handleRecommendationLike}
          onViewProfile={(item) => router.push(`/(modes)/friends/profile-view?user_id=${item.id}`)}
          onBlock={handleBlock}
          onReport={handleReport}
        />

        {peopleWhoWantToConnect.length === 0 && recommendations.length === 0 && (
          <View style={{ paddingHorizontal: 20, paddingVertical: 32, alignItems: "center" }}>
            <Text style={{ ...Typography.body, color: Colors.gray700, textAlign: "center", lineHeight: 22 }}>
              Nothing new here yet. Keep exploring on Home — we will surface more friend fits when they are ready.
            </Text>
          </View>
        )}
      </ScrollView>

      <FriendsBottomNav />
    </View>
  );
}
