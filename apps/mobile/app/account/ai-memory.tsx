import React, { useMemo, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Alert, ScrollView, Switch } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { SafeScreenView } from "@/components/SafeScreenView";
import { useAppTheme, type AppTheme } from "@/constants/design-system";
import { useModeContext } from "@/providers";
import type { Mode } from "@/types";
import { requestDeleteAiMemory, type DeleteAiMemoryScope } from "@/lib/account/deleteAiMemory";

const MODES: Mode[] = ["romance", "friends", "business", "events"];

function scopeLabel(t: TFunction, scope: DeleteAiMemoryScope): string {
  if (scope === "all") return t("account.aiMemory.allModes");
  return t(`modes.${scope}`);
}

export default function AiMemoryScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const theme = useAppTheme();
  const styles = createStyles(theme);
  const { context } = useModeContext();
  const activeMode = (context.active_mode ?? "romance") as Mode;

  const [scope, setScope] = useState<DeleteAiMemoryScope>(activeMode);
  const [deleteSignals, setDeleteSignals] = useState(false);
  const [loading, setLoading] = useState(false);

  const warning = useMemo(
    () => (deleteSignals ? t("account.aiMemory.warningWithSignals") : t("account.aiMemory.warning")),
    [deleteSignals, t],
  );

  const confirmAndDelete = async () => {
    if (loading) return;
    Haptics.selectionAsync();
    Alert.alert(
      t("account.aiMemory.confirmTitle"),
      t("account.aiMemory.confirmMessage", { warning, scope: scopeLabel(t, scope) }),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("common.delete"),
          style: "destructive",
          onPress: async () => {
            setLoading(true);
            try {
              const res = await requestDeleteAiMemory({ scope, deleteConciergeSignals: deleteSignals });
              if ("error" in res) {
                if (__DEV__) console.warn("[ai-memory] delete failed:", res.error);
                Alert.alert(t("account.aiMemory.deleteFailedTitle"), t("common.tryAgain"));
              } else {
                Alert.alert(t("account.aiMemory.deletedTitle"), t("account.aiMemory.deletedMessage"));
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
        <Text style={styles.headerTitle}>{t("account.aiMemory.title")}</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t("account.aiMemory.whatThisDoes")}</Text>
          <Text style={styles.body}>{warning}</Text>
          <Text style={styles.hint}>
            {t("account.aiMemory.fullDeletionHint")}
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t("account.aiMemory.scope")}</Text>

          <TouchableOpacity
            onPress={() => setScope(activeMode)}
            style={[styles.choiceRow, scope === activeMode && styles.choiceRowActive]}
            activeOpacity={0.7}
          >
            <Text style={styles.choiceTitle}>{t("account.aiMemory.currentMode")}</Text>
            <Text style={styles.choiceValue}>{scopeLabel(t, activeMode)}</Text>
          </TouchableOpacity>

          <View style={styles.divider} />

          <TouchableOpacity
            onPress={() => setScope("all")}
            style={[styles.choiceRow, scope === "all" && styles.choiceRowActive]}
            activeOpacity={0.7}
          >
            <Text style={styles.choiceTitle}>{t("account.aiMemory.allModes")}</Text>
          </TouchableOpacity>

          <View style={styles.divider} />

          <Text style={styles.sectionLabel}>{t("account.aiMemory.pickMode")}</Text>
          <View style={styles.pills}>
            {MODES.map((m) => (
              <TouchableOpacity
                key={m}
                onPress={() => setScope(m)}
                style={[styles.pill, scope === m && styles.pillActive]}
                activeOpacity={0.8}
              >
                <Text style={[styles.pillText, scope === m && styles.pillTextActive]}>{scopeLabel(t, m)}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t("account.aiMemory.optional")}</Text>
          <View style={styles.switchRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.choiceTitle}>{t("account.aiMemory.alsoDeleteSignals")}</Text>
              <Text style={styles.switchHint}>
                {t("account.aiMemory.alsoDeleteSignalsHint")}
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
          <Text style={styles.dangerBtnText}>{loading ? t("account.aiMemory.deleting") : t("account.aiMemory.deleteButton")}</Text>
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
