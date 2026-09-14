import React, { useMemo, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Alert, ScrollView, Switch } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { SafeScreenView } from "@/components/SafeScreenView";
import { useAppTheme, type AppTheme } from "@/constants/design-system";
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
  const theme = useAppTheme();
  const styles = createStyles(theme);
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
          <Ionicons name="arrow-back" size={24} color={theme.colors.textPrimary} />
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
          <Ionicons name="trash-outline" size={18} color="#FFFFFF" />
          <Text style={styles.dangerBtnText}>{loading ? "Deleting…" : "Delete AI memory"}</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeScreenView>
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.colors.backgroundMuted },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 16,
      paddingTop: theme.spacing.sm,
      paddingBottom: theme.spacing.md,
      minHeight: 56,
      backgroundColor: theme.colors.surface,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border,
    },
    backBtn: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: theme.colors.backgroundMuted,
      alignItems: "center",
      justifyContent: "center",
      ...theme.elevation(1),
    },
    headerTitle: { ...theme.type.h2, fontFamily: theme.type.h1.fontFamily, color: theme.colors.textPrimary },
    placeholder: { width: 40 },
    scroll: { padding: theme.spacing.xl, paddingBottom: 40 },
    card: { backgroundColor: theme.colors.surface, borderRadius: theme.radii.lg, padding: 20, marginBottom: 16 },
    cardTitle: { ...theme.type.h3, fontFamily: theme.type.h1.fontFamily, color: theme.colors.textPrimary, marginBottom: 10 },
    body: { ...theme.type.body, color: theme.colors.textSecondary, lineHeight: 22 },
    hint: { ...theme.type.caption, color: theme.colors.textSecondary, marginTop: 10, lineHeight: 18 },
    divider: { height: 1, backgroundColor: theme.colors.border, marginVertical: 10 },
    sectionLabel: { ...theme.type.caption, color: theme.colors.textSecondary, marginTop: 4, marginBottom: 10 },
    choiceRow: {
      paddingVertical: 12,
      paddingHorizontal: 12,
      borderRadius: 12,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      backgroundColor: theme.colors.backgroundMuted,
    },
    choiceRowActive: { backgroundColor: theme.colors.primary + "12" },
    choiceTitle: { ...theme.type.body, fontWeight: "600", color: theme.colors.textPrimary },
    choiceValue: { ...theme.type.caption, color: theme.colors.textSecondary },
    pills: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
    pill: {
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
    },
    pillActive: { borderColor: theme.colors.primary, backgroundColor: theme.colors.primary + "12" },
    pillText: { ...theme.type.caption, color: theme.colors.textSecondary, fontWeight: "600" },
    pillTextActive: { color: theme.colors.primary },
    switchRow: { flexDirection: "row", alignItems: "center", gap: 12 },
    switchHint: { ...theme.type.caption, color: theme.colors.textSecondary, marginTop: 4, lineHeight: 18 },
    dangerBtn: {
      backgroundColor: theme.colors.error,
      borderRadius: 14,
      paddingVertical: 14,
      paddingHorizontal: 14,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 10,
      marginTop: 6,
    },
    dangerBtnText: { ...theme.type.body, fontWeight: "700", color: "#FFFFFF" },
  });
}
