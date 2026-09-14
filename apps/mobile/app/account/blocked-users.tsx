// ────────────────────────────────────────────────
// Winkly — Blocked Users (Privacy & Safety v8)
// List of blocked profiles; unblock with confirmation
// ────────────────────────────────────────────────

import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  Image,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  StyleSheet,
} from "react-native";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { SafeScreenView } from "@/components/SafeScreenView";
import { useAppTheme, type AppTheme } from "@/constants/design-system";
import { supabase } from "@/lib/supabase";
import { unblockUser } from "@/lib/chats";
import { getOtherUserCoreFields, modeDisplayName } from "@/lib/profile/otherUserCore";

type BlockedRow = { id: string; name: string; photoUrl: string | null };

export default function BlockedUsers() {
  const router = useRouter();
  const theme = useAppTheme();
  const styles = createStyles(theme);
  const [loading, setLoading] = useState(true);
  const [blocked, setBlocked] = useState<BlockedRow[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) {
        setBlocked([]);
        return;
      }
      const { data: rows, error } = await supabase
        .from("user_blocks")
        .select("blocked_id, created_at")
        .eq("blocker_id", uid)
        .order("created_at", { ascending: false });
      if (error) throw error;

      const ids = (rows ?? []).map((r) => (r as { blocked_id: string }).blocked_id);
      const profiles = await Promise.all(
        ids.map(async (id): Promise<BlockedRow> => {
          const core = await getOtherUserCoreFields(id).catch(() => null);
          const name = core
            ? modeDisplayName(
                {
                  first_name: core.first_name,
                  last_name: core.last_name,
                  show_full_name: core.show_full_name,
                },
                "friends",
                "Blocked user"
              )
            : "Blocked user";
          return { id, name, photoUrl: core?.core_photos?.[0] ?? null };
        })
      );
      setBlocked(profiles);
    } catch (e) {
      if (__DEV__) console.warn("[blocked-users] load failed", e);
      setBlocked([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleUnblock = (id: string, name: string) => {
    Haptics.selectionAsync();
    Alert.alert(
      "Unblock user?",
      `Unblock ${name}? They will not be notified. They will not automatically reappear in your recommendations.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Unblock",
          onPress: async () => {
            try {
              await unblockUser(id);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              setBlocked((prev) => prev.filter((b) => b.id !== id));
            } catch (e) {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
              Alert.alert("Error", "Could not unblock. Please try again.");
              if (__DEV__) console.warn("[blocked-users] unblock failed", e);
            }
          },
        },
      ]
    );
  };

  return (
    <SafeScreenView style={styles.screen}>
      <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.8} accessibilityLabel="Back">
          <Ionicons name="arrow-back" size={24} color={theme.colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Blocked users</Text>
        <View style={styles.placeholder} />
      </View>

      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      ) : blocked.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="happy-outline" size={64} color={theme.colors.border} />
          <Text style={styles.emptyTitle}>No blocked users</Text>
          <Text style={styles.emptySubtitle}>
            Users you block will appear here. You can unblock anytime; they will not be notified.
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {blocked.map((user) => (
            <View key={user.id} style={styles.row}>
              {user.photoUrl ? (
                <Image source={{ uri: user.photoUrl }} style={styles.avatar} />
              ) : (
                <View style={styles.avatarPlaceholder}>
                  <Ionicons name="person" size={24} color={theme.colors.textMuted} />
                </View>
              )}
              <View style={styles.rowContent}>
                <Text style={styles.rowName}>{user.name}</Text>
                <Text style={styles.rowHint}>Blocked</Text>
              </View>
              <TouchableOpacity
                onPress={() => handleUnblock(user.id, user.name)}
                style={styles.unblockBtn}
                activeOpacity={0.7}
              >
                <Text style={styles.unblockText}>Unblock</Text>
              </TouchableOpacity>
            </View>
          ))}
        </ScrollView>
      )}
    </SafeScreenView>
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.colors.backgroundMuted },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 16,
      paddingTop: theme.spacing.sm,
      paddingBottom: theme.spacing.md,
      minHeight: 56,
      backgroundColor: theme.colors.surface,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border,
    },
    backBtn: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: theme.colors.backgroundMuted,
      alignItems: "center",
      justifyContent: "center",
      ...theme.elevation(1),
    },
    headerTitle: { ...theme.type.h2, fontFamily: theme.type.h1.fontFamily, color: theme.colors.textPrimary },
    placeholder: { width: 40 },
    loading: { flex: 1, justifyContent: "center", alignItems: "center" },
    empty: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      padding: 40,
    },
    emptyTitle: { ...theme.type.h3, color: theme.colors.textPrimary, marginTop: 16 },
    emptySubtitle: {
      ...theme.type.caption,
      color: theme.colors.textSecondary,
      marginTop: 8,
      textAlign: "center",
    },
    scroll: { padding: theme.spacing.xl, paddingBottom: 40 },
    row: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: theme.colors.surface,
      padding: 16,
      borderRadius: theme.radii.lg,
      marginBottom: 12,
    },
    avatar: {
      width: 48,
      height: 48,
      borderRadius: 24,
      marginRight: 14,
      backgroundColor: theme.colors.border,
    },
    avatarPlaceholder: {
      width: 48,
      height: 48,
      borderRadius: 24,
      backgroundColor: theme.colors.border,
      alignItems: "center",
      justifyContent: "center",
      marginRight: 14,
    },
    rowContent: { flex: 1 },
    rowName: { ...theme.type.body, fontWeight: "600", color: theme.colors.textPrimary },
    rowHint: { ...theme.type.caption, color: theme.colors.textSecondary, marginTop: 2 },
    unblockBtn: { paddingVertical: 8, paddingHorizontal: 16 },
    unblockText: { ...theme.type.button, color: theme.colors.primary },
  });
}
