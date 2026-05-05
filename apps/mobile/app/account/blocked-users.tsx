// ────────────────────────────────────────────────
// Winkly — Blocked Users (Privacy & Safety v8)
// List of blocked profiles; unblock with confirmation
// ────────────────────────────────────────────────

import React, { useEffect, useState } from "react";
import {
  View,
  Text,
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
import { Colors, Typography, Layout, FontFamily } from "@/constants/tokens";

export default function BlockedUsers() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [blocked, setBlocked] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        // Placeholder: no blocked_users table yet; show empty state
        setBlocked([]);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleUnblock = (id: string, name: string) => {
    Haptics.selectionAsync();
    Alert.alert(
      "Unblock user?",
      `Unblock ${name}? They will not be notified. They will not automatically reappear in your recommendations.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Unblock",
          onPress: () => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            setBlocked((prev) => prev.filter((b) => b.id !== id));
          },
        },
      ]
    );
  };

  return (
    <SafeScreenView style={styles.screen}>
      <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.8} accessibilityLabel="Back">
          <Ionicons name="arrow-back" size={24} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Blocked users</Text>
        <View style={styles.placeholder} />
      </View>

      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator size="large" color={Colors.primaryViolet} />
        </View>
      ) : blocked.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="happy-outline" size={64} color={Colors.gray300} />
          <Text style={styles.emptyTitle}>No blocked users</Text>
          <Text style={styles.emptySubtitle}>
            Users you block will appear here. You can unblock anytime; they will not be notified.
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {blocked.map((user) => (
            <View key={user.id} style={styles.row}>
              <View style={styles.avatarPlaceholder}>
                <Ionicons name="person" size={24} color={Colors.gray400} />
              </View>
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

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.backgroundMuted },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    ...Layout.topHeaderBar,
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray200,
  },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.gray100,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#1C1C1E",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
  },
  headerTitle: { ...Typography.headerTitle, fontFamily: FontFamily.heading, color: Colors.textPrimary },
  placeholder: { width: 40 },
  loading: { flex: 1, justifyContent: "center", alignItems: "center" },
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 40,
  },
  emptyTitle: { ...Typography.h3, color: Colors.textPrimary, marginTop: 16 },
  emptySubtitle: {
    ...Typography.caption,
    color: Colors.gray600,
    marginTop: 8,
    textAlign: "center",
  },
  scroll: { padding: Layout.screenPadding, paddingBottom: 40 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.white,
    padding: 16,
    borderRadius: Layout.radii.card,
    marginBottom: 12,
  },
  avatarPlaceholder: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.gray200,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 14,
  },
  rowContent: { flex: 1 },
  rowName: { ...Typography.body, fontWeight: "600", color: Colors.textPrimary },
  rowHint: { ...Typography.caption, color: Colors.gray600, marginTop: 2 },
  unblockBtn: { paddingVertical: 8, paddingHorizontal: 16 },
  unblockText: { ...Typography.button, color: Colors.primaryViolet },
});
