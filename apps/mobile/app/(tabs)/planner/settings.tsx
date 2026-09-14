// apps/mobile/app/planner/settings.tsx
// Winkly – Planner Settings: notifications, calendar & maps integration
// Preferences auto-save. Connect/Disconnect toggles for integrations.

import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  Switch,
  Alert,
  StyleSheet,
  Platform,
  Linking,
} from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import * as Calendar from "expo-calendar";
import * as Location from "expo-location";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Card, Chip, Header, ListRow, SecondaryButton } from "@/components/ds";
import { useAppTheme, type AppTheme } from "@/constants/design-system";
import {
  CALENDAR_SYNC_STORAGE_KEY,
  setCalendarSyncPreference,
  backfillPlannerItemsToDeviceCalendar,
} from "@/lib/integrations/calendarSync";
import {
  connectCloudCalendar,
  disconnectCloudCalendar,
  getCloudCalendarConnections,
  type CloudCalendarProvider,
} from "@/lib/integrations/cloudCalendarAuth";
import { supabase } from "@/lib/supabase";

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
  const theme = useAppTheme();
  const styles = createStyles(theme);
  const [reminders, setReminders] = useState(false);
  const [weeklyDigest, setWeeklyDigest] = useState(false);
  const [defaultReminderWhen, setDefaultReminderWhen] = useState<DefaultReminderWhen>("15m");
  const [defaultReminderChannel, setDefaultReminderChannel] = useState<DefaultReminderChannel>("push");
  const [calendarStatus, setCalendarStatus] = useState<PermissionStatus>("undetermined");
  const [calendarSync, setCalendarSync] = useState(false);
  const [locationStatus, setLocationStatus] = useState<PermissionStatus>("undetermined");
  const [loading, setLoading] = useState<"calendar" | "location" | null>(null);
  const [cloudConnections, setCloudConnections] = useState<{ google: boolean; microsoft: boolean }>({
    google: false,
    microsoft: false,
  });
  const [cloudLoading, setCloudLoading] = useState<CloudCalendarProvider | null>(null);

  const loadCloudConnections = useCallback(async () => {
    const status = await getCloudCalendarConnections();
    setCloudConnections(status);
  }, []);

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
    loadCloudConnections();
  }, [loadPreferences, loadCloudConnections]);

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

  /** Sync items added before the user opted in — fire-and-forget, doesn't block the toggle. */
  const backfillCalendarSync = useCallback(() => {
    void (async () => {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (uid) await backfillPlannerItemsToDeviceCalendar(uid);
    })();
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
      backfillCalendarSync();
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
        backfillCalendarSync();
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

  const handleCloudCalendarConnect = async (provider: CloudCalendarProvider) => {
    Haptics.selectionAsync();
    setCloudLoading(provider);
    try {
      const result = await connectCloudCalendar(provider);
      if (result.ok) {
        await loadCloudConnections();
      } else if (result.reason === "not_configured") {
        Alert.alert(t("common.error"), t("planner.cloudNotConfigured"));
      } else if (result.reason !== "cancelled") {
        Alert.alert(t("common.error"), t("planner.cloudConnectFailed"));
      }
    } finally {
      setCloudLoading(null);
    }
  };

  const handleCloudCalendarDisconnect = async (provider: CloudCalendarProvider) => {
    Haptics.selectionAsync();
    setCloudLoading(provider);
    try {
      await disconnectCloudCalendar(provider);
      await loadCloudConnections();
    } finally {
      setCloudLoading(null);
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
    if (status === "granted") return theme.colors.success;
    if (status === "denied") return theme.modeAccent("romance").primary;
    return theme.colors.textSecondary;
  };

  return (
    <View style={styles.screen}>
      <Header title={t("planner.settingsTitle")} onBack={() => { Haptics.selectionAsync(); router.back(); }} />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Card style={styles.card}>
          <Text style={styles.title}>{t("planner.notificationsSection")}</Text>

          <ListRow
            title={t("planner.reminders")}
            subtitle={t("planner.remindersSub")}
            style={styles.row}
            trailing={
              <Switch
                value={reminders}
                onValueChange={(v) => { Haptics.selectionAsync(); saveReminders(v); }}
                trackColor={{ false: theme.colors.border, true: theme.colors.primary }}
                ios_backgroundColor={theme.colors.border}
              />
            }
          />

          <View style={styles.hr} />

          <ListRow
            title={t("planner.weeklyDigest")}
            subtitle={t("planner.weeklyDigestSub")}
            style={styles.row}
            trailing={
              <Switch
                value={weeklyDigest}
                onValueChange={(v) => { Haptics.selectionAsync(); saveWeeklyDigest(v); }}
                trackColor={{ false: theme.colors.border, true: theme.colors.primary }}
                ios_backgroundColor={theme.colors.border}
              />
            }
          />

          <View style={styles.hr} />

          <Text style={styles.rowSub}>{t("planner.defaultReminderTime")}</Text>
          <View style={styles.pickerRow}>
            {DEFAULT_REMINDER_WHEN_OPTIONS.map((opt) => (
              <Chip
                key={opt.value}
                label={t(opt.labelKey)}
                selected={defaultReminderWhen === opt.value}
                onPress={() => { Haptics.selectionAsync(); saveDefaultReminderWhen(opt.value); }}
              />
            ))}
          </View>

          <View style={styles.hr} />

          <Text style={styles.rowSub}>{t("planner.defaultReminderChannel")}</Text>
          <View style={styles.pickerRow}>
            {DEFAULT_REMINDER_CHANNEL_OPTIONS.map((opt) => (
              <Chip
                key={opt.value}
                label={t(opt.labelKey)}
                selected={defaultReminderChannel === opt.value}
                onPress={() => { Haptics.selectionAsync(); saveDefaultReminderChannel(opt.value); }}
              />
            ))}
          </View>

          <View style={styles.hr} />

          <ListRow
            title={t("planner.manageAppNotifications")}
            onPress={() => { Haptics.selectionAsync(); router.push("/account/notifications-preferences"); }}
            style={styles.row}
            leading={<Ionicons name="notifications-outline" size={20} color={theme.colors.primary} />}
          />
        </Card>

        <Card style={styles.card2}>
          <Text style={styles.title}>{t("planner.calendarMapsSection")}</Text>
          <Text style={styles.subtitle}>{t("planner.calendarMapsSub")}</Text>

          <View style={styles.integrationRow}>
            <View style={{ ...styles.iconWrap, backgroundColor: theme.modeAccent("events").bg }}>
              <Ionicons name="calendar-outline" size={24} color={theme.modeAccent("events").primary} />
            </View>
            <View style={styles.integrationContent}>
              <Text style={styles.rowTitle}>
                {Platform.OS === "ios" ? t("planner.appleCalendar") : t("planner.googleCalendar")}
              </Text>
              <Text style={styles.rowSub}>{t("planner.calendarSyncSub")}</Text>
              <View style={styles.statusRow}>
                <View style={{ ...styles.statusDot, backgroundColor: getStatusColor(calendarStatus) }} />
                <Text style={{ ...styles.statusText, color: getStatusColor(calendarStatus) }}>
                  {getStatusLabel(calendarStatus)}
                </Text>
              </View>
            </View>
          </View>
          <SecondaryButton
            title={
              loading === "calendar"
                ? t("planner.requesting")
                : calendarStatus === "granted"
                  ? t("planner.disconnect")
                  : t("planner.connect")
            }
            onPress={handleCalendarToggle}
            disabled={loading === "calendar"}
            loading={loading === "calendar"}
          />

          <ListRow
            title={t("planner.syncToCalendar")}
            subtitle={calendarStatus === "granted" ? t("planner.syncToCalendarGranted") : t("planner.syncToCalendarPrompt")}
            style={styles.row}
            trailing={
              <Switch
                value={calendarSync}
                onValueChange={handleCalendarSyncToggle}
                disabled={loading === "calendar"}
                trackColor={{ false: theme.colors.border, true: theme.colors.primary }}
                ios_backgroundColor={theme.colors.border}
              />
            }
          />

          <View style={styles.hr} />

          <View style={styles.integrationRow}>
            <View style={{ ...styles.iconWrap, backgroundColor: theme.modeAccent("friends").bg }}>
              <Ionicons name="location-outline" size={24} color={theme.modeAccent("friends").primary} />
            </View>
            <View style={styles.integrationContent}>
              <Text style={styles.rowTitle}>
                {Platform.OS === "ios" ? t("planner.appleMaps") : t("planner.googleMaps")}
              </Text>
              <Text style={styles.rowSub}>{t("planner.mapsSub")}</Text>
              <View style={styles.statusRow}>
                <View style={{ ...styles.statusDot, backgroundColor: getStatusColor(locationStatus) }} />
                <Text style={{ ...styles.statusText, color: getStatusColor(locationStatus) }}>
                  {getStatusLabel(locationStatus)}
                </Text>
              </View>
            </View>
          </View>
          <SecondaryButton
            title={
              loading === "location"
                ? t("planner.requesting")
                : locationStatus === "granted"
                  ? t("planner.disconnect")
                  : t("planner.connect")
            }
            onPress={handleLocationToggle}
            disabled={loading === "location"}
            loading={loading === "location"}
          />
        </Card>

        <Card style={styles.card2}>
          <Text style={styles.title}>{t("planner.cloudCalendarSection")}</Text>
          <Text style={styles.subtitle}>{t("planner.cloudCalendarSectionSub")}</Text>

          {(["google", "microsoft"] as CloudCalendarProvider[]).map((provider, idx) => {
            const connected = cloudConnections[provider];
            const isLoading = cloudLoading === provider;
            return (
              <React.Fragment key={provider}>
                {idx > 0 && <View style={styles.hr} />}
                <View style={styles.integrationRow}>
                  <View style={{ ...styles.iconWrap, backgroundColor: theme.modeAccent("romance").bg }}>
                    <Ionicons name="cloud-outline" size={24} color={theme.modeAccent("romance").primary} />
                  </View>
                  <View style={styles.integrationContent}>
                    <Text style={styles.rowTitle}>
                      {provider === "google" ? t("planner.googleCalendarTitle") : t("planner.outlookCalendarTitle")}
                    </Text>
                    <View style={styles.statusRow}>
                      <View
                        style={{
                          ...styles.statusDot,
                          backgroundColor: connected ? theme.colors.success : theme.colors.textSecondary,
                        }}
                      />
                      <Text style={{ ...styles.statusText, color: connected ? theme.colors.success : theme.colors.textSecondary }}>
                        {connected ? t("planner.cloudConnected") : t("planner.cloudNotConnected")}
                      </Text>
                    </View>
                  </View>
                </View>
                <SecondaryButton
                  title={
                    isLoading
                      ? t("planner.cloudConnecting")
                      : connected
                        ? t("planner.disconnect")
                        : t("planner.connect")
                  }
                  onPress={() =>
                    connected ? handleCloudCalendarDisconnect(provider) : handleCloudCalendarConnect(provider)
                  }
                  disabled={isLoading}
                  loading={isLoading}
                />
              </React.Fragment>
            );
          })}
        </Card>
      </ScrollView>
    </View>
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.colors.background },
    scroll: { padding: theme.spacing.xl, paddingBottom: theme.spacing.huge },
    card: {},
    card2: { marginTop: theme.spacing.xl },
    title: { ...theme.type.h2, fontFamily: theme.type.h2.fontFamily, color: theme.colors.textPrimary, marginBottom: theme.spacing.xxs },
    subtitle: { ...theme.type.body, fontFamily: theme.type.body.fontFamily, color: theme.colors.textSecondary, marginBottom: theme.spacing.md },
    row: { paddingHorizontal: 0 },
    rowTitle: { ...theme.type.bodyMedium, fontFamily: theme.type.bodyMedium.fontFamily, color: theme.colors.textPrimary, marginBottom: 3 },
    rowSub: { ...theme.type.caption, fontFamily: theme.type.caption.fontFamily, color: theme.colors.textSecondary },
    hr: { height: 1, backgroundColor: theme.colors.border, marginVertical: theme.spacing.md },
    integrationRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      marginBottom: theme.spacing.sm,
    },
    iconWrap: {
      width: 44,
      height: 44,
      borderRadius: theme.radii.sm,
      alignItems: "center",
      justifyContent: "center",
      marginRight: theme.spacing.md,
    },
    integrationContent: { flex: 1 },
    statusRow: {
      flexDirection: "row",
      alignItems: "center",
      marginTop: theme.spacing.xs,
    },
    statusDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      marginRight: theme.spacing.xs,
    },
    statusText: { ...theme.type.caption, fontFamily: theme.type.caption.fontFamily, fontWeight: "600" },
    pickerRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: theme.spacing.sm,
      marginTop: theme.spacing.sm,
    },
  });
}
