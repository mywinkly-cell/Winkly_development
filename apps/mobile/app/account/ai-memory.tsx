import React, { useMemo, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Alert, ScrollView, Switch } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { SafeScreenView } from "@/components/SafeScreenView";
import { Colors, Typography, Layout, FontFamily } from "@/constants/tokens";
import { useModeContext } from "@/providers";
import type { Mode } from "@/types";
import { requestDeleteAiMemory, type DeleteAiMemoryScope } from "@/lib/account/deleteAiMemory";

const MODES: Mode[] = ["romance", "friends", "business", "events"];

function scopeLabel(scope: DeleteAiMemoryScope): string {
  if (scope === "all") return "All modes";
  return scope.charAt(0).toUpperCase() + scope.slice(1);
}

export default function AiMemoryScreen() {
  const router = useRouter();
  const { context } = useModeContext();
  const activeMode = (context.active_mode ?? "romance") as Mode;

  const [scope, setScope] = useState<DeleteAiMemoryScope>(activeMode);
  const [deleteSignals, setDeleteSignals] = useState(false);
  const [loading, setLoading] = useState(false);

  const warning = useMemo(() => {
    const bits = [
      "This deletes Winkly’s AI memory for you (vector profile + cached AI plans + AI usage records).",
      "It does not delete your account or chats.",
    ];
    if (deleteSignals) bits.push("It will also delete your concierge preference signals.");
    return bits.join(" ");
  }, [deleteSignals]);

  const confirmAndDelete = async () => {
    if (loading) return;
    Haptics.selectionAsync();
    Alert.alert(
      "Delete AI memory?",
      `${warning}\n\nScope: ${scopeLabel(scope)}\n\nYou can’t undo this.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            setLoading(true);
            try {
              const res = await requestDeleteAiMemory({ scope, deleteConciergeSignals: deleteSignals });
              if ("error" in res) {
                Alert.alert("Couldn’t delete AI memory", res.error);
              } else {
                Alert.alert("Deleted", "Your AI memory has been deleted.");
              }
            } finally {
              setLoading(false);
            }
          },
        },
      ],
    );
  };

  return (
    <SafeScreenView style={styles.screen}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.8}>
          <Ionicons name="arrow-back" size={24} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>AI memory</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>What this does</Text>
          <Text style={styles.body}>{warning}</Text>
          <Text style={styles.hint}>
            If you want full deletion of your profile, chats, and planner data, use “Delete account” instead.
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Scope</Text>

          <TouchableOpacity
            onPress={() => setScope(activeMode)}
            style={[styles.choiceRow, scope === activeMode && styles.choiceRowActive]}
            activeOpacity={0.7}
          >
            <Text style={styles.choiceTitle}>Current mode</Text>
            <Text style={styles.choiceValue}>{scopeLabel(activeMode)}</Text>
          </TouchableOpacity>

          <View style={styles.divider} />

          <TouchableOpacity
            onPress={() => setScope("all")}
            style={[styles.choiceRow, scope === "all" && styles.choiceRowActive]}
            activeOpacity={0.7}
          >
            <Text style={styles.choiceTitle}>All modes</Text>
            <Text style={styles.choiceValue}>All modes</Text>
          </TouchableOpacity>

          <View style={styles.divider} />

          <Text style={styles.sectionLabel}>Or pick a mode</Text>
          <View style={styles.pills}>
            {MODES.map((m) => (
              <TouchableOpacity
                key={m}
                onPress={() => setScope(m)}
                style={[styles.pill, scope === m && styles.pillActive]}
                activeOpacity={0.8}
              >
                <Text style={[styles.pillText, scope === m && styles.pillTextActive]}>{scopeLabel(m)}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Optional</Text>
          <View style={styles.switchRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.choiceTitle}>Also delete concierge signals</Text>
              <Text style={styles.switchHint}>
                Removes your saved preference signals used to personalize suggestions (avoid/prefer/noise).
              </Text>
            </View>
            <Switch value={deleteSignals} onValueChange={setDeleteSignals} />
          </View>
        </View>

        <TouchableOpacity
          onPress={confirmAndDelete}
          style={[styles.dangerBtn, loading && { opacity: 0.7 }]}
          activeOpacity={0.8}
          disabled={loading}
        >
          <Ionicons name="trash-outline" size={18} color={Colors.white} />
          <Text style={styles.dangerBtnText}>{loading ? "Deleting…" : "Delete AI memory"}</Text>
        </TouchableOpacity>
      </ScrollView>
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
  scroll: { padding: Layout.screenPadding, paddingBottom: 40 },
  card: { backgroundColor: Colors.white, borderRadius: Layout.radii.card, padding: 20, marginBottom: 16 },
  cardTitle: { ...Typography.h3, fontFamily: FontFamily.heading, color: Colors.textPrimary, marginBottom: 10 },
  body: { ...Typography.body, color: Colors.gray700, lineHeight: 22 },
  hint: { ...Typography.caption, color: Colors.gray600, marginTop: 10, lineHeight: 18 },
  divider: { height: 1, backgroundColor: Colors.gray200, marginVertical: 10 },
  sectionLabel: { ...Typography.caption, color: Colors.gray600, marginTop: 4, marginBottom: 10 },
  choiceRow: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: Colors.gray50,
  },
  choiceRowActive: { backgroundColor: Colors.primaryViolet + "12" },
  choiceTitle: { ...Typography.body, fontWeight: "600", color: Colors.textPrimary },
  choiceValue: { ...Typography.caption, color: Colors.gray700 },
  pills: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  pill: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Colors.gray200,
    backgroundColor: Colors.white,
  },
  pillActive: { borderColor: Colors.primaryViolet, backgroundColor: Colors.primaryViolet + "12" },
  pillText: { ...Typography.caption, color: Colors.gray700, fontWeight: "600" },
  pillTextActive: { color: Colors.primaryViolet },
  switchRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  switchHint: { ...Typography.caption, color: Colors.gray600, marginTop: 4, lineHeight: 18 },
  dangerBtn: {
    backgroundColor: Colors.danger,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    marginTop: 6,
  },
  dangerBtnText: { ...Typography.body, fontWeight: "700", color: Colors.white },
});

