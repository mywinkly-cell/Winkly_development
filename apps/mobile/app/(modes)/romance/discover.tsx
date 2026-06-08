// Romance Discover — five horizontal categories (scroll vertically between rows).

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
import { RomanceBottomNav } from "@/components/layout/RomanceBottomNav";
import { Colors } from "@/constants/tokens";
import { supabase } from "@/lib/supabase";
import { type RomanceProfile } from "@/lib/ai/romanceInsights";
import { romanceLikeProfile, blockUser, reportUser } from "@/lib/chats";
import { useModeContext } from "@/providers";
import { DiscoverHorizontalSection } from "@/components/discover/DiscoverHorizontalSection";
import { DiscoverBusinessOffersSection } from "@/components/business/DiscoverBusinessOffersSection";
import {
  discoverOpen,
  likedYouLikeBack,
  recommendationLike,
  discoverProfileBlock,
  discoverProfileReport,
  matchCreatedFromDiscover,
  recommendationLimitReached,
} from "@/lib/discover/analytics";
import {
  getRecommendationLikesSentToday,
  incrementRecommendationLikeSentToday,
} from "@/lib/discover/storage";
import { getBlockedUserIdSet } from "@/lib/access/blocks";
import { relationshipGoalsFromMeta } from "@/lib/discover/metaGoals";
import {
  loadRomanceNearby,
  loadRomanceRecommended,
  loadRomanceSameGoals,
  loadRomanceSameInterests,
  romanceRowToItem,
} from "@/lib/discover/romanceDiscoverSections";
import type { DiscoverProfileItem } from "@/lib/discover/types";

type RomanceLikeReceived = {
  id: string;
  first_name?: string;
  last_name?: string;
  age?: number;
  romance_photos?: (string | null)[];
  core_photos?: (string | null)[];
};

export default function RomanceDiscover() {
  const router = useRouter();
  const posthog = usePostHog();
  const { context } = useModeContext();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [likedYou, setLikedYou] = useState<DiscoverProfileItem[]>([]);
  const [recommended, setRecommended] = useState<DiscoverProfileItem[]>([]);
  const [sameInterests, setSameInterests] = useState<DiscoverProfileItem[]>([]);
  const [sameGoals, setSameGoals] = useState<DiscoverProfileItem[]>([]);
  const [nearby, setNearby] = useState<DiscoverProfileItem[]>([]);
  const [likesUsedToday, setLikesUsedToday] = useState(0);

  const subscriptionTier = context.subscription_tier ?? "free";
  const canViewFull = ["super", "premium", "enterprise"].includes(subscriptionTier);
  const canLikeUnlimited = canViewFull;

  const loadLikedYou = useCallback(async (userId: string): Promise<DiscoverProfileItem[]> => {
    const { data, error } = await supabase.rpc("romance_likes_received", {
      current_user_id: userId,
    });
    if (error) return [];
    return ((data ?? []) as RomanceLikeReceived[]).map((row) =>
      romanceRowToItem({
        id: row.id,
        first_name: row.first_name ?? "Someone",
        last_name: row.last_name,
        age: row.age,
        romance_photos: row.romance_photos,
        core_photos: row.core_photos,
      }),
    );
  }, []);

  const loadData = useCallback(async () => {
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData?.user) return;

      const uid = userData.user.id;
      const blocked = await getBlockedUserIdSet(uid);

      const { data: me } = await supabase
        .from("public_profile_view")
        .select("*")
        .eq("id", uid)
        .single();

      const self: RomanceProfile | null = me
        ? {
            id: me.id,
            first_name: me.first_name,
            age: me.age,
            city: me.city,
            interests: me.interests,
            languages: me.languages,
            occupation: me.occupation,
            bio_romance: me.bio_romance,
          }
        : null;

      const selfInterests = [
        ...((me?.romance_interests as string[] | null) ?? []),
        ...((me?.interests as string[] | null) ?? []),
      ];
      const selfGoals = relationshipGoalsFromMeta(me?.romance_meta);

      const [likedList, recList, interestsList, goalsList, nearbyList] = await Promise.all([
        loadLikedYou(uid),
        loadRomanceRecommended(uid, self),
        loadRomanceSameInterests(uid, self, selfInterests),
        loadRomanceSameGoals(uid, self, selfGoals),
        loadRomanceNearby(uid, self),
      ]);

      const filterBlocked = (list: DiscoverProfileItem[]) => list.filter((p) => !blocked.has(p.id));

      setLikedYou(filterBlocked(likedList));
      setRecommended(filterBlocked(recList));
      setSameInterests(filterBlocked(interestsList));
      setSameGoals(filterBlocked(goalsList));
      setNearby(filterBlocked(nearbyList));

      const used = await getRecommendationLikesSentToday("romance");
      setLikesUsedToday(used);
    } catch (err) {
      console.warn("RomanceDiscover loadData error", err);
      Alert.alert("Error", "Could not load discover.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [loadLikedYou]);

  useEffect(() => {
    setLoading(true);
    loadData();
  }, []);

  useFocusEffect(
    useCallback(() => {
      discoverOpen(posthog ?? null, "romance");
      loadData();
    }, [loadData, posthog]),
  );

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const removeFromAll = (id: string) => {
    const drop = (prev: DiscoverProfileItem[]) => prev.filter((p) => p.id !== id);
    setLikedYou(drop);
    setRecommended(drop);
    setSameInterests(drop);
    setSameGoals(drop);
    setNearby(drop);
  };

  const handleLikeBack = async (item: DiscoverProfileItem) => {
    try {
      const result = await romanceLikeProfile(item.id);
      likedYouLikeBack(posthog ?? null, "romance", item.id);
      removeFromAll(item.id);
      if (result?.is_match) {
        matchCreatedFromDiscover(posthog ?? null, "romance", item.id);
        if (result.chat_id) {
          router.push(
            chatRoutes.conversation("romance", result.chat_id, { matchBridge: "1" }) as Parameters<
              typeof router.push
            >[0],
          );
        } else {
          Alert.alert("It's a match! 💖", "You both liked each other. Open Chats to say hi.");
        }
      }
    } catch (e) {
      Alert.alert("Error", (e as Error).message ?? "Could not send like.");
    }
  };

  const handleRecommendationLike = async (item: DiscoverProfileItem) => {
    if (!canLikeUnlimited && likesUsedToday >= 1) {
      recommendationLimitReached(posthog ?? null, "romance");
      return;
    }
    try {
      const result = await romanceLikeProfile(item.id);
      await incrementRecommendationLikeSentToday("romance");
      setLikesUsedToday((c) => c + 1);
      recommendationLike(posthog ?? null, "romance", item.id);
      removeFromAll(item.id);
      if (result?.is_match) {
        matchCreatedFromDiscover(posthog ?? null, "romance", item.id);
        if (result.chat_id) {
          router.push(
            chatRoutes.conversation("romance", result.chat_id, { matchBridge: "1" }) as Parameters<
              typeof router.push
            >[0],
          );
        } else {
          Alert.alert("It's a match! 💖", "Open Chats to say hi.");
        }
      }
    } catch (e) {
      Alert.alert("Error", (e as Error).message ?? "Could not send like.");
    }
  };

  const handleCategoryLike = async (item: DiscoverProfileItem) => {
    try {
      const result = await romanceLikeProfile(item.id);
      removeFromAll(item.id);
      if (result?.is_match) {
        matchCreatedFromDiscover(posthog ?? null, "romance", item.id);
        if (result.chat_id) {
          router.push(
            chatRoutes.conversation("romance", result.chat_id, { matchBridge: "1" }) as Parameters<
              typeof router.push
            >[0],
          );
        } else {
          Alert.alert("It's a match! 💖", "Open Chats to say hi.");
        }
      }
    } catch (e) {
      Alert.alert("Error", (e as Error).message ?? "Could not send like.");
    }
  };

  const handleBlock = async (item: DiscoverProfileItem) => {
    try {
      await blockUser(item.id);
      discoverProfileBlock(posthog ?? null, "romance", item.id);
      removeFromAll(item.id);
    } catch (e) {
      Alert.alert("Error", (e as Error).message ?? "Could not block.");
    }
  };

  const handleReport = async (item: DiscoverProfileItem) => {
    try {
      await reportUser(item.id, "other", "Reported from Discover");
      discoverProfileReport(posthog ?? null, "romance", item.id);
      removeFromAll(item.id);
      Alert.alert("Report sent", "Thanks for helping keep Winkly safe.");
    } catch (e) {
      Alert.alert("Error", (e as Error).message ?? "Could not report.");
    }
  };

  const primaryColor = Colors.romance.primary;
  const openProfile = (item: DiscoverProfileItem) =>
    router.push(`/(modes)/romance/profile-view?id=${item.id}`);

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: Colors.backgroundLight }}>
        <ModeHeader currentMode="romance" />
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator size="large" color={primaryColor} />
        </View>
        <RomanceBottomNav />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: Colors.backgroundLight }}>
      <ModeHeader currentMode="romance" />

      <ScrollView
        style={{ flex: 1 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={primaryColor} />
        }
        contentContainerStyle={{ paddingTop: 8, paddingBottom: 32 }}
      >
        <DiscoverBusinessOffersSection source="romance_discover" />

        <DiscoverHorizontalSection
          mode="romance"
          title={`Liked you (${likedYou.length})`}
          items={likedYou}
          primaryColor={primaryColor}
          variant="liked_you"
          canViewFull={canViewFull}
          onPrimary={handleLikeBack}
          onViewProfile={openProfile}
          onBlock={handleBlock}
          onReport={handleReport}
        />

        <DiscoverHorizontalSection
          mode="romance"
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
          mode="romance"
          title="Same Interests"
          items={sameInterests}
          primaryColor={primaryColor}
          variant="category"
          canViewFull
          onPrimary={handleCategoryLike}
          onViewProfile={openProfile}
          onBlock={handleBlock}
          onReport={handleReport}
        />

        <DiscoverHorizontalSection
          mode="romance"
          title="Same dating goals"
          items={sameGoals}
          primaryColor={primaryColor}
          variant="category"
          canViewFull
          onPrimary={handleCategoryLike}
          onViewProfile={openProfile}
          onBlock={handleBlock}
          onReport={handleReport}
        />

        <DiscoverHorizontalSection
          mode="romance"
          title="New people nearby"
          items={nearby}
          primaryColor={primaryColor}
          variant="category"
          canViewFull
          onPrimary={handleCategoryLike}
          onViewProfile={openProfile}
          onBlock={handleBlock}
          onReport={handleReport}
        />
      </ScrollView>

      <RomanceBottomNav />
    </View>
  );
}
