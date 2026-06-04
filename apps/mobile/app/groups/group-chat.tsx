/**
 * Group chat entry — ensures Supabase conversation + redirects to shared ChatView (Realtime).
 */

import React, { useEffect, useState } from "react";
import { View, Text, ActivityIndicator, TouchableOpacity, StyleSheet } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { ensureGroupConversation } from "@/lib/groups/groupChat";
import { Colors, Typography, Layout } from "@/constants/tokens";

export default function GroupChatEntry() {
  const router = useRouter();
  const { groupId } = useLocalSearchParams<{ groupId?: string }>();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const id = typeof groupId === "string" ? groupId : "";
    if (!id) {
      setError("Missing group id");
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
          setError(e instanceof Error ? e.message : "Could not open group chat");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [groupId, router]);

  return (
    <View style={styles.screen}>
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.9}>
          <Ionicons name="arrow-back" size={24} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Group chat</Text>
        <View style={{ width: 44 }} />
      </View>

      {error ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity onPress={() => router.back()} style={styles.retryBtn}>
            <Text style={styles.retryText}>Go back</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={Colors.primaryViolet} />
          <Text style={styles.loadingText}>Opening group chat…</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.backgroundLight },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    ...Layout.topHeaderBar,
  },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.gray100,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: { ...Typography.headerTitle, color: Colors.textPrimary },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  loadingText: { ...Typography.body, color: Colors.gray600, marginTop: 12 },
  errorText: { ...Typography.body, color: Colors.errorRed, textAlign: "center", marginBottom: 16 },
  retryBtn: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: Layout.radii.control,
    backgroundColor: Colors.primaryViolet,
  },
  retryText: { ...Typography.button, color: Colors.accentYellow },
});
