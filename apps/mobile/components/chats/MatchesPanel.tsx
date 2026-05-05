// ────────────────────────────────────────────────
// MatchesPanel — Horizontal scroll of match avatars
// Romance mode: tap avatar to start 1:1 chat with match
// Premium, user-friendly UI
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
} from "react-native";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { Colors, Typography, Layout, Shadow } from "@/constants/tokens";
import { supabase } from "@/lib/supabase";
import { createDirectChat } from "@/lib/chats";

export type MatchItem = {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  city?: string | null;
  romance_photos?: string[];
  core_photos?: string[];
};

function formatName(m: MatchItem): string {
  const fn = (m.first_name ?? "").trim();
  const ln = (m.last_name ?? "").trim();
  return `${fn} ${ln}`.trim() || "Match";
}

type MatchesPanelProps = {
  matches: MatchItem[];
  loading?: boolean;
  mode: "romance" | "friends" | "business";
  onChatStart?: (matchId: string) => void;
  onViewAll?: () => void;
};

export function MatchesPanel({
  matches,
  loading = false,
  mode,
  onChatStart,
  onViewAll,
}: MatchesPanelProps) {
  const router = useRouter();

  const handleAvatarPress = async (match: MatchItem) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData?.user) return;
      const chatId = await createDirectChat(
        match.id,
        mode,
        "match",
        userData.user.id
      );
      onChatStart?.(match.id);
      router.push(`/chats/${chatId}`);
    } catch (err) {
      // Error handling delegated to caller or global
    }
  };

  const accentColor =
    mode === "romance"
      ? Colors.romance.primary
      : mode === "friends"
        ? Colors.friends.primary
        : Colors.business.primary;

  const label =
    mode === "romance"
      ? "Your matches"
      : mode === "friends"
        ? "Friends to chat with"
        : "Connections";

  if (loading) {
    return (
      <View style={styles.container}>
        <Text style={[styles.label, { color: accentColor }]}>{label}</Text>
        <View style={styles.loadingRow}>
          <ActivityIndicator size="small" color={accentColor} />
          <Text style={styles.loadingText}>Loading matches…</Text>
        </View>
      </View>
    );
  }

  if (matches.length === 0) return null;

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={[styles.label, { color: accentColor }]}>{label}</Text>
        {onViewAll && matches.length > 3 && (
          <TouchableOpacity
            onPress={() => {
              Haptics.selectionAsync();
              onViewAll();
            }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={[styles.viewAll, { color: accentColor }]}>View all</Text>
          </TouchableOpacity>
        )}
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {matches.map((match) => {
          const photo =
            match.romance_photos?.[0] ??
            match.romance_photos?.find(Boolean) ??
            match.core_photos?.[0] ??
            null;

          return (
            <TouchableOpacity
              key={match.id}
              onPress={() => handleAvatarPress(match)}
              activeOpacity={0.85}
              style={[styles.avatarCard, { borderColor: accentColor + "30" }]}
            >
              <View style={[styles.avatarWrap, { borderColor: accentColor + "40" }]}>
                {photo ? (
                  <Image
                    source={{ uri: photo }}
                    style={styles.avatar}
                    resizeMode="cover"
                  />
                ) : (
                  <View style={[styles.avatar, styles.avatarPlaceholder]}>
                    <Ionicons
                      name="person"
                      size={28}
                      color={Colors.gray400}
                    />
                  </View>
                )}
              </View>
              <Text style={styles.name} numberOfLines={1}>
                {formatName(match)}
              </Text>
              <View style={styles.chatHint}>
                <Ionicons name="chatbubble" size={12} color={accentColor} />
                <Text style={[styles.chatHintText, { color: accentColor }]}>
                  Chat
                </Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: Layout.spacing.lg,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Layout.spacing.sm,
    paddingHorizontal: 2,
  },
  label: {
    ...Typography.h3,
    fontSize: 17,
    fontWeight: "600",
  },
  viewAll: {
    ...Typography.caption,
    fontWeight: "600",
  },
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: Layout.spacing.md,
  },
  loadingText: {
    ...Typography.caption,
    color: Colors.gray600,
  },
  scrollContent: {
    flexDirection: "row",
    gap: Layout.spacing.md,
    paddingVertical: 4,
    paddingRight: Layout.screenPadding,
  },
  avatarCard: {
    alignItems: "center",
    width: 80,
    paddingVertical: 10,
    paddingHorizontal: 6,
    borderRadius: Layout.radii.control,
    backgroundColor: Colors.white,
    borderWidth: 1,
    ...Shadow.card,
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  avatarWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    overflow: "hidden",
    borderWidth: 2,
    marginBottom: 6,
  },
  avatar: {
    width: 56,
    height: 56,
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
  chatHint: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 4,
  },
  chatHintText: {
    fontSize: 11,
    fontWeight: "600",
  },
});
