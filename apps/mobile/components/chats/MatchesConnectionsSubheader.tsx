// ────────────────────────────────────────────────
// MatchesConnectionsSubheader — Under chat tabs (Romance, All, …)
// Shows match/connection avatars for the active tab; tap → Cancel, Start chat, or Start group chat
// ────────────────────────────────────────────────

import React from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  StyleSheet,
  Alert,
} from "react-native";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { Colors, Typography, Layout, Shadow } from "@/constants/tokens";
import { createDirectChat, unmatchRomance, unfollowConnection, blockUser } from "@/lib/chats";
import { supabase } from "@/lib/supabase";

export type MatchConnectionItem = {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  display_name?: string | null;
  city?: string | null;
  romance_photos?: (string | null)[];
  core_photos?: (string | null)[];
  main_photo_url?: string | null;
};

const CANCEL_REASONS = [
  "Not interested anymore",
  "Wrong person",
  "Met elsewhere",
  "Other",
] as const;

const CANCEL_REASONS_WITH_BLOCK = [...CANCEL_REASONS, "Block and remove"] as const;

function getPhotoUrl(m: MatchConnectionItem): string | null {
  return (
    m.romance_photos?.[0] ??
    m.romance_photos?.find(Boolean) ??
    m.core_photos?.[0] ??
    m.core_photos?.find(Boolean) ??
    m.main_photo_url ??
    null
  );
}

function getDisplayName(m: MatchConnectionItem): string {
  if (m.display_name?.trim()) return m.display_name.trim();
  const fn = (m.first_name ?? "").trim();
  const ln = (m.last_name ?? "").trim();
  return `${fn} ${ln}`.trim() || "Match";
}

type TabKey = "all" | "romance" | "friends" | "business" | "events";

type MatchesConnectionsSubheaderProps = {
  activeTab: TabKey;
  romanceMatches: MatchConnectionItem[];
  friendsConnections: MatchConnectionItem[];
  businessConnections: MatchConnectionItem[];
  romanceLoading?: boolean;
  friendsLoading?: boolean;
  businessLoading?: boolean;
  onRefresh: () => void;
};

export function MatchesConnectionsSubheader({
  activeTab,
  romanceMatches,
  friendsConnections,
  businessConnections,
  romanceLoading = false,
  friendsLoading = false,
  businessLoading = false,
  onRefresh,
}: MatchesConnectionsSubheaderProps) {
  const router = useRouter();

  const isRomance = activeTab === "romance";
  const isFriends = activeTab === "friends";
  const isBusiness = activeTab === "business";

  const showSubheader = isRomance || isFriends || isBusiness;
  const list =
    isRomance ? romanceMatches : isFriends ? friendsConnections : isBusiness ? businessConnections : [];
  const loading =
    isRomance ? romanceLoading : isFriends ? friendsLoading : isBusiness ? businessLoading : false;

  const accentColor =
    isRomance
      ? Colors.romance.primary
      : isFriends
        ? Colors.friends.primary
        : Colors.business.primary;

  const label =
    isRomance ? "Matches" : isFriends ? "Connections" : isBusiness ? "Connections" : "";

  const showGroupOption = isFriends || isBusiness;

  const handleAvatarPress = (item: MatchConnectionItem) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const options: Array<{ text: string; onPress?: () => void; style?: "cancel" | "default" }> = [
      {
        text: "Start chat",
        onPress: async () => {
          try {
            const { data: userData } = await supabase.auth.getUser();
            if (!userData?.user) return;
            const chatId = await createDirectChat(
              item.id,
              isRomance ? "romance" : isFriends ? "friends" : "business",
              "match",
              userData.user.id
            );
            router.push(`/chats/${chatId}`);
          } catch {
            Alert.alert("Error", "Could not start chat.");
          }
        },
      },
    ];

    if (showGroupOption) {
      options.push({
        text: "Start group chat",
        onPress: () => {
          router.push("/groups/create-group");
        },
      });
    }

    options.push(
      {
        text: "Cancel match",
        onPress: () => showCancelReasons(item),
      },
      { text: "Cancel", style: "cancel" as const }
    );

    Alert.alert(getDisplayName(item), "Choose an action", options);
  };

  const showCancelReasons = (item: MatchConnectionItem) => {
    const reasons = showGroupOption ? CANCEL_REASONS_WITH_BLOCK : CANCEL_REASONS;
    Alert.alert(
      "Cancel match",
      "Why are you removing this match?",
      [
        ...reasons.map((reason) => ({
          text: reason,
          onPress: () => applyCancelMatch(item, reason),
        })),
        { text: "Back", style: "cancel" },
      ]
    );
  };

  const applyCancelMatch = async (item: MatchConnectionItem, reason: string) => {
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData?.user) return;

      if (reason === "Block and remove") {
        await blockUser(item.id);
      }

      if (isRomance) {
        await unmatchRomance(item.id);
      } else {
        await unfollowConnection(item.id);
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onRefresh();
    } catch {
      Alert.alert("Error", "Could not update. Please try again.");
    }
  };

  if (!showSubheader) return null;

  if (loading) {
    return (
      <View style={styles.container}>
        <Text style={[styles.label, { color: accentColor }]}>{label}</Text>
        <View style={styles.loadingRow}>
          <ActivityIndicator size="small" color={accentColor} />
          <Text style={styles.loadingText}>Loading…</Text>
        </View>
      </View>
    );
  }

  if (list.length === 0) return null;

  return (
    <View style={styles.container}>
      <Text style={[styles.label, { color: accentColor }]}>{label}</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {list.map((m) => {
          const photo = getPhotoUrl(m);
          return (
            <TouchableOpacity
              key={m.id}
              onPress={() => handleAvatarPress(m)}
              activeOpacity={0.85}
              style={[styles.avatarCard, { borderColor: accentColor + "35" }]}
            >
              <View style={[styles.avatarWrap, { borderColor: accentColor + "60" }]}>
                {photo ? (
                  <Image source={{ uri: photo }} style={styles.avatar} resizeMode="cover" />
                ) : (
                  <View style={[styles.avatar, styles.avatarPlaceholder]}>
                    <Ionicons name="person" size={24} color={Colors.gray400} />
                  </View>
                )}
              </View>
              <Text style={styles.name} numberOfLines={1}>
                {getDisplayName(m)}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.backgroundMuted,
    paddingVertical: Layout.spacing.md,
    paddingHorizontal: Layout.screenPadding,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray200,
  },
  label: {
    ...Typography.caption,
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 1.2,
    marginBottom: Layout.spacing.sm,
    color: Colors.gray600,
  },
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: Layout.spacing.sm,
  },
  loadingText: {
    ...Typography.caption,
    color: Colors.gray600,
    fontSize: 13,
  },
  scrollContent: {
    flexDirection: "row",
    gap: Layout.spacing.lg,
    paddingVertical: 6,
    paddingRight: Layout.screenPadding,
  },
  avatarCard: {
    alignItems: "center",
    width: 72,
    paddingVertical: 10,
    paddingHorizontal: 6,
    borderRadius: 20,
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.06)",
    shadowColor: "#1C1C1E",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 3,
  },
  avatarWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    overflow: "hidden",
    borderWidth: 2,
    marginBottom: 6,
  },
  avatar: {
    width: 48,
    height: 48,
  },
  avatarPlaceholder: {
    backgroundColor: Colors.gray100,
    alignItems: "center",
    justifyContent: "center",
  },
  name: {
    ...Typography.caption,
    fontSize: 12,
    fontWeight: "600",
    color: Colors.textPrimary,
    textAlign: "center",
  },
});
