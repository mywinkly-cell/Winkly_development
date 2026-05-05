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
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import * as Calendar from "expo-calendar";
import * as Location from "expo-location";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Colors, Typography, Layout } from "@/constants/tokens";

const STORAGE_KEYS = {
  reminders: "winkly_planner_reminders",
  weeklyDigest: "winkly_planner_weekly_digest",
};

type PermissionStatus = "undetermined" | "granted" | "denied";

export default function PlannerSettings() {
  const router = useRouter();
  const [reminders, setReminders] = useState(false);
  const [weeklyDigest, setWeeklyDigest] = useState(false);
  const [calendarStatus, setCalendarStatus] = useState<PermissionStatus>("undetermined");
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
      const [r, w] = await Promise.all([
        AsyncStorage.getItem(STORAGE_KEYS.reminders),
        AsyncStorage.getItem(STORAGE_KEYS.weeklyDigest),
      ]);
      setReminders(r === "true");
      setWeeklyDigest(w === "true");
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
          "Calendar access",
          "To sync planner items with your calendar, enable calendar access in your device settings.",
          [
            { text: "Cancel", style: "cancel" },
            { text: "Open settings", onPress: () => Linking.openSettings() },
          ]
        );
      }
    } catch (e) {
      Alert.alert("Error", "Could not request calendar access. Please try again.");
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
          "Location access",
          "To show event locations and get directions, enable location access in your device settings.",
          [
            { text: "Cancel", style: "cancel" },
            { text: "Open settings", onPress: () => Linking.openSettings() },
          ]
        );
      }
    } catch (e) {
      Alert.alert("Error", "Could not request location access. Please try again.");
    } finally {
      setLoading(null);
    }
  };

  const getStatusLabel = (status: PermissionStatus) => {
    if (status === "granted") return "Connected";
    if (status === "denied") return "Access denied";
    return "Not connected";
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
            accessibilityLabel="Back"
          >
            <Ionicons name="arrow-back" size={24} color={Colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Planner settings</Text>
          <View style={styles.headerPlaceholder} />
        </View>

        <View style={styles.card}>
          <Text style={styles.title}>Notifications</Text>

          <View style={styles.row}>
            <View style={styles.rowText}>
              <Text style={styles.rowTitle}>Reminders</Text>
              <Text style={styles.rowSub}>Get notified before planned items.</Text>
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
              <Text style={styles.rowTitle}>Weekly digest</Text>
              <Text style={styles.rowSub}>Summary of your week and suggestions.</Text>
            </View>
            <Switch
              value={weeklyDigest}
              onValueChange={(v) => { Haptics.selectionAsync(); saveWeeklyDigest(v); }}
              trackColor={{ false: Colors.gray300, true: Colors.primaryViolet }}
              ios_backgroundColor={Colors.gray300}
            />
          </View>
        </View>

        <View style={[styles.card, { marginTop: 20 }]}>
          <Text style={styles.title}>Calendar & Maps</Text>
          <Text style={styles.subtitle}>
            Sync your planner with your device calendar and enable maps for event locations.
          </Text>

          <View style={styles.integrationRow}>
            <View style={[styles.iconWrap, { backgroundColor: Colors.events.primary + "20" }]}>
              <Ionicons name="calendar-outline" size={24} color={Colors.events.primary} />
            </View>
            <View style={styles.integrationContent}>
              <Text style={styles.rowTitle}>
                {Platform.OS === "ios" ? "Apple Calendar" : "Google Calendar"}
              </Text>
              <Text style={styles.rowSub}>
                Sync planner items with your device calendar. Never miss a date or event.
              </Text>
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
                ? "Requesting…"
                : calendarStatus === "granted"
                  ? "Disconnect"
                  : "Connect"}
            </Text>
            {calendarStatus !== "granted" && loading !== "calendar" && (
              <Ionicons name="chevron-forward" size={18} color={Colors.primaryViolet} />
            )}
          </TouchableOpacity>

          <View style={styles.hr} />

          <View style={styles.integrationRow}>
            <View style={[styles.iconWrap, { backgroundColor: Colors.friends.primary + "20" }]}>
              <Ionicons name="location-outline" size={24} color={Colors.friends.primary} />
            </View>
            <View style={styles.integrationContent}>
              <Text style={styles.rowTitle}>
                {Platform.OS === "ios" ? "Apple Maps" : "Google Maps"}
              </Text>
              <Text style={styles.rowSub}>
                Show event locations and get directions. Used for nearby discovery.
              </Text>
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
                ? "Requesting…"
                : locationStatus === "granted"
                  ? "Disconnect"
                  : "Connect"}
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
  headerTitle: { ...Typography.h3, color: Colors.textPrimary },
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
});
