// apps/mobile/app/planner/friends-meetups.tsx
// Winkly – Planner: Friends Meetups

import React, { useCallback, useMemo, useState } from "react";
import { View, Text, ScrollView, TouchableOpacity, TextInput, StyleSheet, ActivityIndicator, RefreshControl } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Colors, Typography, Layout } from "@/constants/tokens";
import { supabase } from "@/lib/supabase";
import { getGroupMeetups, type GroupMeetup } from "@/lib/access/planner";

function formatTimeLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString(undefined, {
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function FriendsMeetups() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<GroupMeetup[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data: auth } = await supabase.auth.getUser();
      const me = auth.user?.id;
      if (!me) {
        setItems([]);
        return;
      }
      setItems(await getGroupMeetups(me, "friends"));
    } catch {
      // keep prior
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((x) => (x.title ?? "").toLowerCase().includes(q));
  }, [items, query]);

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              load();
            }}
          />
        }
      >
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.9} accessibilityLabel="Back">
            <Ionicons name="arrow-back" size={24} color={Colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Friends meetups</Text>
          <TouchableOpacity
            onPress={() => router.push({ pathname: "/groups", params: { mode: "friends" } })}
            style={styles.actionBtn}
            activeOpacity={0.9}
          >
            <Text style={styles.actionText}>Groups</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.card}>
          <Text style={styles.title}>Your group plans</Text>
          <Text style={styles.subtitle}>Confirmed group meetups in Friends mode (2+ people).</Text>

          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search meetups..."
            placeholderTextColor={Colors.gray500}
            style={styles.search}
          />
        </View>

        {loading ? (
          <ActivityIndicator size="small" color={Colors.primaryViolet} style={{ marginTop: 24 }} />
        ) : filtered.length === 0 ? (
          <View style={styles.itemCard}>
            <Text style={styles.itemSub}>
              No group meetups yet. Plan one from a group chat with “Plan with group”, and it will show up here once
              confirmed.
            </Text>
          </View>
        ) : (
          filtered.map((it) => (
            <View key={it.id} style={styles.itemCard}>
              <View style={styles.itemTop}>
                <Text style={styles.itemTitle} numberOfLines={1}>
                  {it.title}
                </Text>
                <Text style={styles.badge}>{it.participant_count} people</Text>
              </View>
              <Text style={styles.itemSub}>{formatTimeLabel(it.starts_at)}</Text>
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.backgroundLight },
  scroll: { padding: 20, paddingBottom: 40 },

  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
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
  headerTitle: { ...Typography.headerTitle, color: Colors.textPrimary },

  actionBtn: { width: 60, paddingVertical: 8, borderRadius: 10, backgroundColor: Colors.primaryViolet, alignItems: "center" },
  actionText: { ...Typography.caption, color: Colors.accentYellow },

  card: { backgroundColor: "#FFF", borderRadius: Layout.radii.card, borderWidth: 1, borderColor: Colors.gray200, padding: 16, marginBottom: 12 },
  title: { ...Typography.h2, color: Colors.textPrimary, marginBottom: 6 },
  subtitle: { ...Typography.body, color: Colors.gray700, marginBottom: 12 },

  search: {
    borderWidth: 1,
    borderColor: Colors.gray300,
    borderRadius: Layout.radii.control,
    backgroundColor: "#FFF",
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: Colors.textPrimary,
  },

  itemCard: { backgroundColor: "#FFF", borderRadius: Layout.radii.card, borderWidth: 1, borderColor: Colors.gray200, padding: 16, marginBottom: 12 },
  itemTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  itemTitle: { ...Typography.h3, color: Colors.textPrimary },
  badge: { ...Typography.caption, color: Colors.primaryViolet },
  itemSub: { ...Typography.body, color: Colors.gray700, marginTop: 6 },

  rowActions: { flexDirection: "row", gap: 10, marginTop: 12 },
  primaryBtn: { flex: 1, backgroundColor: Colors.primaryViolet, borderRadius: Layout.radii.control, paddingVertical: 12, alignItems: "center" },
  primaryText: { ...Typography.button, color: Colors.accentYellow },
  secondaryBtn: { flex: 1, backgroundColor: Colors.gray100, borderWidth: 1, borderColor: Colors.gray200, borderRadius: Layout.radii.control, paddingVertical: 12, alignItems: "center" },
  secondaryText: { ...Typography.button, color: Colors.textPrimary },

  note: { ...Typography.caption, color: Colors.gray600, textAlign: "center", marginTop: 10 },
});
