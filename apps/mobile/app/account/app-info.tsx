// ────────────────────────────────────────────────
// Winkly — App Info & Logout (Settings v8)
// Version, what's new, logout (current / all devices)
// ────────────────────────────────────────────────

import React, { useState } from "react";
import { View, Text, ScrollView, Alert, ActivityIndicator, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation();
  const router = useRouter();
  const theme = useAppTheme();
  const styles = createStyles(theme);
  const [signingOut, setSigningOut] = useState(false);

  const handleLogout = (allDevices: boolean) => {
    Haptics.selectionAsync();
    Alert.alert(
      allDevices ? t("account.appInfo.signOutAllTitle") : t("account.appInfo.signOutTitle"),
      allDevices ? t("account.appInfo.signOutAllMessage") : t("account.appInfo.signOutMessage"),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("auth.signOut"),
          style: "destructive",
          onPress: async () => {
            setSigningOut(true);
            try {
              // "global" revokes every refresh token for this user (all devices); "local" only this one.
              const { error } = await supabase.auth.signOut({ scope: allDevices ? "global" : "local" });
              if (error) throw error;
              router.replace("/(auth)/signin");
            } catch (_err) {
              Alert.alert(t("common.error"), t("account.appInfo.signOutFailed"));
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
      <Header title={t("account.appInfo.title")} onBack={() => router.back()} />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Card style={styles.card}>
          <Text style={styles.cardTitle}>{t("account.appInfo.about")}</Text>
          <View style={styles.row}>
            <Text style={styles.label}>{t("account.appInfo.version")}</Text>
            <Text style={styles.value}>{APP_VERSION}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>{t("account.appInfo.build")}</Text>
            <Text style={styles.value}>{BUILD_NUMBER}</Text>
          </View>
          <ListRow
            title={t("account.appInfo.whatsNew")}
            onPress={() => {
              Haptics.selectionAsync();
              Alert.alert(t("account.appInfo.whatsNew"), t("account.appInfo.whatsNewMessage"));
            }}
            style={styles.linkRow}
          />
        </Card>

        <Card padding="none" style={styles.card}>
          <Text style={{ ...styles.cardTitle, padding: theme.spacing.lg, paddingBottom: 0 }}>{t("account.appInfo.session")}</Text>
          <ListRow
            title={t("account.appInfo.signOutThisDevice")}
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
            title={t("account.appInfo.signOutAllDevices")}
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
