import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Colors, Typography, Layout } from "@/constants/tokens";

export default function MemberList() {
  const router = useRouter();
  const { groupId } = useLocalSearchParams<{ groupId?: string }>();

  // MVP placeholder members
  const members = [
    { id: "1", name: "Kateryna (You)", role: "Host" },
    { id: "2", name: "Alex", role: "Member" },
    { id: "3", name: "Maria", role: "Member" },
  ];

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.9} accessibilityLabel="Back">
            <Ionicons name="arrow-back" size={24} color={Colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Members</Text>
          <View style={{ width: 70 }} />
        </View>

        <View style={styles.card}>
          <Text style={styles.title}>Group {String(groupId ?? "")}</Text>
          <Text style={styles.subtitle}>MVP list. Next: fetch real participants from Supabase.</Text>

          <View style={{ height: 12 }} />

          {members.map((m) => (
            <View key={m.id} style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{m.name}</Text>
                <Text style={styles.role}>{m.role}</Text>
              </View>
              <Text style={styles.pill}>View</Text>
            </View>
          ))}
        </View>
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

  card: { backgroundColor: "#FFF", borderRadius: Layout.radii.card, borderWidth: 1, borderColor: Colors.gray200, padding: 16 },
  title: { ...Typography.h3, color: Colors.textPrimary, marginBottom: 6 },
  subtitle: { ...Typography.body, color: Colors.gray700 },

  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.gray200,
  },
  name: { ...Typography.body, color: Colors.textPrimary },
  role: { ...Typography.caption, color: Colors.gray600, marginTop: 2 },

  pill: {
    ...Typography.caption,
    color: Colors.primaryViolet,
    backgroundColor: Colors.gray100,
    borderWidth: 1,
    borderColor: Colors.gray200,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
});
