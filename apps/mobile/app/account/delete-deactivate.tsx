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
import { supabase } from "@/lib/supabase";
import { requestAccountDeletion } from "@/lib/account/deleteAccount";
import { useAppTheme, type AppTheme } from "@/constants/design-system";

export default function DeleteDeactivate() {
  const router = useRouter();
  const theme = useAppTheme();
  const styles = createStyles(theme);
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const onDeactivate = () => {
    Alert.alert(
      "Deactivate account",
      "Deactivation is not available yet. You can sign out below, or permanently delete your account.\n\n(Deactivation is not available yet. You can sign out below, or permanently delete your account. — we’ll ",
      [{ text: "OK", style: "cancel" }]
    );
  };

  const onDelete = () => {
    Alert.alert(
      "Permanently delete account",
      "Your profile, messages, planner, events, and all data will be deleted. This cannot be undone.\n\n(Deactivation is not available yet. You can sign out below, or permanently delete your account. — in production we’ll Continue?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete my account",
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
              Alert.alert("Deletion failed", (result as { error: string }).error ?? "Please try again or contact support.");
            } catch (e) {
              Alert.alert("Error", e instanceof Error ? e.message : "Something went wrong.");
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
      Alert.alert("Sign out failed", err?.message ?? "Please try again.");
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
          <Text style={styles.headerTitle}>Delete / Deactivate</Text>
          <View style={{ width: 60 }} />
        </View>

        <View style={styles.card}>
          <Text style={styles.title}>Safety controls</Text>
          <Text style={styles.subtitle}>
            Manage account status. Deactivation is reversible. Deletion is permanent.
          </Text>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Deactivate</Text>
            <Text style={styles.sectionText}>
              Hide your profile, stop recommendations, and pause chats. Reactivate by signing in.
            </Text>
            <TouchableOpacity onPress={onDeactivate} style={styles.secondaryBtn} activeOpacity={0.9}>
              <Text style={styles.secondaryText}>Deactivate account</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.hr} />

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Delete</Text>
            <Text style={styles.sectionText}>
              Permanently delete your profile, messages, planner, and all data. This cannot be undone.
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
                <Text style={styles.dangerText}>Delete my account</Text>
              )}
            </TouchableOpacity>
          </View>

          <View style={styles.hr} />

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Session</Text>
            <Text style={styles.sectionText}>Sign out of this device.</Text>
            <TouchableOpacity
              onPress={onSignOut}
              style={[styles.primaryBtn, loading && { opacity: 0.7 }]}
              activeOpacity={0.9}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color={theme.colors.onPrimary} />
              ) : (
                <Text style={styles.primaryText}>Sign out</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>

        <Text style={styles.note}>
          Deletion removes your account and all data (including AI usage records). Third‑party services (e.g. analytics) may retain data per their policies.
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
    headerTitle: { ...theme.type.h2, color: theme.colors.textPrimary },

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
