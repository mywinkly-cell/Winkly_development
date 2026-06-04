// apps/mobile/app/planner/filters.tsx
// Winkly – Planner: Filters (affects suggestions + planner lists)
// Safe UI: stores state locally only (no persistence yet)

import React, { useState } from "react";
import { View, Text, ScrollView, TouchableOpacity, Switch, Alert, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Colors, Typography, Layout } from "@/constants/tokens";
import { SparklesIcon } from "@/components/ui/WinklyAISpark";

export default function PlannerFilters() {
  const router = useRouter();

  const [onlyUpcoming, setOnlyUpcoming] = useState(true);
  const [showCompleted, setShowCompleted] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState(true);

  const save = () => Alert.alert("Saved", "Placeholder. Next: persist to Supabase user settings.");

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.9} accessibilityLabel="Back">
            <Ionicons name="arrow-back" size={24} color={Colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Filters</Text>
          <TouchableOpacity onPress={save} style={styles.actionBtn} activeOpacity={0.9}>
            <Text style={styles.actionText}>Save</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.card}>
          <Text style={styles.title}>Planner preferences</Text>
          <Text style={styles.subtitle}>These settings will affect what you see in planner lists.</Text>

          <View style={styles.row}>
            <View style={styles.rowText}>
              <Text style={styles.rowTitle}>Only upcoming</Text>
              <Text style={styles.rowSub}>Hide past items by default.</Text>
            </View>
            <Switch
              value={onlyUpcoming}
              onValueChange={setOnlyUpcoming}
              thumbColor={undefined}
              trackColor={{ false: Colors.gray300, true: Colors.primaryViolet }}
              ios_backgroundColor={Colors.gray300}
            />
          </View>

          <View style={styles.hr} />

          <View style={styles.row}>
            <View style={styles.rowText}>
              <Text style={styles.rowTitle}>Show completed</Text>
              <Text style={styles.rowSub}>Include finished items in lists.</Text>
            </View>
            <Switch
              value={showCompleted}
              onValueChange={setShowCompleted}
              thumbColor={undefined}
              trackColor={{ false: Colors.gray300, true: Colors.primaryViolet }}
              ios_backgroundColor={Colors.gray300}
            />
          </View>

          <View style={styles.hr} />

          <View style={styles.row}>
            <View style={styles.rowText}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <SparklesIcon size={16} color={Colors.primaryViolet} />
                <Text style={styles.rowTitle}>AI suggestions</Text>
              </View>
              <Text style={styles.rowSub}>Show recommended times/places & follow-ups.</Text>
            </View>
            <Switch
              value={aiSuggestions}
              onValueChange={setAiSuggestions}
              thumbColor={undefined}
              trackColor={{ false: Colors.gray300, true: Colors.primaryViolet }}
              ios_backgroundColor={Colors.gray300}
            />
          </View>
        </View>

        <Text style={styles.note}>Next: persist settings to Supabase and apply filters globally.</Text>
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

  card: { backgroundColor: "#FFF", borderRadius: Layout.radii.card, borderWidth: 1, borderColor: Colors.gray200, padding: 16 },
  title: { ...Typography.h2, color: Colors.textPrimary, marginBottom: 6 },
  subtitle: { ...Typography.body, color: Colors.gray700, marginBottom: 14 },

  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 10 },
  rowText: { flex: 1, paddingRight: 14 },
  rowTitle: { ...Typography.body, color: Colors.textPrimary, marginBottom: 3 },
  rowSub: { ...Typography.caption, color: Colors.gray600 },

  hr: { height: 1, backgroundColor: Colors.gray200 },
  note: { ...Typography.caption, color: Colors.gray600, textAlign: "center", marginTop: 10 },
});
