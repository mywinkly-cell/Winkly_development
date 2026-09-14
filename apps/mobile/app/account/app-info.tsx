// ────────────────────────────────────────────────
// Winkly — App Info & Logout (Settings v8)
// Version, what's new, logout (current / all devices)
// ────────────────────────────────────────────────

import React, { useState } from "react";
import { View, Text, ScrollView, Alert, ActivityIndicator, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import Constants from "expo-constants";
import { supabase } from "@/lib/supabase";
import { SafeScreenView } from "@/components/SafeScreenView";
import { Card, Header, ListRow } from "@/components/ds";
import { useAppTheme, type AppTheme } from "@/constants/design-system";

const APP_VERSION = Constants.expoConfig?.version ?? "1.0.0";
const BUILD_NUMBER = Constants.expoConfig?.ios?.buildNumber ?? Constants.expoConfig?.android?.versionCode ?? "1";

export default function AppInfo() {
  const router = useRouter();
  const theme = useAppTheme();
  const styles = createStyles(theme);
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
      <Header title="App Info & Logout" onBack={() => router.back()} />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Card style={styles.card}>
          <Text style={styles.cardTitle}>About Winkly</Text>
          <View style={styles.row}>
            <Text style={styles.label}>Version</Text>
            <Text style={styles.value}>{APP_VERSION}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Build</Text>
            <Text style={styles.value}>{BUILD_NUMBER}</Text>
          </View>
          <ListRow
            title="What's new"
            onPress={() => {
              Haptics.selectionAsync();
              Alert.alert("What's new", "Release notes will appear here.");
            }}
            style={styles.linkRow}
          />
        </Card>

        <Card padding="none" style={styles.card}>
          <Text style={{ ...styles.cardTitle, padding: theme.spacing.lg, paddingBottom: 0 }}>Session</Text>
          <ListRow
            title="Sign out (this device)"
            disabled={signingOut}
            onPress={() => !signingOut && handleLogout(false)}
            style={styles.sessionRow}
            leading={
              signingOut ? (
                <ActivityIndicator size="small" color={theme.colors.primary} />
              ) : (
                <Ionicons name="log-out-outline" size={22} color={theme.colors.primary} />
              )
            }
          />
          <ListRow
            title="Sign out from all devices"
            disabled={signingOut}
            onPress={() => !signingOut && handleLogout(true)}
            style={{ ...styles.sessionRow, ...styles.rowBorder }}
            leading={<Ionicons name="phone-portrait-outline" size={22} color={theme.colors.primary} />}
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
    card: { marginBottom: theme.spacing.lg, overflow: "hidden" },
    cardTitle: {
      ...theme.type.h3,
      fontFamily: theme.type.h3.fontFamily,
      color: theme.colors.textPrimary,
      marginBottom: theme.spacing.md,
    },
    row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: theme.spacing.sm },
    label: { ...theme.type.body, fontFamily: theme.type.body.fontFamily, color: theme.colors.textSecondary },
    value: { ...theme.type.bodyMedium, fontFamily: theme.type.bodyMedium.fontFamily, color: theme.colors.textPrimary },
    linkRow: { paddingHorizontal: 0, marginTop: theme.spacing.xs },
    sessionRow: { paddingHorizontal: theme.spacing.lg },
    rowBorder: { borderTopWidth: 1, borderTopColor: theme.colors.border },
  });
}
