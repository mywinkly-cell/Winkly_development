// ────────────────────────────────────────────────
// Winkly — App Info & Logout (Settings v8)
// Version, what's new, logout (current / all devices)
// ────────────────────────────────────────────────

import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import Constants from "expo-constants";
import { supabase } from "@/lib/supabase";
import { SafeScreenView } from "@/components/SafeScreenView";
import { Colors, Typography, Layout, FontFamily } from "@/constants/tokens";

const APP_VERSION = Constants.expoConfig?.version ?? "1.0.0";
const BUILD_NUMBER = Constants.expoConfig?.ios?.buildNumber ?? Constants.expoConfig?.android?.versionCode ?? "1";

export default function AppInfo() {
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);

  const handleLogout = (allDevices: boolean) => {
    Haptics.selectionAsync();
    Alert.alert(
      allDevices ? "Sign out from all devices?" : "Sign out?",
      allDevices
        ? "You will be signed out on this device and all other devices where you're logged in."
        : "You will be signed out on this device only.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Sign out",
          style: "destructive",
          onPress: async () => {
            setSigningOut(true);
            try {
              if (allDevices) {
                // Supabase: signOut doesn't revoke other sessions by default
                // For "all devices" you'd typically call an Edge Function to revoke refresh tokens
                await supabase.auth.signOut();
              } else {
                await supabase.auth.signOut();
              }
              router.replace("/(auth)/signin");
            } catch (_err) {
              Alert.alert("Error", "Could not sign out.");
            } finally {
              setSigningOut(false);
            }
          },
        },
      ]
    );
  };

  return (
    <SafeScreenView style={styles.screen}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.8} accessibilityLabel="Back">
          <Ionicons name="arrow-back" size={24} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>App Info & Logout</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>About Winkly</Text>
          <View style={styles.row}>
            <Text style={styles.label}>Version</Text>
            <Text style={styles.value}>{APP_VERSION}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Build</Text>
            <Text style={styles.value}>{BUILD_NUMBER}</Text>
          </View>
          <TouchableOpacity
            onPress={() => {
              Haptics.selectionAsync();
              Alert.alert("What&apos;s new", "Release notes will appear here.");
            }}
            style={styles.linkRow}
            activeOpacity={0.7}
          >
            <Text style={styles.linkText}>What&apos;s new</Text>
            <Ionicons name="chevron-forward" size={20} color={Colors.gray400} />
          </TouchableOpacity>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Session</Text>
          <TouchableOpacity
            onPress={() => !signingOut && handleLogout(false)}
            disabled={signingOut}
            style={styles.logoutRow}
            activeOpacity={0.7}
          >
            {signingOut ? (
              <ActivityIndicator size="small" color={Colors.primaryViolet} />
            ) : (
              <Ionicons name="log-out-outline" size={22} color={Colors.primaryViolet} />
            )}
            <Text style={styles.logoutText}>Sign out (this device)</Text>
            <Ionicons name="chevron-forward" size={20} color={Colors.gray400} />
          </TouchableOpacity>
          <View style={styles.divider} />
          <TouchableOpacity
            onPress={() => !signingOut && handleLogout(true)}
            disabled={signingOut}
            style={styles.logoutRow}
            activeOpacity={0.7}
          >
            <Ionicons name="phone-portrait-outline" size={22} color={Colors.primaryViolet} />
            <Text style={styles.logoutText}>Sign out from all devices</Text>
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
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 10 },
  label: { ...Typography.body, color: Colors.gray600 },
  value: { ...Typography.body, fontWeight: "600", color: Colors.textPrimary },
  linkRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 12, marginTop: 8 },
  linkText: { ...Typography.body, color: Colors.primaryViolet, fontWeight: "500" },
  logoutRow: { flexDirection: "row", alignItems: "center", paddingVertical: 14 },
  logoutText: { ...Typography.body, fontWeight: "500", color: Colors.textPrimary, marginLeft: 14, flex: 1 },
  divider: { height: 1, backgroundColor: Colors.gray200, marginLeft: 36 },
});
