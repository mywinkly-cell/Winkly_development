// ────────────────────────────────────────────────
// Winkly Romance Mode – Liked (v7.1 AI)
// ────────────────────────────────────────────────

import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Image,
  FlatList,
  ActivityIndicator,
  Alert,
} from "react-native";
import { SafeScreenView } from "@/components/SafeScreenView";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";

import { Ionicons } from "@expo/vector-icons";
import { SparklesIcon } from "@/components/ui/WinklyAISpark";
import { Colors, Typography, Layout } from "@/constants/tokens";
import { supabase } from "@/lib/supabase";
import { ModeHeader } from "@/components/layout/ModeHeader";
import { RomanceBottomNav } from "@/components/layout/RomanceBottomNav";
import {
  computeCompatibilityScore,
  buildMatchTags,
  type RomanceProfile,
} from "@/lib/ai/romanceInsights";
import { useFormatLocationDisplay } from "@/lib/location/useLocationDisplay";

export default function RomanceLiked() {
  const router = useRouter();
  const fmtLoc = useFormatLocationDisplay();

  const [loading, setLoading] = useState(true);
  const [profiles, setProfiles] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [selfProfile, setSelfProfile] = useState<RomanceProfile | null>(null);

  // ────────────────────────────────────────────────
  // LOAD SELF + LIKED
  // ────────────────────────────────────────────────
  const loadLiked = async () => {
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) return;

      // Self
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
        });
      }

      // Liked
      const { data, error } = await supabase.rpc("romance_liked_profiles", {
        current_user_id: userData.user.id,
      });

      if (error) throw error;

      setProfiles(data || []);
    } catch (err: any) {
      console.warn(err);
      Alert.alert("Error", "Could not load liked profiles.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLiked();
  }, []);

  const onRefresh = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setRefreshing(true);
    await loadLiked();
    setRefreshing(false);
  };

  // ────────────────────────────────────────────────
  // GRID CARD
  // ────────────────────────────────────────────────
  const GridCard = ({ item, self }: { item: any; self: RomanceProfile | null }) => {
    const mainPhoto =
      item.romance_photos?.[0] ||
      item.romance_photos?.find((p: string | null) => !!p) ||
      item.core_photos?.[0] ||
      null;

    const other: RomanceProfile = {
      id: item.id,
      first_name: item.first_name,
      age: item.age,
      city: item.city,
      interests: item.interests,
      languages: item.languages,
      compatibility: item.compatibility,
    };

    const score = computeCompatibilityScore({ self, other });
    const tags = buildMatchTags({ self, other });

    return (
      <TouchableOpacity
        onPress={() =>
          router.push(`/(modes)/romance/profile-view?id=${item.id}`)
        }
        activeOpacity={0.9}
        style={{
          width: "48%",
          backgroundColor: "#FFF",
          borderRadius: Layout.radii.card,
          marginBottom: 16,
          overflow: "hidden",
          shadowColor: "#000",
          shadowOpacity: 0.06,
          shadowRadius: 6,
        }}
      >
        {mainPhoto ? (
          <Image source={{ uri: mainPhoto }} style={{ width: "100%", height: 160 }} />
        ) : (
          <View
            style={{
              width: "100%",
              height: 160,
              backgroundColor: Colors.gray200,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text style={{ fontSize: 38 }}>📷</Text>
          </View>
        )}

        <View style={{ padding: 10 }}>
          <Text
            style={{
              ...Typography.body,
              color: Colors.textPrimary,
              marginBottom: 2,
            }}
          >
            {item.first_name}, {item.age ?? "—"}
          </Text>

          <Text style={{ ...Typography.caption, color: Colors.gray700 }}>
            {fmtLoc(item.city)}
          </Text>

          <Text
            style={{
              ...Typography.caption,
              color: Colors.accentMint,
              marginTop: 4,
            }}
          >
            💫 {score}% • {tags[0] ?? "Good vibe match"}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  // ────────────────────────────────────────────────
  // LIST CARD
  // ────────────────────────────────────────────────
  const ListCard = ({ item, self }: { item: any; self: RomanceProfile | null }) => {
    const mainPhoto =
      item.romance_photos?.[0] ||
      item.romance_photos?.find((p: string | null) => !!p) ||
      item.core_photos?.[0] ||
      null;

    const other: RomanceProfile = {
      id: item.id,
      first_name: item.first_name,
      age: item.age,
      city: item.city,
      interests: item.interests,
      languages: item.languages,
      compatibility: item.compatibility,
    };

    const score = computeCompatibilityScore({ self, other });
    const tags = buildMatchTags({ self, other });

    return (
      <TouchableOpacity
        onPress={() =>
          router.push(`/(modes)/romance/profile-view?id=${item.id}`)
        }
        activeOpacity={0.9}
        style={{
          flexDirection: "row",
          backgroundColor: "#FFF",
          borderRadius: Layout.radii.card,
          marginBottom: 16,
          overflow: "hidden",
          shadowColor: "#000",
          shadowOpacity: 0.05,
          shadowRadius: 6,
        }}
      >
        {mainPhoto ? (
          <Image source={{ uri: mainPhoto }} style={{ width: 110, height: 110 }} />
        ) : (
          <View
            style={{
              width: 110,
              height: 110,
              backgroundColor: Colors.gray200,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text style={{ fontSize: 32 }}>📷</Text>
          </View>
        )}

        <View style={{ padding: 12, flex: 1 }}>
          <Text
            style={{
              ...Typography.h3,
              color: Colors.textPrimary,
              marginBottom: 4,
            }}
          >
            {item.first_name}, {item.age ?? "—"}
          </Text>

          <Text style={{ ...Typography.body, color: Colors.gray700 }}>
            {fmtLoc(item.city)}
          </Text>

          <Text
            style={{
              ...Typography.caption,
              marginTop: 8,
              color: Colors.accentMint,
            }}
          >
            💫 {score}% • {tags[0] ?? "Good vibe match"}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  // ────────────────────────────────────────────────
  // UI
  // ────────────────────────────────────────────────
  return (
    <SafeScreenView
      edges={["left", "right"]}
      style={{ flex: 1, backgroundColor: Colors.backgroundLight }}
    >
      {/* HEADER */}
      <ModeHeader currentMode="romance" rightSlot="filterSettings" />

      <View style={{ paddingHorizontal: 20, marginBottom: 12 }}>
        <Text style={{ ...Typography.h2, color: Colors.textPrimary }}>
          Liked
        </Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 }}>
          <SparklesIcon size={14} color={Colors.primaryViolet} />
          <Text style={{ ...Typography.caption, color: Colors.gray700 }}>
            People you’ve liked — sorted by AI affinity
        </Text>
        </View>
      </View>

      {/* VIEW MODE SWITCHER */}
      <View
        style={{
          flexDirection: "row",
          paddingHorizontal: 20,
          marginBottom: 16,
          justifyContent: "flex-end",
          gap: 16,
        }}
      >
        <TouchableOpacity onPress={() => setViewMode("grid")}>
          <Text
            style={{
              fontSize: 22,
              color:
                viewMode === "grid"
                  ? Colors.primaryViolet
                  : Colors.gray400,
            }}
          >
            ⬚
          </Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => setViewMode("list")}>
          <Text
            style={{
              fontSize: 22,
              color:
                viewMode === "list"
                  ? Colors.primaryViolet
                  : Colors.gray400,
            }}
          >
            ☰
          </Text>
        </TouchableOpacity>
      </View>

      {/* CONTENT */}
      {loading ? (
        <ActivityIndicator
          color={Colors.primaryViolet}
          style={{ marginTop: 40 }}
          size="large"
        />
      ) : profiles.length === 0 ? (
        <View style={{ alignItems: "center", marginTop: 60 }}>
          <Text
            style={{
              ...Typography.body,
              color: Colors.gray700,
              textAlign: "center",
            }}
          >
            You haven’t liked anyone yet.
          </Text>
        </View>
      ) : (
        <FlatList
          data={profiles}
          numColumns={viewMode === "grid" ? 2 : 1}
          key={viewMode}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) =>
            viewMode === "grid" ? (
              <GridCard item={item} self={selfProfile} />
            ) : (
              <ListCard item={item} self={selfProfile} />
            )
          }
          refreshing={refreshing}
          onRefresh={onRefresh}
          columnWrapperStyle={
            viewMode === "grid"
              ? { justifyContent: "space-between" }
              : undefined
          }
          contentContainerStyle={{
            paddingHorizontal: 20,
            paddingBottom: 70,
          }}
        />
      )}

      {/* BOTTOM BAR — same as Home */}
      <RomanceBottomNav />
    </SafeScreenView>
  );
}
