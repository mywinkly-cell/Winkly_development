// apps/mobile/app/planner/filters.tsx
// Winkly – Planner: Filters (affects suggestions + planner lists)
// Persists to device (AsyncStorage via lib/planner/preferences); applied in the planner index.

import React, { useEffect, useState } from "react";
import { View, Text, ScrollView, Alert, Switch, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Card, Header, ListRow, TextButton } from "@/components/ds";
import { useAppTheme, type AppTheme } from "@/constants/design-system";
import { SparklesIcon } from "@/components/ui/WinklyAISpark";
import {
  getPlannerPreferences,
  savePlannerPreferences,
  DEFAULT_PLANNER_PREFERENCES,
} from "@/lib/planner/preferences";

export default function PlannerFilters() {
  const router = useRouter();
  const { t } = useTranslation();
  const theme = useAppTheme();
  const styles = createStyles(theme);

  const [onlyUpcoming, setOnlyUpcoming] = useState(DEFAULT_PLANNER_PREFERENCES.onlyUpcoming);
  const [showCompleted, setShowCompleted] = useState(DEFAULT_PLANNER_PREFERENCES.showCompleted);
  const [aiSuggestions, setAiSuggestions] = useState(DEFAULT_PLANNER_PREFERENCES.aiSuggestions);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    void getPlannerPreferences().then((p) => {
      if (!active) return;
      setOnlyUpcoming(p.onlyUpcoming);
      setShowCompleted(p.showCompleted);
      setAiSuggestions(p.aiSuggestions);
    });
    return () => {
      active = false;
    };
  }, []);

  const save = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await savePlannerPreferences({ onlyUpcoming, showCompleted, aiSuggestions });
      router.back();
    } catch {
      Alert.alert(t("planner.prefs.saveFailed"), t("common.tryAgain"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.screen}>
      <Header
        title={t("planner.prefs.headerTitle")}
        onBack={() => router.back()}
        trailing={
          <TextButton title={saving ? t("planner.saving") : t("common.save")} onPress={() => void save()} disabled={saving} style={styles.saveBtn} />
        }
      />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Card style={styles.card}>
          <Text style={styles.title}>{t("planner.prefs.title")}</Text>
          <Text style={styles.subtitle}>{t("planner.prefs.subtitle")}</Text>

          <ListRow
            title={t("planner.prefs.onlyUpcoming")}
            subtitle={t("planner.prefs.onlyUpcomingSub")}
            style={styles.row}
            trailing={
              <Switch
                value={onlyUpcoming}
                onValueChange={setOnlyUpcoming}
                trackColor={{ false: theme.colors.border, true: theme.colors.primary }}
                ios_backgroundColor={theme.colors.border}
              />
            }
          />
          <View style={styles.hr} />
          <ListRow
            title={t("planner.prefs.showCompleted")}
            subtitle={t("planner.prefs.showCompletedSub")}
            style={styles.row}
            trailing={
              <Switch
                value={showCompleted}
                onValueChange={setShowCompleted}
                trackColor={{ false: theme.colors.border, true: theme.colors.primary }}
                ios_backgroundColor={theme.colors.border}
              />
            }
          />
          <View style={styles.hr} />
          <ListRow
            title={t("planner.prefs.aiSuggestions")}
            subtitle={t("planner.prefs.aiSuggestionsSub")}
            style={styles.row}
            leading={<SparklesIcon size={16} color={theme.colors.primary} />}
            trailing={
              <Switch
                value={aiSuggestions}
                onValueChange={setAiSuggestions}
                trackColor={{ false: theme.colors.border, true: theme.colors.primary }}
                ios_backgroundColor={theme.colors.border}
              />
            }
          />
        </Card>

        <Text style={styles.note}>{t("planner.prefs.note")}</Text>
      </ScrollView>
    </View>
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.colors.background },
    scroll: { padding: theme.spacing.xl, paddingBottom: theme.spacing.huge },
    saveBtn: { paddingHorizontal: 0 },
    card: {},
    title: { ...theme.type.h2, fontFamily: theme.type.h2.fontFamily, color: theme.colors.textPrimary, marginBottom: theme.spacing.xxs },
    subtitle: { ...theme.type.body, fontFamily: theme.type.body.fontFamily, color: theme.colors.textSecondary, marginBottom: theme.spacing.md },
    row: { paddingHorizontal: 0 },
    hr: { height: 1, backgroundColor: theme.colors.border },
    note: { ...theme.type.caption, fontFamily: theme.type.caption.fontFamily, color: theme.colors.textSecondary, textAlign: "center", marginTop: theme.spacing.md },
  });
}
