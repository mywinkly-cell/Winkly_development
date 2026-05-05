// ────────────────────────────────────────────────
// Winkly Friends Mode – Discover Screen
// Same logic/view as Romance Discover; Friends sub-profile data & colors
// ────────────────────────────────────────────────

import React, { useEffect, useState, useMemo } from "react";
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  ActivityIndicator,
  Dimensions,
  Alert,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { ModeHeader } from "@/components/layout/ModeHeader";
import { FriendsBottomNav } from "@/components/layout/FriendsBottomNav";
import { Colors, Typography, Layout } from "@/constants/tokens";
import { supabase } from "@/lib/supabase";
import {
  computeFriendsCompatibility,
  buildFriendsMatchTags,
  type FriendsProfile,
} from "@/lib/ai/friendsInsights";

const { width } = Dimensions.get("window");
const PAGE_SIZE = 20;

type FeedItem = {
  id: string;
  user_id?: string | null;
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

  const [loading, setLoading] = useState(true);
  const [selfProfile, setSelfProfile] = useState<FriendsProfile | null>(null);
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [likeInProgress, setLikeInProgress] = useState(false);

  const loadData = async () => {
    try {
      setLoading(true);
      const { data: userData } = await supabase.auth.getUser();
      if (!userData?.user) return;

      const { data: me } = await supabase
        .from("profiles_mode")
        .select("interests, meta")
        .eq("user_id", userData.user.id)
        .eq("mode", "friends")
        .maybeSingle();

      if (me?.interests) {
        setSelfProfile({
          id: userData.user.id,
          interests: me.interests as string[],
          vibe_tags: (me.meta as any)?.vibe_tags,
          city: (me.meta as any)?.city,
        });
      }

      const { data: fpData } = await supabase
        .from("friend_profiles")
        .select("id,user_id,display_name,city,vibe_tags,about_short,interests,main_photo_url,avatar_url")
        .order("created_at", { ascending: false })
        .limit(PAGE_SIZE + 5);

      let items: FeedItem[] = [];
      if (fpData?.length) {
        const myId = userData.user.id;
        items = fpData.filter((r: any) => (r.user_id ?? r.id) !== myId) as FeedItem[];
      }

      if (!items.length) {
        const { data: upData } = await supabase
          .from("user_profiles")
          .select("id,first_name,last_name,city,about,main_photo_url,avatar_url")
          .neq("id", userData.user.id)
          .order("created_at", { ascending: false })
          .limit(PAGE_SIZE);

        if (upData?.length) {
          items = (upData as any[]).map((row) => ({
            id: row.id,
            user_id: row.id,
            display_name: [row.first_name, row.last_name].filter(Boolean).join(" ").trim() || "Friend",
            city: row.city ?? null,
            interests: null,
            vibe_tags: null,
            about_short: row.about ?? null,
            main_photo_url: row.main_photo_url ?? null,
            avatar_url: row.avatar_url ?? null,
          }));
        }
      }

      const scored = items.map((item) => {
        const other: FriendsProfile = {
          id: item.id,
          display_name: item.display_name,
          city: item.city ?? undefined,
          interests: item.interests ?? [],
          vibe_tags: item.vibe_tags ?? [],
          about: item.about_short ?? undefined,
        };
        const score = computeFriendsCompatibility({ self: selfProfile, other });
        return { ...item, compatibility: score };
      });
      scored.sort((a, b) => ((b as any).compatibility ?? 0) - ((a as any).compatibility ?? 0));
      setFeed(scored);
      setCurrentIndex(0);
    } catch (err) {
      console.warn("FriendsDiscover loadData error", err);
      Alert.alert("Error", "Could not load discover feed.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const currentItem = useMemo(
    () => (currentIndex < feed.length ? feed[currentIndex] : null),
    [feed, currentIndex]
  );

  const goToNext = () => setCurrentIndex((prev) => prev + 1);

  const handlePass = async () => {
    if (!currentItem) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    goToNext();
  };

  const handleAddFriend = async () => {
    if (!currentItem || likeInProgress) return;
    setLikeInProgress(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      // TODO: RPC for friend request / like
    } catch (err) {
      console.warn("Add friend error", err);
    } finally {
      setLikeInProgress(false);
      goToNext();
    }
  };

  const handleOpenProfile = () => {
    if (!currentItem) return;
    const uid = currentItem.user_id ?? currentItem.id;
    router.push(`/(modes)/friends/profile-view?user_id=${uid}`);
  };

  const renderCard = () => {
    if (!currentItem) {
      return (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ ...Typography.body, color: Colors.gray700 }}>
            No more profiles for now.
          </Text>
          <TouchableOpacity
            onPress={loadData}
            style={{
              marginTop: 12,
              paddingVertical: 10,
              paddingHorizontal: 20,
              borderRadius: Layout.radii.control,
              borderWidth: 2,
              borderColor: Colors.friends.primary,
            }}
          >
            <Text style={{ ...Typography.body, color: Colors.friends.primary, fontWeight: "600" }}>
              Refresh feed
            </Text>
          </TouchableOpacity>
        </View>
      );
    }

    const mainPhoto =
      currentItem.main_photo_url ?? currentItem.avatar_url ?? null;
    const other: FriendsProfile = {
      id: currentItem.id,
      display_name: currentItem.display_name,
      city: currentItem.city ?? undefined,
      interests: currentItem.interests ?? [],
      vibe_tags: currentItem.vibe_tags ?? [],
      about: currentItem.about_short ?? undefined,
    };
    const score = computeFriendsCompatibility({ self: selfProfile, other });
    const tags = buildFriendsMatchTags({ self: selfProfile, other });

    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
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
          <View style={{ flex: 3, backgroundColor: Colors.gray200 }}>
            {mainPhoto ? (
              <Image
                source={{ uri: mainPhoto }}
                style={{ width: "100%", height: "100%" }}
                resizeMode="cover"
              />
            ) : (
              <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
                <Text style={{ fontSize: 40 }}>👋</Text>
              </View>
            )}
          </View>

          <View style={{ flex: 2, padding: 14 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 6 }}>
              <View style={{ flex: 1, paddingRight: 8 }}>
                <Text
                  style={{ ...Typography.h2, fontSize: 20, color: Colors.textPrimary }}
                  numberOfLines={1}
                >
                  {currentItem.display_name}
                </Text>
                <Text style={{ ...Typography.caption, color: Colors.gray700 }} numberOfLines={1}>
                  {currentItem.city || "Somewhere nearby"}
                </Text>
              </View>
              <View
                style={{
                  minWidth: 68,
                  height: 32,
                  borderRadius: 16,
                  backgroundColor: Colors.friends.secondary,
                  alignItems: "center",
                  justifyContent: "center",
                  paddingHorizontal: 10,
                }}
              >
                <Text style={{ ...Typography.caption, fontWeight: "700", color: Colors.friends.primary }}>
                  {score}% match
                </Text>
              </View>
            </View>

            {tags.length > 0 && (
              <View style={{ flexDirection: "row", flexWrap: "wrap", marginBottom: 6 }}>
                {tags.slice(0, 3).map((tag) => (
                  <View
                    key={tag}
                    style={{
                      borderRadius: 999,
                      backgroundColor: Colors.friends.secondary,
                      paddingVertical: 4,
                      paddingHorizontal: 8,
                      marginRight: 6,
                      marginBottom: 4,
                    }}
                  >
                    <Text style={{ ...Typography.caption, color: Colors.friends.primary }}>{tag}</Text>
                  </View>
                ))}
              </View>
            )}

            {currentItem.about_short ? (
              <Text style={{ ...Typography.body, color: Colors.gray800 }} numberOfLines={3}>
                {currentItem.about_short}
              </Text>
            ) : (
              <Text style={{ ...Typography.caption, color: Colors.gray500 }}>
                No bio yet. Connect and get to know each other! 👋
              </Text>
            )}
          </View>
        </TouchableOpacity>

        <View
          style={{
            flexDirection: "row",
            marginTop: 20,
            justifyContent: "space-evenly",
            width: "80%",
          }}
        >
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

          <TouchableOpacity
            onPress={handleAddFriend}
            disabled={likeInProgress}
            style={{
              width: 72,
              height: 72,
              borderRadius: 36,
              backgroundColor: Colors.friends.primary,
              alignItems: "center",
              justifyContent: "center",
              shadowColor: "#000",
              shadowOpacity: 0.2,
              shadowRadius: 8,
              elevation: 4,
              opacity: likeInProgress ? 0.7 : 1,
            }}
          >
            <Ionicons name="person-add" size={36} color="#FFF" />
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: Colors.backgroundLight }}>
      <ModeHeader currentMode="friends" rightSlot="filters" onFilterPress={() => router.push("/(modes)/friends/filters")} />

      <View style={{ paddingHorizontal: 20, marginBottom: 6 }}>
        <Text style={{ ...Typography.h1, fontSize: 24, color: Colors.textPrimary, marginBottom: 4 }}>
          Discover new friends 👋
        </Text>
        <Text style={{ ...Typography.caption, color: Colors.gray700 }}>
          Winkly orders profiles based on shared interests, activities and vibe.
        </Text>
      </View>

      <View style={{ flex: 1 }}>
        {loading ? (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
            <ActivityIndicator size="large" color={Colors.friends.primary} />
          </View>
        ) : (
          renderCard()
        )}
      </View>

      <FriendsBottomNav />
    </View>
  );
}
