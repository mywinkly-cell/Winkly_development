// ────────────────────────────────────────────────
// Winkly Romance Mode – Matches Screen (v7.1 AI)
// © 2025 Winkly Technologies UG
// Shows:
//   • New matches (recent mutual likes)
//   • Connections (ongoing chats)
//   • Pending (likes you received – if visible)
//   • AI compatibility score + tags
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

import { Colors, Typography, Layout } from "@/constants/tokens";
import { supabase } from "@/lib/supabase";
import { createDirectChat } from "@/lib/chats";

import { ModeHeader } from "@/components/layout/ModeHeader";
import { RomanceBottomNav } from "@/components/layout/RomanceBottomNav";
import {
  computeCompatibilityScore,
  buildMatchTags,
  type RomanceProfile,
} from "@/lib/ai/romanceInsights";

type ModeKey = "romance" | "friends" | "business" | "events";
type MatchCategory = "new" | "connections" | "pending";

type ModeState = {
  romance_enabled: boolean;
  friends_enabled: boolean;
  business_enabled: boolean;
};

export default function RomanceMatches() {
  const router = useRouter();

  const [activeMode, setActiveMode] = useState<ModeKey | null>("romance");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [tab, setTab] = useState<MatchCategory>("new");
  const [matches, setMatches] = useState<any[]>([]);
  const [modes, setModes] = useState<ModeState>({
    romance_enabled: false,
    friends_enabled: false,
    business_enabled: false,
  });

  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [selfProfile, setSelfProfile] = useState<RomanceProfile | null>(null);

  // ────────────────────────────────────────────────
  // LOAD MODE FLAGS + SELF PROFILE + MATCHES
  // ────────────────────────────────────────────────
  const loadData = async () => {
    try {
      const { data: userData, error: userError } =
        await supabase.auth.getUser();
      if (userError || !userData.user) throw userError;

      // Modes
      const { data: userRow, error: modeError } = await supabase
        .from("users")
        .select("romance_enabled, friends_enabled, business_enabled")
        .eq("id", userData.user.id)
        .single();

      if (!modeError && userRow) {
        setModes({
          romance_enabled: !!userRow.romance_enabled,
          friends_enabled: !!userRow.friends_enabled,
          business_enabled: !!userRow.business_enabled,
        });
      }

      // Self profile (for AI)
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

      // Load matches depending on tab
      let rpcName = "";
      if (tab === "new") rpcName = "romance_new_matches";
      if (tab === "connections") rpcName = "romance_connections";
      if (tab === "pending") rpcName = "romance_likes_received";

      const { data: matchesData, error } = await supabase.rpc(rpcName, {
        current_user_id: userData.user.id,
      });

      if (error) throw error;
      setMatches(matchesData || []);
    } catch (err: any) {
      console.warn("Failed to load matches", err);
      Alert.alert("Error", "Could not load matches.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    loadData();
  }, [tab]);

  const onRefresh = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  // ────────────────────────────────────────────────
  // HANDLE MODE SWITCH FROM CARD TAP (still here
  // if you later want to use mode card in this screen)
// (For now we only use Romance; kept for future use.)
// ────────────────────────────────────────────────
  const handleModePress = (mode: ModeKey) => {
    if (mode === "events") {
      Haptics.selectionAsync();
      setActiveMode("events");
      router.replace("/(modes)/events");
      return;
    }

    const enabledMap: Record<ModeKey, boolean> = {
      romance: modes.romance_enabled,
      friends: modes.friends_enabled,
      business: modes.business_enabled,
      events: true,
    };

    if (!enabledMap[mode]) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      const label =
        mode === "romance"
          ? "Romance"
          : mode === "friends"
          ? "Friends"
          : "Business";

      Alert.alert(
        "Sub-Profile not ready",
        `This mode can't be activated and used until you activate and set your “${label}” Sub-Profile.`
      );
      return;
    }

    Haptics.selectionAsync();
    setActiveMode(mode);

    switch (mode) {
      case "romance":
        router.replace("/(modes)/romance");
        break;
      case "friends":
        router.replace("/(modes)/friends");
        break;
      case "business":
        router.replace("/(modes)/business");
        break;
    }
  };

  const handleMessage = async (item: any) => {
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData?.user) return;
      const chatId = await createDirectChat(item.id, "romance", "match", userData.user.id);
      router.push(`/chats/${chatId}`);
    } catch (err) {
      Alert.alert("Error", "Could not open chat.");
    }
  };

  // ────────────────────────────────────────────────
  // GRID CARD
  // ────────────────────────────────────────────────
  const GridCard = ({ item }: { item: any }) => {
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
      bio_romance: item.bio_romance,
      occupation: item.occupation,
      compatibility: item.compatibility,
    };

    const score = computeCompatibilityScore({
      self: selfProfile,
      other,
    });
    const tags = buildMatchTags({ self: selfProfile, other });

    return (
      <View style={{ width: "48%", marginBottom: 16 }}>
        <TouchableOpacity
          onPress={() =>
            router.push(`/(modes)/romance/profile-view?id=${item.id}`)
          }
          style={{
            backgroundColor: "#FFF",
            borderRadius: Layout.radii.card,
            overflow: "hidden",
            shadowColor: "#000",
            shadowOpacity: 0.06,
            shadowRadius: 6,
            elevation: 2,
          }}
          activeOpacity={0.9}
        >
        {mainPhoto ? (
          <Image
            source={{ uri: mainPhoto }}
            style={{ width: "100%", height: 160 }}
          />
        ) : (
          <View
            style={{
              width: "100%",
              height: 160,
              backgroundColor: Colors.gray200,
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            <Text style={{ fontSize: 32 }}>📷</Text>
          </View>
        )}

        <View style={{ padding: 10 }}>
          <Text style={{ ...Typography.body, color: Colors.textPrimary }}>
            {item.first_name}, {item.age ?? "—"}
          </Text>
          <Text style={{ ...Typography.caption, color: Colors.gray700 }}>
            {item.city}
          </Text>

          <Text
            style={{
              ...Typography.caption,
              color: Colors.accentMint,
              marginTop: 4,
            }}
            numberOfLines={1}
          >
            💫 {score}% • {tags[0] ?? "Good vibe match"}
          </Text>
        </View>
        </TouchableOpacity>
        {(tab === "new" || tab === "connections") && (
          <TouchableOpacity
            onPress={() => handleMessage(item)}
            style={{
              marginTop: 8,
              paddingVertical: 8,
              borderRadius: Layout.radii.control,
              backgroundColor: Colors.primaryViolet,
              alignItems: "center",
            }}
          >
            <Text style={{ ...Typography.caption, color: "#FFF", fontWeight: "600" }}>Message</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  // ────────────────────────────────────────────────
  // LIST CARD
  // ────────────────────────────────────────────────
  const ListCard = ({ item }: { item: any }) => {
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
      bio_romance: item.bio_romance,
      occupation: item.occupation,
      compatibility: item.compatibility,
    };

    const score = computeCompatibilityScore({
      self: selfProfile,
      other,
    });
    const tags = buildMatchTags({ self: selfProfile, other });

    return (
      <View style={{ marginBottom: 16, flexDirection: "row", alignItems: "center", gap: 12 }}>
        <TouchableOpacity
          onPress={() =>
            router.push(`/(modes)/romance/profile-view?id=${item.id}`)
          }
          style={{
            flex: 1,
            flexDirection: "row",
            backgroundColor: "#FFF",
            borderRadius: Layout.radii.card,
            overflow: "hidden",
            shadowColor: "#000",
            shadowOpacity: 0.05,
            shadowRadius: 6,
          }}
          activeOpacity={0.9}
        >
          {mainPhoto ? (
            <Image
              source={{ uri: mainPhoto }}
              style={{ width: 110, height: 110 }}
            />
          ) : (
          <View
            style={{
              width: 110,
              height: 110,
              backgroundColor: Colors.gray200,
              justifyContent: "center",
              alignItems: "center",
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
            {item.city}
          </Text>

          <Text
            style={{
              ...Typography.caption,
              marginTop: 8,
              color: Colors.accentMint,
            }}
            numberOfLines={1}
          >
            💫 {score}% • {tags[0] ?? "Good vibe match"}
          </Text>
        </View>
        </TouchableOpacity>
        {(tab === "new" || tab === "connections") && (
          <TouchableOpacity
            onPress={() => handleMessage(item)}
            style={{
              paddingVertical: 10,
              paddingHorizontal: 16,
              borderRadius: Layout.radii.control,
              backgroundColor: Colors.primaryViolet,
            }}
          >
            <Text style={{ ...Typography.caption, color: "#FFF", fontWeight: "600" }}>Message</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  // ────────────────────────────────────────────────
  // TAB BUTTON
  // ────────────────────────────────────────────────
  const TabButton = ({
    label,
    active,
    onPress,
  }: {
    label: string;
    active: boolean;
    onPress: () => void;
  }) => (
    <TouchableOpacity onPress={onPress} style={{ paddingHorizontal: 12 }}>
      <Text
        style={{
          ...Typography.body,
          fontWeight: "600",
          color: active ? Colors.primaryViolet : Colors.gray500,
          borderBottomWidth: active ? 2 : 0,
          borderColor: Colors.primaryViolet,
          paddingBottom: 6,
        }}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );

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

      {/* TITLE & TABS */}
      <View style={{ paddingHorizontal: 20, marginBottom: 10 }}>
        <Text style={{ ...Typography.h2, color: Colors.textPrimary }}>
          Matches
        </Text>
        <Text style={{ ...Typography.caption, color: Colors.gray700 }}>
          New connections, matches and interested profiles
        </Text>
      </View>

      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-evenly",
          paddingVertical: 10,
          marginBottom: 4,
        }}
      >
        <TabButton
          label="New"
          active={tab === "new"}
          onPress={() => setTab("new")}
        />
        <TabButton
          label="Connections"
          active={tab === "connections"}
          onPress={() => setTab("connections")}
        />
        <TabButton
          label="Pending"
          active={tab === "pending"}
          onPress={() => setTab("pending")}
        />
      </View>

      {/* VIEW MODE SWITCH */}
      <View
        style={{
          flexDirection: "row",
          justifyContent: "flex-end",
          paddingHorizontal: 20,
          marginBottom: 12,
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
      ) : matches.length === 0 ? (
        <View style={{ alignItems: "center", marginTop: 60 }}>
          <Text style={{ ...Typography.body, color: Colors.gray700 }}>
            No {tab} matches yet.
          </Text>
        </View>
      ) : (
        <FlatList
          data={matches}
          numColumns={viewMode === "grid" ? 2 : 1}
          key={viewMode}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) =>
            viewMode === "grid" ? (
              <GridCard item={item} />
            ) : (
              <ListCard item={item} />
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
