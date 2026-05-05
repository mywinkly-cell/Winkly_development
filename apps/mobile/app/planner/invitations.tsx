// apps/mobile/app/planner/invitations.tsx
// Winkly – Planner: Invitations (Requests / RSVPs / Confirmations)

import React, { useMemo } from "react";
import { View, Text, ScrollView, TouchableOpacity, Alert, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Colors, Typography, Layout } from "@/constants/tokens";

type Invite = {
  id: string;
  title: string;
  meta: string;
  type: "date" | "meetup" | "business" | "event";
};

export default function PlannerInvitations() {
  const router = useRouter();

  const items: Invite[] = useMemo(
    () => [
      { id: "i1", title: "Dinner invitation", meta: "Romance • Tomorrow 19:30", type: "date" },
      { id: "i2", title: "Hiking group request", meta: "Friends • Sunday 09:00", type: "meetup" },
      { id: "i3", title: "Intro call request", meta: "Business • Monday 10:00", type: "business" },
      { id: "i4", title: "Event RSVP request", meta: "Events • Saturday 22:00", type: "event" },
    ],
    []
  );

  const accept = () => Alert.alert("Accepted", "Placeholder. Next: update status in Supabase + notify chat.");
  const decline = () => Alert.alert("Declined", "Placeholder. Next: update status in Supabase.");

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.9} accessibilityLabel="Back">
            <Ionicons name="arrow-back" size={24} color={Colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Invitations</Text>
          <View style={{ width: 44 }} />
        </View>

        <View style={styles.card}>
          <Text style={styles.title}>Requests & RSVPs</Text>
          <Text style={styles.subtitle}>Accept or decline invitations across all modes.</Text>
        </View>

        {items.map((it) => (
          <View key={it.id} style={styles.itemCard}>
            <Text style={styles.itemTitle}>{it.title}</Text>
            <Text style={styles.itemMeta}>{it.meta}</Text>

            <View style={styles.rowActions}>
              <TouchableOpacity onPress={decline} style={styles.secondaryBtn} activeOpacity={0.9}>
                <Text style={styles.secondaryText}>Decline</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={accept} style={styles.primaryBtn} activeOpacity={0.9}>
                <Text style={styles.primaryText}>Accept</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))}

        <Text style={styles.note}>Next: connect to planner tables + event attendance + conversations.</Text>
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

  card: { backgroundColor: "#FFF", borderRadius: Layout.radii.card, borderWidth: 1, borderColor: Colors.gray200, padding: 16, marginBottom: 12 },
  title: { ...Typography.h2, color: Colors.textPrimary, marginBottom: 6 },
  subtitle: { ...Typography.body, color: Colors.gray700 },

  itemCard: { backgroundColor: "#FFF", borderRadius: Layout.radii.card, borderWidth: 1, borderColor: Colors.gray200, padding: 16, marginBottom: 12 },
  itemTitle: { ...Typography.h3, color: Colors.textPrimary, marginBottom: 6 },
  itemMeta: { ...Typography.body, color: Colors.gray700 },

  rowActions: { flexDirection: "row", gap: 10, marginTop: 12 },
  primaryBtn: { flex: 1, backgroundColor: Colors.primaryViolet, borderRadius: Layout.radii.control, paddingVertical: 12, alignItems: "center" },
  primaryText: { ...Typography.button, color: Colors.accentYellow },
  secondaryBtn: { flex: 1, backgroundColor: Colors.gray100, borderWidth: 1, borderColor: Colors.gray200, borderRadius: Layout.radii.control, paddingVertical: 12, alignItems: "center" },
  secondaryText: { ...Typography.button, color: Colors.textPrimary },

  note: { ...Typography.caption, color: Colors.gray600, textAlign: "center", marginTop: 10 },
});
