// apps/mobile/app/planner/dates.tsx
// Winkly – Planner: Dates (Romance)
// Safe placeholder, later wired to Supabase

import React, { useMemo, useState } from "react";
import { View, Text, ScrollView, TouchableOpacity, TextInput, Alert, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Colors, Typography, Layout } from "@/constants/tokens";

type PlannerItem = {
  id: string;
  title: string;
  timeLabel: string;
  status: "planned" | "confirmed" | "done";
};

export default function PlannerDates() {
  const router = useRouter();
  const [query, setQuery] = useState("");

  const data: PlannerItem[] = useMemo(
    () => [
      { id: "d1", title: "Coffee date", timeLabel: "Fri • 18:30", status: "planned" },
      { id: "d2", title: "Dinner reservation", timeLabel: "Sat • 20:00", status: "confirmed" },
      { id: "d3", title: "Walk in park", timeLabel: "Sun • 14:00", status: "done" },
    ],
    []
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return data;
    return data.filter((x) => x.title.toLowerCase().includes(q));
  }, [data, query]);

  const onAdd = () => {
    Alert.alert("Add date", "Placeholder. Next we’ll add a create form + Supabase insert.");
  };

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.9} accessibilityLabel="Back">
            <Ionicons name="arrow-back" size={24} color={Colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Dates</Text>
          <TouchableOpacity onPress={onAdd} style={styles.actionBtn} activeOpacity={0.9}>
            <Text style={styles.actionText}>Add</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.card}>
          <Text style={styles.title}>Your upcoming dates</Text>
          <Text style={styles.subtitle}>Quick overview for Romance planning.</Text>

          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search dates..."
            placeholderTextColor={Colors.gray500}
            style={styles.search}
          />
        </View>

        {filtered.map((it) => (
          <View key={it.id} style={styles.itemCard}>
            <View style={styles.itemTop}>
              <Text style={styles.itemTitle}>{it.title}</Text>
              <Text style={styles.badge}>{it.status}</Text>
            </View>
            <Text style={styles.itemSub}>{it.timeLabel}</Text>

            <View style={styles.rowActions}>
              <TouchableOpacity
                onPress={() => Alert.alert("Open", "Placeholder for details.")}
                style={styles.secondaryBtn}
                activeOpacity={0.9}
              >
                <Text style={styles.secondaryText}>Details</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => Alert.alert("Reschedule", "Placeholder for reschedule flow.")}
                style={styles.primaryBtn}
                activeOpacity={0.9}
              >
                <Text style={styles.primaryText}>Reschedule</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))}

        <Text style={styles.note}>Next: connect to Supabase + integrate planner reminders.</Text>
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
  headerTitle: { ...Typography.h3, color: Colors.textPrimary },

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
