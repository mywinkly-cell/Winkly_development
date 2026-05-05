// apps/mobile/app/(modes)/romance/discover.tsx
// ────────────────────────────────────────────────
// Winkly Romance Mode – Discover Screen (v7.1 AI)
// © 2025 Winkly Technologies UG (haftungsbeschränkt)
// Purpose:
//   • Main "swiping" / discovery surface for Romance
//   • Shows AI-ordered profiles from romance_discover_feed
//   • Uses compatibility score + match tags
//   • Like / Pass actions (with Supabase RPC stubs)
//   • Consistent header
// ────────────────────────────────────────────────

import React, { useEffect, useState, useMemo } from "react";
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Dimensions,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import { ModeHeader } from "@/components/layout/ModeHeader";
import { RomanceBottomNav } from "@/components/layout/RomanceBottomNav";
import { Colors, Typography, Layout } from "@/constants/tokens";
import { supabase } from "@/lib/supabase";
import {
  computeCompatibilityScore,
  buildMatchTags,
  type RomanceProfile,
} from "@/lib/ai/romanceInsights";

const { width } = Dimensions.get("window");

type FeedItem = {
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

  const [loading, setLoading] = useState(true);
  const [selfProfile, setSelfProfile] = useState<RomanceProfile | null>(null);
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [likeInProgress, setLikeInProgress] = useState(false);

  // ────────────────────────────────────────────────
  // Load self profile + AI discover feed
  // ────────────────────────────────────────────────
  const loadData = async () => {
    try {
      setLoading(true);
      const { data: userData } = await supabase.auth.getUser();
      if (!userData?.user) return;

      // Self profile
      const { data: me } = await supabase
        .from("public_profile_view")
        .select("*")
        .eq("id", userData.user.id)
        .single();

      if (me) {
        setSelfProfile({
          id: me.id,
          first_name: me.first_name,
          age: me.age,
          city: me.city,
          interests: me.interests,
          languages: me.languages,
          occupation: me.occupation,
          bio_romance: me.bio_romance,
          compatibility: me.compatibility,
        });
      }

      // Discover feed – AI-ordered in backend
      const { data: feedData, error } = await supabase.rpc(
        "romance_discover_feed",
        { current_user_id: userData.user.id }
      );

      if (error) {
        console.warn("romance_discover_feed error", error);
      }

      const items: FeedItem[] = (feedData || []) as FeedItem[];

      // Extra safety: re-score on client
      const scored = items.map((item) => {
        const other: RomanceProfile = {
          id: item.id,
          first_name: item.first_name,
          age: item.age ?? undefined,
          city: item.city ?? undefined,
          interests: item.interests || [],
          languages: item.languages || [],
          occupation: item.occupation || undefined,
          bio_romance: item.bio_romance || undefined,
          compatibility: item.compatibility ?? undefined,
        };

        const score = computeCompatibilityScore({
          self: selfProfile,
          other,
        });

        return {
          ...item,
          compatibility: score,
        };
      });

      scored.sort(
        (a, b) => (b.compatibility ?? 0) - (a.compatibility ?? 0)
      );

      setFeed(scored);
      setCurrentIndex(0);
    } catch (err) {
      console.warn("RomanceDiscover loadData error", err);
      Alert.alert("Error", "Could not load discover feed.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const currentItem = useMemo(
    () => (currentIndex < feed.length ? feed[currentIndex] : null),
    [feed, currentIndex]
  );

  // ────────────────────────────────────────────────
  // Handle Like / Pass
  // ────────────────────────────────────────────────
  const goToNext = () => {
    setCurrentIndex((prev) => prev + 1);
  };

  const handlePass = async () => {
    if (!currentItem) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    // Optional: supabase RPC for "pass"
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (userData?.user) {
        // Example RPC – adjust to your real function name/schema
        // await supabase.rpc("romance_pass_profile", {
        //   current_user_id: userData.user.id,
        //   target_user_id: currentItem.id,
        // });
      }
    } catch (err) {
      console.warn("Pass RPC error", err);
    }

    goToNext();
  };

  const handleLike = async () => {
    if (!currentItem || likeInProgress) return;
    setLikeInProgress(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      const { data: userData } = await supabase.auth.getUser();
      if (userData?.user) {
        // Example RPC – adjust to your real function name/schema
        // const { data, error } = await supabase.rpc("romance_like_profile", {
        //   current_user_id: userData.user.id,
        //   target_user_id: currentItem.id,
        // });
        // if (error) throw error;
        // if (data?.is_match) {
        //   Alert.alert("It's a match! 💖", "You both liked each other.");
        // }
      }
    } catch (err) {
      console.warn("Like RPC error", err);
    } finally {
      setLikeInProgress(false);
      goToNext();
    }
  };

  const handleOpenProfile = () => {
    if (!currentItem) return;
    router.push(`/(modes)/romance/profile-view?id=${currentItem.id}`);
  };

  // ────────────────────────────────────────────────
  // Card render (active profile)
// ────────────────────────────────────────────────
  const renderCard = () => {
    if (!currentItem) {
      return (
        <View
          style={{
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text
            style={{ ...Typography.body, color: Colors.gray700 }}
          >
            No more profiles for now.
          </Text>
          <TouchableOpacity
            onPress={loadData}
            style={{
              marginTop: 12,
              paddingVertical: 10,
              paddingHorizontal: 20,
              borderRadius: Layout.radii.control,
              borderWidth: 1,
              borderColor: Colors.primaryViolet,
            }}
          >
            <Text
              style={{
                ...Typography.body,
                color: Colors.primaryViolet,
              }}
            >
              Refresh feed
            </Text>
          </TouchableOpacity>
        </View>
      );
    }

    const mainPhoto =
      currentItem.romance_photos?.[0] ||
      currentItem.romance_photos?.find((p) => !!p) ||
      currentItem.core_photos?.[0] ||
      null;

    const other: RomanceProfile = {
      id: currentItem.id,
      first_name: currentItem.first_name,
      age: currentItem.age,
      city: currentItem.city,
      interests: currentItem.interests || [],
      languages: currentItem.languages || [],
      occupation: currentItem.occupation || undefined,
      bio_romance: currentItem.bio_romance || undefined,
      compatibility: currentItem.compatibility ?? undefined,
    };

    const score = computeCompatibilityScore({
      self: selfProfile,
      other,
    });

    const tags = buildMatchTags({ self: selfProfile, other });

    return (
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <TouchableOpacity
          activeOpacity={0.95}
          onPress={handleOpenProfile}
          style={{
            width: width * 0.9,
            height: width * 1.1,
            borderRadius: Layout.radii.card,
            backgroundColor: "#FFF",
            overflow: "hidden",
            shadowColor: "#000",
            shadowOpacity: 0.12,
            shadowRadius: 10,
            elevation: 3,
          }}
        >
          {/* Photo area */}
          <View style={{ flex: 3, backgroundColor: Colors.gray200 }}>
            {mainPhoto ? (
              <Image
                source={{ uri: mainPhoto }}
                style={{ width: "100%", height: "100%" }}
              />
            ) : (
              <View
                style={{
                  flex: 1,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text style={{ fontSize: 40 }}>📷</Text>
              </View>
            )}
          </View>

          {/* Info area */}
          <View
            style={{
              flex: 2,
              padding: 14,
            }}
          >
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                marginBottom: 6,
              }}
            >
              <View style={{ flex: 1, paddingRight: 8 }}>
                <Text
                  style={{
                    ...Typography.h2,
                    fontSize: 20,
                    color: Colors.textPrimary,
                  }}
                  numberOfLines={1}
                >
                  {currentItem.first_name}
                  {currentItem.age ? `, ${currentItem.age}` : ""}
                </Text>
                <Text
                  style={{
                    ...Typography.caption,
                    color: Colors.gray700,
                  }}
                  numberOfLines={1}
                >
                  {currentItem.city || "Somewhere nearby"}
                </Text>
              </View>

              {/* Compatibility badge */}
              <View
                style={{
                  minWidth: 68,
                  height: 32,
                  borderRadius: 16,
                  backgroundColor: Colors.accentMint,
                  alignItems: "center",
                  justifyContent: "center",
                  paddingHorizontal: 10,
                }}
              >
                <Text
                  style={{
                    ...Typography.caption,
                    fontWeight: "700",
                    color: "#003329",
                  }}
                >
                  {score}% match
                </Text>
              </View>
            </View>

            {/* Tags */}
            {tags.length > 0 && (
              <View
                style={{
                  flexDirection: "row",
                  flexWrap: "wrap",
                  marginBottom: 6,
                }}
              >
                {tags.slice(0, 3).map((tag) => (
                  <View
                    key={tag}
                    style={{
                      borderRadius: 999,
                      backgroundColor: Colors.gray100,
                      paddingVertical: 4,
                      paddingHorizontal: 8,
                      marginRight: 6,
                      marginBottom: 4,
                    }}
                  >
                    <Text
                      style={{
                        ...Typography.caption,
                        color: Colors.gray700,
                      }}
                    >
                      {tag}
                    </Text>
                  </View>
                ))}
              </View>
            )}

            {/* Short bio */}
            {currentItem.bio_romance ? (
              <Text
                style={{
                  ...Typography.body,
                  color: Colors.gray800,
                }}
                numberOfLines={3}
              >
                {currentItem.bio_romance}
              </Text>
            ) : (
              <Text
                style={{
                  ...Typography.caption,
                  color: Colors.gray500,
                }}
              >
                No bio yet. Get to know each other in chat 😉
              </Text>
            )}
          </View>
        </TouchableOpacity>

        {/* Actions */}
        <View
          style={{
            flexDirection: "row",
            marginTop: 20,
            justifyContent: "space-evenly",
            width: "80%",
          }}
        >
          {/* Pass */}
          <TouchableOpacity
            onPress={handlePass}
            style={{
              width: 64,
              height: 64,
              borderRadius: 32,
              borderWidth: 2,
              borderColor: Colors.gray300,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: "#FFF",
            }}
          >
            <Ionicons name="close" size={32} color={Colors.gray500} />
          </TouchableOpacity>

          {/* Like */}
          <TouchableOpacity
            onPress={handleLike}
            disabled={likeInProgress}
            style={{
              width: 72,
              height: 72,
              borderRadius: 36,
              backgroundColor: Colors.accentCoral,
              alignItems: "center",
              justifyContent: "center",
              shadowColor: "#000",
              shadowOpacity: 0.2,
              shadowRadius: 8,
              elevation: 4,
              opacity: likeInProgress ? 0.7 : 1,
            }}
          >
            <Ionicons name="heart" size={36} color="#FFF" />
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  // ────────────────────────────────────────────────
  // UI
  // ────────────────────────────────────────────────
  return (
    <View style={{ flex: 1, backgroundColor: Colors.backgroundLight }}>
      {/* HEADER */}
      <ModeHeader currentMode="romance" rightSlot="filterSettings" />

      {/* TOP LABEL */}
      <View style={{ paddingHorizontal: 20, marginBottom: 6 }}>
        <Text
          style={{
            ...Typography.h1,
            fontSize: 24,
            color: Colors.textPrimary,
            marginBottom: 4,
          }}
        >
          Discover new matches 💘
        </Text>
        <Text
          style={{
            ...Typography.caption,
            color: Colors.gray700,
          }}
        >
          Winkly orders profiles based on shared interests, lifestyle and vibe.
        </Text>
      </View>

      {/* MAIN AREA */}
      <View style={{ flex: 1 }}>
        {loading ? (
          <View
            style={{
              flex: 1,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <ActivityIndicator
              size="large"
              color={Colors.primaryViolet}
            />
          </View>
        ) : (
          renderCard()
        )}
      </View>

      {/* BOTTOM BAR — same as Home */}
      <RomanceBottomNav />
    </View>
  );
}
