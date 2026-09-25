// apps/mobile/app/account/delete-deactivate.tsx
// Winkly – Account: Delete / Deactivate (Safe placeholder)
// SDK 54 compatible — no extra native deps required

import { Ionicons } from "@expo/vector-icons";
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
import { useTranslation } from "react-i18next";
import { supabase } from "@/lib/supabase";
import { requestAccountDeletion } from "@/lib/account/deleteAccount";
import { useAppTheme, type AppTheme } from "@/constants/design-system";

export default function DeleteDeactivate() {
  const { t } = useTranslation();
  const router = useRouter();
  const theme = useAppTheme();
  const styles = createStyles(theme);
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const onDeactivate = () => {
    Alert.alert(
      t("account.delete.deactivateButton"),
      t("account.delete.deactivateUnavailable"),
      [{ text: t("common.ok"), style: "cancel" }]
    );
  };

  const onDelete = () => {
    Alert.alert(
      t("account.delete.confirmTitle"),
      t("account.delete.confirmMessage"),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("account.delete.deleteButton"),
          style: "destructive",
          onPress: async () => {
            setDeleting(true);
            try {
              const result = await requestAccountDeletion();
              if ("ok" in result && result.ok) {
                await supabase.auth.signOut({ scope: "local" });
                router.replace("/(auth)/splash");
                return;
              }
              if (__DEV__) console.warn("[delete-account] failed:", (result as { error: string }).error);
              Alert.alert(t("account.delete.failedTitle"), t("account.delete.failedMessage"));
            } catch (e) {
              if (__DEV__) console.warn("[delete-account] failed:", e);
              Alert.alert(t("common.error"), t("account.delete.failedMessage"));
            } finally {
              setDeleting(false);
            }
          },
        },
      ]
    );
  };

  const onSignOut = async () => {
    try {
      setLoading(true);
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      router.replace("/(auth)/signin");
    } catch (err: any) {
      if (__DEV__) console.warn("[delete-deactivate] sign out failed:", err?.message);
      Alert.alert(t("account.delete.signOutFailed"), t("common.tryAgain"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.9}>
            <Ionicons name="arrow-back" size={24} color={theme.colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{t("account.delete.title")}</Text>
          <View style={{ width: 60 }} />
        </View>

        <View style={styles.card}>
          <Text style={styles.title}>{t("account.delete.safetyControls")}</Text>
          <Text style={styles.subtitle}>
            {t("account.delete.intro")}
          </Text>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t("account.delete.deactivateSection")}</Text>
            <Text style={styles.sectionText}>
              {t("account.delete.deactivateBody")}
            </Text>
            <TouchableOpacity onPress={onDeactivate} style={styles.secondaryBtn} activeOpacity={0.9}>
              <Text style={styles.secondaryText}>{t("account.delete.deactivateButton")}</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.hr} />

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t("common.delete")}</Text>
            <Text style={styles.sectionText}>
              {t("account.delete.deleteBody")}
            </Text>
            <TouchableOpacity
              onPress={onDelete}
              style={[styles.dangerBtn, deleting && styles.dangerBtnDisabled]}
              activeOpacity={0.9}
              disabled={deleting}
            >
              {deleting ? (
                <ActivityIndicator size="small" color={theme.colors.error} />
              ) : (
                <Text style={styles.dangerText}>{t("account.delete.deleteButton")}</Text>
              )}
            </TouchableOpacity>
          </View>

          <View style={styles.hr} />

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t("account.appInfo.session")}</Text>
            <Text style={styles.sectionText}>{t("account.delete.signOutBody")}</Text>
            <TouchableOpacity
              onPress={onSignOut}
              style={[styles.primaryBtn, loading && { opacity: 0.7 }]}
              activeOpacity={0.9}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color={theme.colors.onPrimary} />
              ) : (
                <Text style={styles.primaryText}>{t("auth.signOut")}</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>

        <Text style={styles.note}>
          {t("account.delete.note")}
        </Text>
      </ScrollView>
    </View>
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.colors.background },
    scroll: { padding: 20, paddingBottom: 40 },
    headerRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 12,
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
    headerTitle: { ...theme.type.h2, color: theme.colors.textPrimary, flex: 1, textAlign: "center" },

    card: {
      backgroundColor: theme.colors.surface,
      borderRadius: theme.radii.lg,
      borderWidth: 1,
      borderColor: theme.colors.border,
      padding: 16,
    },
    title: { ...theme.type.h2, color: theme.colors.textPrimary, marginBottom: 6 },
    subtitle: { ...theme.type.body, color: theme.colors.textSecondary, marginBottom: 14 },

    section: { marginBottom: 12 },
    sectionTitle: { ...theme.type.h3, color: theme.colors.textPrimary, marginBottom: 6 },
    sectionText: { ...theme.type.body, color: theme.colors.textSecondary, marginBottom: 10 },

    hr: { height: 1, backgroundColor: theme.colors.border, marginVertical: 12 },

    primaryBtn: {
      backgroundColor: theme.colors.primary,
      borderRadius: theme.radii.md,
      paddingVertical: 12,
      alignItems: "center",
    },
    primaryText: { ...theme.type.button, color: theme.colors.onPrimary },

    secondaryBtn: {
      backgroundColor: theme.colors.backgroundMuted,
      borderRadius: theme.radii.md,
      paddingVertical: 12,
      alignItems: "center",
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    secondaryText: { ...theme.type.button, color: theme.colors.textPrimary },

    dangerBtn: {
      backgroundColor: theme.colors.surface,
      borderRadius: theme.radii.md,
      paddingVertical: 12,
      alignItems: "center",
      borderWidth: 1,
      borderColor: theme.colors.error,
    },
    dangerBtnDisabled: { opacity: 0.7 },
    dangerText: { ...theme.type.button, color: theme.colors.error },

    note: { ...theme.type.caption, color: theme.colors.textSecondary, marginTop: 12, textAlign: "center" },
  });
}
