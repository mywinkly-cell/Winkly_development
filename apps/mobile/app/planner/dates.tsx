// Planner — Dates (Romance) + date safety check-ins (Supabase date_safety_checkins).

import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Colors, Typography, Layout } from "@/constants/tokens";
import {
  listMyDateCheckins,
  createDateCheckin,
  respondDateCheckin,
  type DateSafetyCheckin,
} from "@/lib/safety/dateCheckins";

export default function PlannerDates() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [checkins, setCheckins] = useState<DateSafetyCheckin[]>([]);

  const load = useCallback(async () => {
    try {
      const rows = await listMyDateCheckins();
      setCheckins(rows);
    } catch (e) {
      console.warn("PlannerDates load", e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      load();
    }, [load])
  );

  const filtered = checkins.filter((c) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return c.id.toLowerCase().includes(q) || (c.notes ?? "").toLowerCase().includes(q);
  });

  const scheduleDemo = async () => {
    try {
      const when = new Date(Date.now() + 60 * 60 * 1000);
      await createDateCheckin({ scheduledAt: when, checkinDueAt: new Date(when.getTime() + 30 * 60 * 1000) });
      Alert.alert("Scheduled", "A safety check-in was added for your next date window.");
      load();
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "Could not create check-in");
    }
  };

  const onOk = async (id: string) => {
    try {
      await respondDateCheckin(id, "ok");
      load();
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "Could not update");
    }
  };

  const onHelp = async (id: string) => {
    Alert.alert("Safety", "If you are in immediate danger, contact local emergency services.", [
      {
        text: "Mark as needs help",
        style: "destructive",
        onPress: async () => {
          try {
            await respondDateCheckin(id, "needs_help");
            load();
          } catch (e) {
            Alert.alert("Error", e instanceof Error ? e.message : "Could not update");
          }
        },
      },
      { text: "Cancel", style: "cancel" },
    ]);
  };

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
      >
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.9} accessibilityLabel="Back">
            <Ionicons name="arrow-back" size={24} color={Colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Dates</Text>
          <TouchableOpacity onPress={scheduleDemo} style={styles.actionBtn} activeOpacity={0.9}>
            <Text style={styles.actionText}>Demo check-in</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.card}>
          <Text style={styles.title}>Upcoming dates & safety</Text>
          <Text style={styles.subtitle}>
            Schedule a safety check-in before an in-person meetup. You will confirm you are okay from the app.
          </Text>

          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Filter check-ins…"
            placeholderTextColor={Colors.gray500}
            style={styles.search}
          />
        </View>

        {loading ? (
          <ActivityIndicator style={{ marginTop: 24 }} color={Colors.primaryViolet} />
        ) : (
          filtered.map((it) => (
            <View key={it.id} style={styles.itemCard}>
              <View style={styles.itemTop}>
                <Text style={styles.itemTitle}>Check-in</Text>
                <Text style={styles.badge}>{it.status}</Text>
              </View>
              <Text style={styles.itemSub}>
                {new Date(it.scheduled_at).toLocaleString(undefined, {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </Text>
              {it.status === "scheduled" ? (
                <View style={styles.rowActions}>
                  <TouchableOpacity onPress={() => onOk(it.id)} style={styles.secondaryBtn} activeOpacity={0.9}>
                    <Text style={styles.secondaryText}>I&apos;m OK</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => onHelp(it.id)} style={styles.primaryBtn} activeOpacity={0.9}>
                    <Text style={styles.primaryText}>Need help</Text>
                  </TouchableOpacity>
                </View>
              ) : null}
            </View>
          ))
        )}

        {!loading && filtered.length === 0 ? (
          <Text style={styles.note}>No check-ins yet. Tap &quot;Demo check-in&quot; to try the flow.</Text>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.backgroundLight },
  scroll: { padding: 16, paddingBottom: 40 },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.gray100,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: { ...Typography.headerTitle, flex: 1, textAlign: "center", color: Colors.textPrimary },
  actionBtn: { paddingVertical: 8, paddingHorizontal: 10 },
  actionText: { ...Typography.caption, color: Colors.primaryViolet, fontWeight: "700" },
  card: {
    backgroundColor: "#FFF",
    borderRadius: Layout.radii.card,
    borderWidth: 1,
    borderColor: Colors.gray200,
    padding: 16,
    marginBottom: 12,
  },
  title: { ...Typography.h2, color: Colors.textPrimary, marginBottom: 6 },
  subtitle: { ...Typography.body, color: Colors.gray700, marginBottom: 12 },
  search: {
    borderWidth: 1,
    borderColor: Colors.gray300,
    borderRadius: Layout.radii.control,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: Colors.textPrimary,
  },
  itemCard: {
    backgroundColor: "#FFF",
    borderRadius: Layout.radii.card,
    borderWidth: 1,
    borderColor: Colors.gray200,
    padding: 14,
    marginBottom: 10,
  },
  itemTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  itemTitle: { ...Typography.body, fontWeight: "700", color: Colors.textPrimary },
  badge: { ...Typography.caption, color: Colors.primaryViolet, fontWeight: "600", textTransform: "capitalize" },
  itemSub: { ...Typography.caption, color: Colors.gray600, marginTop: 6 },
  rowActions: { flexDirection: "row", gap: 8, marginTop: 12 },
  secondaryBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: "center",
    backgroundColor: Colors.gray100,
    borderRadius: 10,
  },
  secondaryText: { fontSize: 14, fontWeight: "600", color: Colors.textPrimary },
  primaryBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: "center",
    backgroundColor: Colors.errorRed + "18",
    borderRadius: 10,
  },
  primaryText: { fontSize: 14, fontWeight: "600", color: Colors.errorRed },
  note: { ...Typography.caption, color: Colors.gray500, textAlign: "center", marginTop: 16 },
});
