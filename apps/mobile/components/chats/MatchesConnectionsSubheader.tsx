// ────────────────────────────────────────────────
// MatchesConnectionsSubheader — Under chat tabs (Romance, All, …)
// Horizontal scroll of match/connection avatars; tap → Start chat, See profile, Unmatch, or Block
// Shows location (city, country) and distance when < 15km. Sorted newest to oldest.
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
import { appModeToHub, chatRoutes, type ModeHub } from "@/lib/navigation/modeHub";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { Colors, Typography, Layout } from "@/constants/tokens";
import { createDirectChat, unmatchRomance, unfollowConnection, blockUser } from "@/lib/chats";
import { formatDistance, getDefaultDistanceUnit } from "@/lib/distanceUnit";
import { supabase } from "@/lib/supabase";
import {
  formatDefaultLocationDisplay,
  normalizeLocationDisplayString,
  sameLocality,
} from "@/lib/location/countryDisplay";
import { useTranslation } from "react-i18next";

export type MatchConnectionItem = {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  display_name?: string | null;
  city?: string | null;
  country?: string | null;
  /** Distance in km; only shown if < 15. Optional until backend/coords available. */
  distance_km?: number | null;
  romance_photos?: (string | null)[];
  core_photos?: (string | null)[];
  main_photo_url?: string | null;
};

const BLOCK_REASONS = [
  "Not interested anymore",
  "Wrong person",
  "Met elsewhere",
  "Harassment or abuse",
  "Other",
] as const;

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

function getLocationLine(
  m: MatchConnectionItem,
  myCity: string | null | undefined,
  language: string
): string {
  const city = (m.city ?? "").trim();
  const country = (m.country ?? "").trim();
  const line = formatDefaultLocationDisplay(city, country || undefined, language);
  const mine = (myCity ?? "").trim();
  if (mine && line && sameLocality(line, mine)) return "Same city";
  if (line) return line;
  if (city.includes(",")) return normalizeLocationDisplayString(city, language);
  if (city) return city;
  return "";
}

function getDistanceLine(m: MatchConnectionItem): string | null {
  return formatDistance(m.distance_km ?? null, 15, getDefaultDistanceUnit());
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
  /** Current user's city for "Same city" and distance context (optional). */
  myCity?: string | null;
  /** Keeps chat opens inside the active mode stack (Romance bottom nav, etc.). */
  chatHub?: ModeHub;
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
  myCity = null,
  chatHub: chatHubProp,
}: MatchesConnectionsSubheaderProps) {
  const { i18n } = useTranslation();
  const appLanguage = i18n?.language ?? "en";
  const router = useRouter();
  const chatHub =
    chatHubProp ??
    appModeToHub(activeTab === "all" || activeTab === "events" ? null : activeTab);

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

  const goToProfile = (item: MatchConnectionItem) => {
    if (isRomance) router.push(`/(modes)/romance/profile-view?id=${item.id}`);
    else if (isFriends) router.push(`/(modes)/friends/profile-view?user_id=${item.id}`);
    else router.push(`/(modes)/business/profile-view?user_id=${item.id}`);
  };

  const handleAvatarPress = (item: MatchConnectionItem) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const name = getDisplayName(item);
    const profileLabel = `See ${name}'s profile`;

    const options: { text: string; onPress?: () => void; style?: "cancel" | "default" }[] = [
      {
        text: "Start chat",
        onPress: async () => {
          try {
            const { data: userData } = await supabase.auth.getUser();
            if (!userData?.user) return;
            const chatId = await createDirectChat(
              item.id,
              isRomance ? "romance" : isFriends ? "friends" : "business",
              isRomance ? "match" : "connection",
              userData.user.id
            );
            router.push(
              chatRoutes.conversation(chatHub, chatId) as Parameters<typeof router.push>[0]
            );
          } catch {
            Alert.alert("Error", "Could not start chat.");
          }
        },
      },
      {
        text: profileLabel,
        onPress: () => goToProfile(item),
      },
      {
        text: "Unmatch",
        onPress: () => confirmUnmatch(item),
      },
      {
        text: "Block",
        onPress: () => showBlockReasons(item),
      },
      { text: "Cancel", style: "cancel" as const },
    ];

    if (showGroupOption) {
      options.splice(2, 0, {
        text: "Start group chat",
        onPress: () => router.push("/groups/create-group"),
      });
    }

    Alert.alert(name, "Choose an action", options);
  };

  const confirmUnmatch = (item: MatchConnectionItem) => {
    Alert.alert(
      "Unmatch",
      "Remove this match? You won't see each other in Discover.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Unmatch", onPress: () => applyUnmatch(item) },
      ]
    );
  };

  const applyUnmatch = async (item: MatchConnectionItem) => {
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData?.user) return;
      if (isRomance) await unmatchRomance(item.id);
      else await unfollowConnection(item.id);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onRefresh();
    } catch {
      Alert.alert("Error", "Could not update. Please try again.");
    }
  };

  const showBlockReasons = (item: MatchConnectionItem) => {
    Alert.alert(
      "Block",
      "Why are you blocking this person?",
      [
        ...BLOCK_REASONS.map((reason) => ({
          text: reason,
          onPress: () => applyBlock(item),
        })),
        { text: "Back", style: "cancel" },
      ]
    );
  };

  const applyBlock = async (item: MatchConnectionItem) => {
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData?.user) return;
      await blockUser(item.id);
      if (isRomance) await unmatchRomance(item.id);
      else await unfollowConnection(item.id);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onRefresh();
    } catch {
      Alert.alert("Error", "Could not block. Please try again.");
    }
  };

  if (!showSubheader) return null;

  return (
    <View style={styles.container}>
      <Text style={[styles.label, { color: accentColor }]}>{label}</Text>
      {loading ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator size="small" color={accentColor} />
          <Text style={styles.loadingText}>Loading…</Text>
        </View>
      ) : list.length === 0 ? (
        <Text style={[styles.emptyHint, { color: accentColor }]}>
          {isRomance ? "No matches yet" : "No connections yet"}
        </Text>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          {list.map((m) => {
          const photo = getPhotoUrl(m);
          const locationLine = getLocationLine(m, myCity, appLanguage);
          const distanceLine = getDistanceLine(m);
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
              {locationLine ? (
                <Text style={styles.location} numberOfLines={1}>
                  {locationLine}
                </Text>
              ) : null}
              {distanceLine ? (
                <Text style={[styles.distance, { color: accentColor }]} numberOfLines={1}>
                  {distanceLine}
                </Text>
              ) : null}
            </TouchableOpacity>
          );
        })}
        </ScrollView>
      )}
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
  emptyHint: {
    ...Typography.caption,
    fontSize: 13,
    paddingVertical: Layout.spacing.sm,
  },
  scrollContent: {
    flexDirection: "row",
    gap: Layout.spacing.lg,
    paddingVertical: 6,
    paddingRight: Layout.screenPadding,
  },
  avatarCard: {
    alignItems: "center",
    width: 88,
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
  location: {
    ...Typography.caption,
    fontSize: 10,
    color: Colors.gray600,
    textAlign: "center",
    marginTop: 2,
  },
  distance: {
    ...Typography.caption,
    fontSize: 10,
    fontWeight: "600",
    textAlign: "center",
    marginTop: 1,
  },
});
