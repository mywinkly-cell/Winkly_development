// ────────────────────────────────────────────────
// Winkly — Notifications & Preferences (Settings v8)
// Push, email, sound, vibration, language
// ────────────────────────────────────────────────

import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Switch,
  StyleSheet,
} from "react-native";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { SafeScreenView } from "@/components/SafeScreenView";
import { Colors, Typography, Layout, FontFamily } from "@/constants/tokens";
import { SUPPORTED_LANGUAGES, normalizeLanguageCode } from "@/lib/i18n";

export default function NotificationsPreferences() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
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
  }: {
    title: string;
    subtitle?: string;
    value: boolean;
    onValueChange: (v: boolean) => void;
    icon: keyof typeof Ionicons.glyphMap;
  }) => (
    <View style={styles.toggleRow}>
      <View style={styles.iconWrap}>
        <Ionicons name={icon} size={20} color={Colors.primaryViolet} />
      </View>
      <View style={styles.toggleContent}>
        <Text style={styles.toggleTitle}>{title}</Text>
        {subtitle && <Text style={styles.toggleSubtitle}>{subtitle}</Text>}
      </View>
      <Switch
        value={value}
        onValueChange={(v) => {
          Haptics.selectionAsync();
          onValueChange(v);
        }}
        trackColor={{ false: Colors.gray300, true: Colors.primaryViolet + "60" }}
        thumbColor={value ? Colors.primaryViolet : Colors.gray400}
      />
    </View>
  );

  return (
    <SafeScreenView style={styles.screen}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.8} accessibilityLabel={t("common.back")}>
          <Ionicons name="arrow-back" size={24} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t("notifications.title")}</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t("notifications.pushTitle")}</Text>
          <ToggleRow
            title={t("notifications.matchesMessages")}
            subtitle={t("notifications.matchesMessagesSub")}
            value={pushMatches}
            onValueChange={setPushMatches}
            icon="heart-outline"
          />
          <View style={styles.divider} />
          <ToggleRow
            title={t("notifications.eventsReminders")}
            subtitle={t("notifications.eventsRemindersSub")}
            value={pushEvents}
            onValueChange={setPushEvents}
            icon="calendar-outline"
          />
          <View style={styles.divider} />
          <ToggleRow
            title={t("notifications.productUpdates")}
            subtitle={t("notifications.productUpdatesSub")}
            value={pushUpdates}
            onValueChange={setPushUpdates}
            icon="megaphone-outline"
          />
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t("notifications.emailTitle")}</Text>
          <ToggleRow
            title={t("notifications.marketing")}
            subtitle={t("notifications.marketingSub")}
            value={emailMarketing}
            onValueChange={setEmailMarketing}
            icon="mail-outline"
          />
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t("notifications.soundVibration")}</Text>
          <ToggleRow
            title={t("notifications.sound")}
            subtitle={t("notifications.soundSub")}
            value={soundEnabled}
            onValueChange={setSoundEnabled}
            icon="volume-high-outline"
          />
          <View style={styles.divider} />
          <ToggleRow
            title={t("notifications.vibration")}
            subtitle={t("notifications.vibrationSub")}
            value={vibrationEnabled}
            onValueChange={setVibrationEnabled}
            icon="phone-portrait-outline"
          />
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t("notifications.language")}</Text>
          <TouchableOpacity
            onPress={() => {
              Haptics.selectionAsync();
              router.push("/account/language" as any);
            }}
            style={styles.row}
            activeOpacity={0.7}
          >
            <Ionicons name="language-outline" size={20} color={Colors.primaryViolet} />
            <Text style={styles.rowText}>{t("notifications.language")}</Text>
            <Text style={styles.rowValue}>
              {SUPPORTED_LANGUAGES.find((l) => l.code === normalizeLanguageCode(i18n.language))?.name ?? "English"}
            </Text>
            <Ionicons name="chevron-forward" size={20} color={Colors.gray400} />
          </TouchableOpacity>
        </View>
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
  card: {
    backgroundColor: Colors.white,
    borderRadius: Layout.radii.card,
    padding: 20,
    marginBottom: 16,
  },
  cardTitle: {
    ...Typography.h3,
    fontFamily: FontFamily.heading,
    color: Colors.textPrimary,
    marginBottom: 16,
  },
  toggleRow: { flexDirection: "row", alignItems: "center", paddingVertical: 12 },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: Colors.primaryViolet + "15",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 14,
  },
  toggleContent: { flex: 1 },
  toggleTitle: { ...Typography.body, fontWeight: "600", color: Colors.textPrimary },
  toggleSubtitle: { ...Typography.caption, color: Colors.gray600, marginTop: 2 },
  divider: { height: 1, backgroundColor: Colors.gray200, marginLeft: 50 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
  },
  rowText: { ...Typography.body, color: Colors.textPrimary, marginLeft: 14, flex: 1 },
  rowValue: { ...Typography.caption, color: Colors.gray600 },
});
