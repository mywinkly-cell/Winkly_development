/**
 * Group chat entry — ensures Supabase conversation + redirects to shared ChatView (Realtime).
 */

import React, { useEffect, useState } from "react";
import { View, Text, ActivityIndicator, TouchableOpacity, StyleSheet } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Ionicons } from "@expo/vector-icons";
import { ensureGroupConversation } from "@/lib/groups/groupChat";
import { useAppTheme, type AppTheme } from "@/constants/design-system";

export default function GroupChatEntry() {
  const { t } = useTranslation();
  const router = useRouter();
  const theme = useAppTheme();
  const styles = createStyles(theme);
  const { groupId } = useLocalSearchParams<{ groupId?: string }>();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const id = typeof groupId === "string" ? groupId : "";
    if (!id) {
      setError(t("groups.chat.missingId"));
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const conversationId = await ensureGroupConversation(id);
        if (cancelled) return;
        router.replace({
          pathname: "/chats/[conversationId]",
          params: { conversationId },
        });
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : t("groups.chat.openFailed"));
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [groupId, router, t]);

  return (
    <View style={styles.screen}>
      <View style={styles.headerRow}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backBtn}
          activeOpacity={0.9}
          accessibilityRole="button"
          accessibilityLabel={t("common.back")}
        >
          <Ionicons name="arrow-back" size={24} color={theme.colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t("groups.groupChat")}</Text>
        <View style={{ width: 44 }} />
      </View>

      {error ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity onPress={() => router.back()} style={styles.retryBtn}>
            <Text style={styles.retryText}>{t("groups.chat.goBack")}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={styles.loadingText}>{t("groups.chat.opening")}</Text>
        </View>
      )}
    </View>
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.colors.background },
    headerRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 20,
      paddingTop: theme.spacing.sm,
      paddingBottom: theme.spacing.md,
      minHeight: 56,
    },
    backBtn: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: theme.colors.backgroundMuted,
      alignItems: "center",
      justifyContent: "center",
    },
    headerTitle: { ...theme.type.h2, color: theme.colors.textPrimary },
    center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
    loadingText: { ...theme.type.body, color: theme.colors.textSecondary, marginTop: 12 },
    errorText: { ...theme.type.body, color: theme.colors.error, textAlign: "center", marginBottom: 16 },
    retryBtn: {
      paddingHorizontal: 20,
      paddingVertical: 12,
      borderRadius: theme.radii.md,
      backgroundColor: theme.colors.primary,
    },
    retryText: { ...theme.type.button, color: theme.colors.onPrimary },
  });
}
