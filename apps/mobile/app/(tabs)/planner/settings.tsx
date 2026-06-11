// apps/mobile/app/planner/settings.tsx
// Winkly – Planner Settings: notifications, calendar & maps integration
// Preferences auto-save. Connect/Disconnect toggles for integrations.

import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Switch,
  Alert,
  StyleSheet,
  Platform,
  Linking,
  ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import * as Calendar from "expo-calendar";
import * as Location from "expo-location";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Colors, Typography, Layout } from "@/constants/tokens";
import { CALENDAR_SYNC_STORAGE_KEY, setCalendarSyncPreference } from "@/lib/integrations/calendarSync";

const STORAGE_KEYS = {
  reminders: "winkly_planner_reminders",
  weeklyDigest: "winkly_planner_weekly_digest",
  defaultReminderWhen: "winkly_planner_default_reminder_when",
  defaultReminderChannel: "winkly_planner_default_reminder_channel",
  calendarSync: CALENDAR_SYNC_STORAGE_KEY,
};

export type DefaultReminderWhen = "at_time" | "5m" | "10m" | "15m" | "30m" | "1h" | "1d";
export type DefaultReminderChannel = "push" | "email" | "both";

const DEFAULT_REMINDER_WHEN_OPTIONS: { value: DefaultReminderWhen; labelKey: string }[] = [
  { value: "at_time", labelKey: "planner.atTimeOfEvent" },
  { value: "5m", labelKey: "planner.minutesBefore5" },
  { value: "10m", labelKey: "planner.minutesBefore10" },
  { value: "15m", labelKey: "planner.minutesBefore15" },
  { value: "30m", labelKey: "planner.minutesBefore30" },
  { value: "1h", labelKey: "planner.hourBefore" },
  { value: "1d", labelKey: "planner.dayBefore" },
];
const DEFAULT_REMINDER_CHANNEL_OPTIONS: { value: DefaultReminderChannel; labelKey: string }[] = [
  { value: "push", labelKey: "planner.pushNotification" },
  { value: "email", labelKey: "planner.email" },
  { value: "both", labelKey: "planner.both" },
];

type PermissionStatus = "undetermined" | "granted" | "denied";

export default function PlannerSettings() {
  const router = useRouter();
  const { t } = useTranslation();
  const [reminders, setReminders] = useState(false);
  const [weeklyDigest, setWeeklyDigest] = useState(false);
  const [defaultReminderWhen, setDefaultReminderWhen] = useState<DefaultReminderWhen>("15m");
  const [defaultReminderChannel, setDefaultReminderChannel] = useState<DefaultReminderChannel>("push");
  const [calendarStatus, setCalendarStatus] = useState<PermissionStatus>("undetermined");
  const [calendarSync, setCalendarSync] = useState(false);
  const [locationStatus, setLocationStatus] = useState<PermissionStatus>("undetermined");
  const [loading, setLoading] = useState<"calendar" | "location" | null>(null);

  const checkCalendarPermission = async () => {
    try {
      const { status } = await Calendar.getCalendarPermissionsAsync();
      setCalendarStatus(status === "granted" ? "granted" : status === "denied" ? "denied" : "undetermined");
    } catch {
      setCalendarStatus("undetermined");
    }
  };

  const checkLocationPermission = async () => {
    try {
      const { status } = await Location.getForegroundPermissionsAsync();
      setLocationStatus(status === "granted" ? "granted" : status === "denied" ? "denied" : "undetermined");
    } catch {
      setLocationStatus("undetermined");
    }
  };

  const loadPreferences = useCallback(async () => {
    try {
      const [r, w, when, ch, sync] = await Promise.all([
        AsyncStorage.getItem(STORAGE_KEYS.reminders),
        AsyncStorage.getItem(STORAGE_KEYS.weeklyDigest),
        AsyncStorage.getItem(STORAGE_KEYS.defaultReminderWhen),
        AsyncStorage.getItem(STORAGE_KEYS.defaultReminderChannel),
        AsyncStorage.getItem(STORAGE_KEYS.calendarSync),
      ]);
      setReminders(r === "true");
      setWeeklyDigest(w === "true");
      setCalendarSync(sync === "true");
      if (when && ["at_time", "5m", "10m", "15m", "30m", "1h", "1d"].includes(when)) {
        setDefaultReminderWhen(when as DefaultReminderWhen);
      }
      if (ch && ["push", "email", "both"].includes(ch)) {
        setDefaultReminderChannel(ch as DefaultReminderChannel);
      }
    } catch {
      // use defaults
    }
  }, []);

  useEffect(() => {
    checkCalendarPermission();
    checkLocationPermission();
    loadPreferences();
  }, [loadPreferences]);

  const saveReminders = useCallback(async (value: boolean) => {
    setReminders(value);
    try {
      await AsyncStorage.setItem(STORAGE_KEYS.reminders, String(value));
    } catch {
      // ignore
    }
  }, []);

  const saveWeeklyDigest = useCallback(async (value: boolean) => {
    setWeeklyDigest(value);
    try {
      await AsyncStorage.setItem(STORAGE_KEYS.weeklyDigest, String(value));
    } catch {
      // ignore
    }
  }, []);

  const saveDefaultReminderWhen = useCallback(async (value: DefaultReminderWhen) => {
    setDefaultReminderWhen(value);
    try {
      await AsyncStorage.setItem(STORAGE_KEYS.defaultReminderWhen, value);
    } catch {
      // ignore
    }
  }, []);

  const saveDefaultReminderChannel = useCallback(async (value: DefaultReminderChannel) => {
    setDefaultReminderChannel(value);
    try {
      await AsyncStorage.setItem(STORAGE_KEYS.defaultReminderChannel, value);
    } catch {
      // ignore
    }
  }, []);

  const handleCalendarToggle = async () => {
    Haptics.selectionAsync();
    if (calendarStatus === "granted") {
      Linking.openSettings();
      return;
    }
    if (calendarStatus === "denied") {
      Linking.openSettings();
      return;
    }
    setLoading("calendar");
    try {
      const { status } = await Calendar.requestCalendarPermissionsAsync();
      setCalendarStatus(status === "granted" ? "granted" : status === "denied" ? "denied" : "undetermined");
      if (status === "denied") {
        Alert.alert(
          t("planner.calendarAccessTitle"),
          t("planner.calendarAccessMessage"),
          [
            { text: t("common.cancel"), style: "cancel" },
            { text: t("planner.openSettings"), onPress: () => Linking.openSettings() },
          ]
        );
      }
    } catch (_e) {
      Alert.alert(t("common.error"), t("planner.calendarPermissionError"));
    } finally {
      setLoading(null);
    }
  };

  const persistCalendarSync = useCallback(async (value: boolean) => {
    setCalendarSync(value);
    await setCalendarSyncPreference(value);
  }, []);

  const handleCalendarSyncToggle = async (value: boolean) => {
    Haptics.selectionAsync();

    // Turning off is always allowed and immediate.
    if (!value) {
      await persistCalendarSync(false);
      return;
    }

    // Turning on requires granted calendar permission — request it if needed.
    if (calendarStatus === "granted") {
      await persistCalendarSync(true);
      return;
    }

    if (calendarStatus === "denied") {
      Alert.alert(
        t("planner.calendarAccessNeededTitle"),
        t("planner.calendarAccessNeededMessage"),
        [
          { text: t("common.cancel"), style: "cancel" },
          { text: t("planner.openSettings"), onPress: () => Linking.openSettings() },
        ]
      );
      return;
    }

    setLoading("calendar");
    try {
      const { status } = await Calendar.requestCalendarPermissionsAsync();
      const next = status === "granted" ? "granted" : status === "denied" ? "denied" : "undetermined";
      setCalendarStatus(next);
      if (next === "granted") {
        await persistCalendarSync(true);
      } else {
        await persistCalendarSync(false);
        if (next === "denied") {
          Alert.alert(
            t("planner.calendarAccessTitle"),
            t("planner.calendarSyncOffMessage"),
            [
              { text: t("common.cancel"), style: "cancel" },
              { text: t("planner.openSettings"), onPress: () => Linking.openSettings() },
            ]
          );
        }
      }
    } catch (_e) {
      await persistCalendarSync(false);
      Alert.alert(t("common.error"), t("planner.calendarPermissionError"));
    } finally {
      setLoading(null);
    }
  };

  const handleLocationToggle = async () => {
    Haptics.selectionAsync();
    if (locationStatus === "granted") {
      Linking.openSettings();
      return;
    }
    if (locationStatus === "denied") {
      Linking.openSettings();
      return;
    }
    setLoading("location");
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      setLocationStatus(status === "granted" ? "granted" : status === "denied" ? "denied" : "undetermined");
      if (status === "denied") {
        Alert.alert(
          t("planner.locationAccessTitle"),
          t("planner.locationAccessMessage"),
          [
            { text: t("common.cancel"), style: "cancel" },
            { text: t("planner.openSettings"), onPress: () => Linking.openSettings() },
          ]
        );
      }
    } catch (_e) {
      Alert.alert(t("common.error"), t("planner.locationPermissionError"));
    } finally {
      setLoading(null);
    }
  };

  const getStatusLabel = (status: PermissionStatus) => {
    if (status === "granted") return t("planner.connected");
    if (status === "denied") return t("planner.accessDenied");
    return t("planner.notConnected");
  };

  const getStatusColor = (status: PermissionStatus) => {
    if (status === "granted") return Colors.events.primary;
    if (status === "denied") return Colors.romance.primary;
    return Colors.gray600;
  };

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.headerRow}>
          <TouchableOpacity
            onPress={() => { Haptics.selectionAsync(); router.back(); }}
            style={styles.backBtn}
            activeOpacity={0.9}
            accessibilityLabel={t("common.back")}
          >
            <Ionicons name="arrow-back" size={24} color={Colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{t("planner.settingsTitle")}</Text>
          <View style={styles.headerPlaceholder} />
        </View>

        <View style={styles.card}>
          <Text style={styles.title}>{t("planner.notificationsSection")}</Text>

          <View style={styles.row}>
            <View style={styles.rowText}>
              <Text style={styles.rowTitle}>{t("planner.reminders")}</Text>
              <Text style={styles.rowSub}>{t("planner.remindersSub")}</Text>
            </View>
            <Switch
              value={reminders}
              onValueChange={(v) => { Haptics.selectionAsync(); saveReminders(v); }}
              trackColor={{ false: Colors.gray300, true: Colors.primaryViolet }}
              ios_backgroundColor={Colors.gray300}
            />
          </View>

          <View style={styles.hr} />

          <View style={styles.row}>
            <View style={styles.rowText}>
              <Text style={styles.rowTitle}>{t("planner.weeklyDigest")}</Text>
              <Text style={styles.rowSub}>{t("planner.weeklyDigestSub")}</Text>
            </View>
            <Switch
              value={weeklyDigest}
              onValueChange={(v) => { Haptics.selectionAsync(); saveWeeklyDigest(v); }}
              trackColor={{ false: Colors.gray300, true: Colors.primaryViolet }}
              ios_backgroundColor={Colors.gray300}
            />
          </View>

          <View style={styles.hr} />

          <Text style={styles.rowSub}>{t("planner.defaultReminderTime")}</Text>
          <View style={styles.pickerRow}>
            {DEFAULT_REMINDER_WHEN_OPTIONS.map((opt) => (
              <TouchableOpacity
                key={opt.value}
                onPress={() => { Haptics.selectionAsync(); saveDefaultReminderWhen(opt.value); }}
                style={[styles.pillOption, defaultReminderWhen === opt.value && styles.pillOptionActive]}
                activeOpacity={0.8}
              >
                <Text style={[styles.pillOptionText, defaultReminderWhen === opt.value && styles.pillOptionTextActive]}>
                  {t(opt.labelKey)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.hr} />

          <Text style={styles.rowSub}>{t("planner.defaultReminderChannel")}</Text>
          <View style={styles.pickerRow}>
            {DEFAULT_REMINDER_CHANNEL_OPTIONS.map((opt) => (
              <TouchableOpacity
                key={opt.value}
                onPress={() => { Haptics.selectionAsync(); saveDefaultReminderChannel(opt.value); }}
                style={[styles.pillOption, defaultReminderChannel === opt.value && styles.pillOptionActive]}
                activeOpacity={0.8}
              >
                <Text style={[styles.pillOptionText, defaultReminderChannel === opt.value && styles.pillOptionTextActive]}>
                  {t(opt.labelKey)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.hr} />

          <TouchableOpacity
            onPress={() => { Haptics.selectionAsync(); router.push("/account/notifications-preferences"); }}
            style={styles.linkRow}
            activeOpacity={0.8}
          >
            <Ionicons name="notifications-outline" size={20} color={Colors.primaryViolet} />
            <Text style={styles.linkRowText}>{t("planner.manageAppNotifications")}</Text>
            <Ionicons name="chevron-forward" size={20} color={Colors.gray400} />
          </TouchableOpacity>
        </View>

        <View style={[styles.card, { marginTop: 20 }]}>
          <Text style={styles.title}>{t("planner.calendarMapsSection")}</Text>
          <Text style={styles.subtitle}>{t("planner.calendarMapsSub")}</Text>

          <View style={styles.integrationRow}>
            <View style={[styles.iconWrap, { backgroundColor: Colors.events.primary + "20" }]}>
              <Ionicons name="calendar-outline" size={24} color={Colors.events.primary} />
            </View>
            <View style={styles.integrationContent}>
              <Text style={styles.rowTitle}>
                {Platform.OS === "ios" ? t("planner.appleCalendar") : t("planner.googleCalendar")}
              </Text>
              <Text style={styles.rowSub}>{t("planner.calendarSyncSub")}</Text>
              <View style={styles.statusRow}>
                <View style={[styles.statusDot, { backgroundColor: getStatusColor(calendarStatus) }]} />
                <Text style={[styles.statusText, { color: getStatusColor(calendarStatus) }]}>
                  {getStatusLabel(calendarStatus)}
                </Text>
              </View>
            </View>
          </View>
          <TouchableOpacity
            onPress={handleCalendarToggle}
            disabled={loading === "calendar"}
            style={[styles.integrationBtn, loading === "calendar" && styles.integrationBtnDisabled]}
            activeOpacity={0.9}
          >
            {loading === "calendar" ? (
              <ActivityIndicator size="small" color={Colors.primaryViolet} />
            ) : null}
            <Text style={styles.integrationBtnText}>
              {loading === "calendar"
                ? t("planner.requesting")
                : calendarStatus === "granted"
                  ? t("planner.disconnect")
                  : t("planner.connect")}
            </Text>
            {calendarStatus !== "granted" && loading !== "calendar" && (
              <Ionicons name="chevron-forward" size={18} color={Colors.primaryViolet} />
            )}
          </TouchableOpacity>

          <View style={styles.row}>
            <View style={styles.rowText}>
              <Text style={styles.rowTitle}>{t("planner.syncToCalendar")}</Text>
              <Text style={styles.rowSub}>
                {calendarStatus === "granted"
                  ? t("planner.syncToCalendarGranted")
                  : t("planner.syncToCalendarPrompt")}
              </Text>
            </View>
            <Switch
              value={calendarSync}
              onValueChange={handleCalendarSyncToggle}
              disabled={loading === "calendar"}
              trackColor={{ false: Colors.gray300, true: Colors.primaryViolet }}
              ios_backgroundColor={Colors.gray300}
            />
          </View>

          <View style={styles.hr} />

          <View style={styles.integrationRow}>
            <View style={[styles.iconWrap, { backgroundColor: Colors.friends.primary + "20" }]}>
              <Ionicons name="location-outline" size={24} color={Colors.friends.primary} />
            </View>
            <View style={styles.integrationContent}>
              <Text style={styles.rowTitle}>
                {Platform.OS === "ios" ? t("planner.appleMaps") : t("planner.googleMaps")}
              </Text>
              <Text style={styles.rowSub}>{t("planner.mapsSub")}</Text>
              <View style={styles.statusRow}>
                <View style={[styles.statusDot, { backgroundColor: getStatusColor(locationStatus) }]} />
                <Text style={[styles.statusText, { color: getStatusColor(locationStatus) }]}>
                  {getStatusLabel(locationStatus)}
                </Text>
              </View>
            </View>
          </View>
          <TouchableOpacity
            onPress={handleLocationToggle}
            disabled={loading === "location"}
            style={[styles.integrationBtn, loading === "location" && styles.integrationBtnDisabled]}
            activeOpacity={0.9}
          >
            {loading === "location" ? (
              <ActivityIndicator size="small" color={Colors.primaryViolet} />
            ) : null}
            <Text style={styles.integrationBtnText}>
              {loading === "location"
                ? t("planner.requesting")
                : locationStatus === "granted"
                  ? t("planner.disconnect")
                  : t("planner.connect")}
            </Text>
            {locationStatus !== "granted" && loading !== "location" && (
              <Ionicons name="chevron-forward" size={18} color={Colors.primaryViolet} />
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.backgroundLight },
  scroll: { padding: 20, paddingBottom: 40 },

  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 20,
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
  headerTitle: { ...Typography.headerTitle, color: Colors.textPrimary },
  headerPlaceholder: { width: 44 },

  card: {
    backgroundColor: Colors.white,
    borderRadius: Layout.radii.card,
    borderWidth: 1,
    borderColor: Colors.gray200,
    padding: 16,
  },
  title: { ...Typography.h2, color: Colors.textPrimary, marginBottom: 6 },
  subtitle: { ...Typography.body, color: Colors.gray700, marginBottom: 14 },

  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
  },
  rowText: { flex: 1, paddingRight: 14 },
  rowTitle: { ...Typography.body, color: Colors.textPrimary, marginBottom: 3, fontWeight: "600" },
  rowSub: { ...Typography.caption, color: Colors.gray600 },

  hr: { height: 1, backgroundColor: Colors.gray200, marginVertical: 12 },

  integrationRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 10,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 14,
  },
  integrationContent: { flex: 1 },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 6,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 6,
  },
  statusText: { ...Typography.caption, fontWeight: "600" },

  integrationBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: Colors.primaryViolet + "15",
    borderRadius: Layout.radii.control,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: Colors.primaryViolet + "40",
  },
  integrationBtnDisabled: {
    backgroundColor: Colors.gray100,
    borderColor: Colors.gray200,
    opacity: 0.8,
  },
  integrationBtnText: {
    ...Typography.button,
    color: Colors.primaryViolet,
    fontWeight: "600",
  },

  pickerRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 8,
  },
  pillOption: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: Colors.gray100,
    borderWidth: 1,
    borderColor: Colors.gray200,
  },
  pillOptionActive: {
    backgroundColor: Colors.primaryViolet + "18",
    borderColor: Colors.primaryViolet + "50",
  },
  pillOptionText: {
    ...Typography.caption,
    color: Colors.gray700,
    fontWeight: "500",
  },
  pillOptionTextActive: {
    color: Colors.primaryViolet,
    fontWeight: "600",
  },
  linkRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    gap: 12,
  },
  linkRowText: {
    flex: 1,
    ...Typography.body,
    color: Colors.primaryViolet,
    fontWeight: "500",
  },
});
