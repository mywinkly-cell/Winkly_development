// ────────────────────────────────────────────────
// Winkly — Notifications & Preferences (Settings v8)
// Push, email, sound, vibration, language
// ────────────────────────────────────────────────

import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { View, Text, ScrollView, Switch, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { SafeScreenView } from "@/components/SafeScreenView";
import { Card, Header, ListRow } from "@/components/ds";
import { useAppTheme, type AppTheme } from "@/constants/design-system";
import { SUPPORTED_LANGUAGES, normalizeLanguageCode } from "@/lib/i18n";

export default function NotificationsPreferences() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const theme = useAppTheme();
  const styles = createStyles(theme);
  const [pushMatches, setPushMatches] = useState(true);
  const [pushEvents, setPushEvents] = useState(true);
  const [pushUpdates, setPushUpdates] = useState(false);
  const [emailMarketing, setEmailMarketing] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [vibrationEnabled, setVibrationEnabled] = useState(true);

  const ToggleRow = ({
    title,
    subtitle,
    value,
    onValueChange,
    icon,
    last,
  }: {
    title: string;
    subtitle?: string;
    value: boolean;
    onValueChange: (v: boolean) => void;
    icon: keyof typeof Ionicons.glyphMap;
    last?: boolean;
  }) => (
    <ListRow
      title={title}
      subtitle={subtitle}
      style={last ? styles.row : { ...styles.row, ...styles.rowBorder }}
      leading={
        <View style={styles.iconWrap}>
          <Ionicons name={icon} size={20} color={theme.colors.primary} />
        </View>
      }
      trailing={
        <Switch
          value={value}
          onValueChange={(v) => {
            Haptics.selectionAsync();
            onValueChange(v);
          }}
          trackColor={{ false: theme.colors.border, true: theme.colors.primary + "60" }}
          thumbColor={value ? theme.colors.primary : theme.colors.textMuted}
        />
      }
    />
  );

  return (
    <SafeScreenView style={styles.screen}>
      <Header title={t("notifications.title")} onBack={() => router.back()} />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={styles.sectionTitle}>{t("notifications.pushTitle")}</Text>
        <Card padding="none" style={styles.card}>
          <ToggleRow title={t("notifications.matchesMessages")} subtitle={t("notifications.matchesMessagesSub")} value={pushMatches} onValueChange={setPushMatches} icon="heart-outline" />
          <ToggleRow title={t("notifications.eventsReminders")} subtitle={t("notifications.eventsRemindersSub")} value={pushEvents} onValueChange={setPushEvents} icon="calendar-outline" />
          <ToggleRow title={t("notifications.productUpdates")} subtitle={t("notifications.productUpdatesSub")} value={pushUpdates} onValueChange={setPushUpdates} icon="megaphone-outline" last />
        </Card>

        <Text style={styles.sectionTitle}>{t("notifications.emailTitle")}</Text>
        <Card padding="none" style={styles.card}>
          <ToggleRow title={t("notifications.marketing")} subtitle={t("notifications.marketingSub")} value={emailMarketing} onValueChange={setEmailMarketing} icon="mail-outline" last />
        </Card>

        <Text style={styles.sectionTitle}>{t("notifications.soundVibration")}</Text>
        <Card padding="none" style={styles.card}>
          <ToggleRow title={t("notifications.sound")} subtitle={t("notifications.soundSub")} value={soundEnabled} onValueChange={setSoundEnabled} icon="volume-high-outline" />
          <ToggleRow title={t("notifications.vibration")} subtitle={t("notifications.vibrationSub")} value={vibrationEnabled} onValueChange={setVibrationEnabled} icon="phone-portrait-outline" last />
        </Card>

        <Text style={styles.sectionTitle}>{t("notifications.language")}</Text>
        <Card padding="none" style={styles.card}>
          <ListRow
            title={t("notifications.language")}
            subtitle={SUPPORTED_LANGUAGES.find((l) => l.code === normalizeLanguageCode(i18n.language))?.name ?? SUPPORTED_LANGUAGES[0].name}
            onPress={() => {
              Haptics.selectionAsync();
              router.push("/account/language" as any);
            }}
            style={styles.row}
            leading={
              <View style={styles.iconWrap}>
                <Ionicons name="language-outline" size={20} color={theme.colors.primary} />
              </View>
            }
          />
        </Card>
      </ScrollView>
    </SafeScreenView>
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.colors.backgroundMuted },
    scroll: { padding: theme.spacing.xl, paddingBottom: theme.spacing.huge },
    sectionTitle: {
      ...theme.type.overline,
      fontFamily: theme.type.overline.fontFamily,
      color: theme.colors.textSecondary,
      marginBottom: theme.spacing.sm,
      marginLeft: theme.spacing.xxs,
    },
    card: { marginBottom: theme.spacing.xxl, overflow: "hidden" },
    row: { paddingHorizontal: theme.spacing.lg },
    rowBorder: { borderBottomWidth: 1, borderBottomColor: theme.colors.border },
    iconWrap: {
      width: 36,
      height: 36,
      borderRadius: theme.radii.sm,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.colors.primary + "15",
    },
  });
}
