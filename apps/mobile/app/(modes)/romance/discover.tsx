// apps/mobile/app/(modes)/romance/discover.tsx
// Discover: People Who Liked You (Section 1) + Recommended for You by Winkly AI (Section 2).
// Mode colors and copy; analytics; block/report; match → Chats.

import React, { useEffect, useState, useCallback, useRef } from "react";
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
import { RomanceBottomNav } from "@/components/layout/RomanceBottomNav";
import { Colors, Typography, Layout } from "@/constants/tokens";
import { supabase } from "@/lib/supabase";
import {
  computeCompatibilityScore,
  buildMatchTags,
  type RomanceProfile,
} from "@/lib/ai/romanceInsights";
import {
  getRomanceAiMatchingEnabled,
  getRomanceFilters,
  applyRomanceFiltersToFeed,
} from "@/lib/filters/romanceFiltersStorage";
import { romanceLikeProfile } from "@/lib/chats";
import { blockUser, reportUser } from "@/lib/chats";
import { useModeContext } from "@/providers";
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
  matchCreatedFromDiscover,
  recommendationLimitReached,
} from "@/lib/discover/analytics";
import {
  getRecommendationLikesSentToday,
  incrementRecommendationLikeSentToday,
  DISCOVER_LIMITS,
} from "@/lib/discover/storage";
import { combinedMatchScore, fetchBehaviorAffinityMap } from "@/lib/matching/behaviorAffinities";
import { getBlockedUserIdSet } from "@/lib/access/blocks";

type RomanceLikeReceived = {
  id: string;
  first_name?: string;
  last_name?: string;
  age?: number;
  city?: string;
  interests?: string[];
  romance_photos?: (string | null)[];
  core_photos?: (string | null)[];
  occupation?: string;
  bio_romance?: string;
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

export default function RomanceDiscover() {
  const router = useRouter();
  const posthog = usePostHog();
  const { context } = useModeContext();

  const requireAuthedUserId = useCallback(async (): Promise<string> => {
    const { data } = await supabase.auth.getUser();
    const uid = data?.user?.id;
    if (!uid) throw new Error("Not signed in");
    return uid;
  }, []);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selfProfile, setSelfProfile] = useState<RomanceProfile | null>(null);
  const [peopleWhoLikedYou, setPeopleWhoLikedYou] = useState<PeopleWhoLikedYouItem[]>([]);
  const [recommendations, setRecommendations] = useState<RecommendedItem[]>([]);
  const [likesUsedToday, setLikesUsedToday] = useState(0);

  const subscriptionTier = context.subscription_tier ?? "free";
  const canViewFullLikedYou = ["super", "premium", "enterprise"].includes(subscriptionTier);
  const canLikeUnlimited = canViewFullLikedYou;

  const loadLikesReceived = useCallback(async (userId: string) => {
    const authed = await requireAuthedUserId();
    if (userId !== authed) {
      throw new Error("romance_likes_received called with mismatched user id");
    }
    const { data, error } = await supabase.rpc("romance_likes_received", {
      current_user_id: authed,
    });
    if (error) return [];
    const list = (data ?? []) as RomanceLikeReceived[];
    return list.map((row) => {
      const photo = row.romance_photos?.[0] ?? row.core_photos?.[0];
      const tag = row.occupation ?? (Array.isArray(row.interests) && row.interests[0]) ?? null;
      const name = [row.first_name, row.last_name].filter(Boolean).join(" ").trim() || "Someone";
      return {
        id: row.id,
        name,
        age: row.age ?? null,
        tag: tag ?? null,
        distance: null,
        photoUrl: photo ?? null,
      } as PeopleWhoLikedYouItem;
    });
  }, []);

  const loadRecommendations = useCallback(
    async (userId: string, self: RomanceProfile | null): Promise<RecommendedItem[]> => {
      const authed = await requireAuthedUserId();
      if (userId !== authed) {
        throw new Error("romance_discover_feed called with mismatched user id");
      }
      const { data: feedData, error } = await supabase.rpc("romance_discover_feed", {
        current_user_id: authed,
      });
      let rows: FeedRow[] = (feedData ?? []) as FeedRow[];
      if (error) {
        const { data: fallback } = await supabase
          .from("public_profile_view")
          .select("id, first_name, age, city, interests, languages, occupation, bio_romance, core_photos, romance_photos")
          .neq("id", authed)
          .limit(50);
        rows = (fallback || []) as FeedRow[];
        rows = rows.filter(
          (r) =>
            (Array.isArray(r.romance_photos) && r.romance_photos.some((p) => !!p)) ||
            (r.bio_romance != null && String(r.bio_romance).trim() !== "")
        );
        // When the RPC fails, we lose server-side filtering (e.g. blocks).
        // Apply a best-effort local exclusion to avoid showing blocked users.
        try {
          const blocked = await getBlockedUserIdSet(authed);
          rows = rows.filter((r) => !blocked.has(r.id));
        } catch {
          // ignore
        }
      }

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
      const filtered = applyRomanceFiltersToFeed(scored, filters);
      const aiOn = await getRomanceAiMatchingEnabled();
      if (aiOn) {
        const ids = filtered.map((r) => r.id);
        const affMap = await fetchBehaviorAffinityMap(authed, ids, "romance");
        filtered.sort((a, b) => {
          const ca = a.compatibility ?? 72;
          const cb = b.compatibility ?? 72;
          const sa = combinedMatchScore(ca, affMap.get(a.id) ?? 0.5);
          const sb = combinedMatchScore(cb, affMap.get(b.id) ?? 0.5);
          return sb - sa;
        });
      }

      const take = DISCOVER_LIMITS.recommendationsPerDay;
      return filtered.slice(0, take).map((r) => {
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
        const tags = buildMatchTags({ self: self ?? undefined, other });
        const photo = r.romance_photos?.[0] ?? r.core_photos?.[0];
        return {
          id: r.id,
          name: r.first_name ?? "Someone",
          age: r.age ?? null,
          location: r.city ? `${r.city}` : null,
          compatibility: r.compatibility ?? null,
          sharedInterests: (r.interests ?? []).slice(0, 3),
          lifestyleTag: tags[0] ?? null,
          goalSnippet: r.bio_romance ? r.bio_romance.slice(0, 80) + (r.bio_romance.length > 80 ? "…" : "") : null,
          photoUrl: photo ?? null,
        } as RecommendedItem;
      });
    },
    [requireAuthedUserId]
  );

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
      setSelfProfile(self);

      const [likedYouList, recList] = await Promise.all([
        loadLikesReceived(uid),
        loadRecommendations(uid, self),
      ]);

      setPeopleWhoLikedYou(likedYouList.filter((p) => !blocked.has(p.id)));
      setRecommendations(recList.filter((r) => !blocked.has(r.id)));

      const used = await getRecommendationLikesSentToday("romance");
      setLikesUsedToday(used);
    } catch (err) {
      console.warn("RomanceDiscover loadData error", err);
      Alert.alert("Error", "Could not load discover.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [loadLikesReceived, loadRecommendations]);

  useEffect(() => {
    setLoading(true);
    loadData();
  }, []);

  useFocusEffect(
    useCallback(() => {
      discoverOpen(posthog ?? null, "romance");
      loadData();
    }, [loadData, posthog])
  );

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const handleLikeBack = async (item: PeopleWhoLikedYouItem) => {
    try {
      const result = await romanceLikeProfile(item.id);
      likedYouLikeBack(posthog ?? null, "romance", item.id);
      if (result?.is_match) {
        matchCreatedFromDiscover(posthog ?? null, "romance", item.id);
        setPeopleWhoLikedYou((prev) => prev.filter((p) => p.id !== item.id));
        if (result.chat_id) {
          router.push(
            chatRoutes.conversation("romance", result.chat_id, { matchBridge: "1" }) as Parameters<
              typeof router.push
            >[0]
          );
        }
        else Alert.alert("It's a match! 💖", "You both liked each other. Open Chats to say hi.");
      } else {
        setPeopleWhoLikedYou((prev) => prev.filter((p) => p.id !== item.id));
      }
    } catch (e) {
      Alert.alert("Error", (e as Error).message ?? "Could not send like.");
    }
  };

  const handleRecommendationLike = async (item: RecommendedItem) => {
    if (!canLikeUnlimited && likesUsedToday >= 1) {
      recommendationLimitReached(posthog ?? null, "romance");
      return;
    }
    try {
      const result = await romanceLikeProfile(item.id);
      await incrementRecommendationLikeSentToday("romance");
      setLikesUsedToday((c) => c + 1);
      recommendationLike(posthog ?? null, "romance", item.id);
      setRecommendations((prev) => prev.filter((p) => p.id !== item.id));
      if (result?.is_match) {
        matchCreatedFromDiscover(posthog ?? null, "romance", item.id);
        if (result.chat_id) {
          router.push(
            chatRoutes.conversation("romance", result.chat_id, { matchBridge: "1" }) as Parameters<
              typeof router.push
            >[0]
          );
        }
        else Alert.alert("It's a match! 💖", "Open Chats to say hi.");
      }
    } catch (e) {
      Alert.alert("Error", (e as Error).message ?? "Could not send like.");
    }
  };

  const handleBlock = async (item: { id: string }) => {
    try {
      await blockUser(item.id);
      discoverProfileBlock(posthog ?? null, "romance", item.id);
      setPeopleWhoLikedYou((prev) => prev.filter((p) => p.id !== item.id));
      setRecommendations((prev) => prev.filter((p) => p.id !== item.id));
    } catch (e) {
      Alert.alert("Error", (e as Error).message ?? "Could not block.");
    }
  };

  const handleReport = async (item: { id: string }) => {
    try {
      await reportUser(item.id, "other", "Reported from Discover");
      discoverProfileReport(posthog ?? null, "romance", item.id);
      setPeopleWhoLikedYou((prev) => prev.filter((p) => p.id !== item.id));
      setRecommendations((prev) => prev.filter((p) => p.id !== item.id));
      Alert.alert("Report sent", "Thanks for helping keep Winkly safe.");
    } catch (e) {
      Alert.alert("Error", (e as Error).message ?? "Could not report.");
    }
  };

  const primaryColor = Colors.romance.primary;

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
        contentContainerStyle={{ paddingBottom: 24 }}
      >
        <DiscoverPeopleWhoLikedYou
          mode="romance"
          items={peopleWhoLikedYou}
          canViewFull={canViewFullLikedYou}
          primaryColor={primaryColor}
          sectionTitle="People Who Liked You"
          onLikeBack={handleLikeBack}
          onViewProfile={(item) => router.push(`/(modes)/romance/profile-view?id=${item.id}`)}
          onBlock={handleBlock}
          onReport={handleReport}
        />

        <DiscoverRecommendedSection
          mode="romance"
          items={recommendations}
          remainingToday={recommendations.length}
          totalPerDay={DISCOVER_LIMITS.recommendationsPerDay}
          primaryColor={primaryColor}
          canLikeUnlimited={canLikeUnlimited}
          likesUsedToday={likesUsedToday}
          onSendLike={handleRecommendationLike}
          onViewProfile={(item) => router.push(`/(modes)/romance/profile-view?id=${item.id}`)}
          onBlock={handleBlock}
          onReport={handleReport}
        />

        {peopleWhoLikedYou.length === 0 && recommendations.length === 0 && (
          <View style={{ paddingHorizontal: 20, paddingVertical: 32, alignItems: "center" }}>
            <Text style={{ ...Typography.body, color: Colors.gray700, textAlign: "center", lineHeight: 22 }}>
              Nothing new here yet. Keep swiping on Home — we will add more strong fits as they appear.
            </Text>
          </View>
        )}
      </ScrollView>

      <RomanceBottomNav />
    </View>
  );
}
