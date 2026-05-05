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
import { Colors, Typography, Layout } from "@/constants/tokens";

export default function DeleteDeactivate() {
  const router = useRouter();
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
            <Ionicons name="arrow-back" size={24} color={Colors.textPrimary} />
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
                <ActivityIndicator size="small" color="#E11D48" />
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
                <ActivityIndicator color={Colors.accentYellow} />
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

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.backgroundLight },
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

  card: {
    backgroundColor: "#FFF",
    borderRadius: Layout.radii.card,
    borderWidth: 1,
    borderColor: Colors.gray200,
    padding: 16,
  },
  title: { ...Typography.h2, color: Colors.textPrimary, marginBottom: 6 },
  subtitle: { ...Typography.body, color: Colors.gray700, marginBottom: 14 },

  section: { marginBottom: 12 },
  sectionTitle: { ...Typography.h3, color: Colors.textPrimary, marginBottom: 6 },
  sectionText: { ...Typography.body, color: Colors.gray700, marginBottom: 10 },

  hr: { height: 1, backgroundColor: Colors.gray200, marginVertical: 12 },

  primaryBtn: {
    backgroundColor: Colors.primaryViolet,
    borderRadius: Layout.radii.control,
    paddingVertical: 12,
    alignItems: "center",
  },
  primaryText: { ...Typography.button, color: Colors.accentYellow },

  secondaryBtn: {
    backgroundColor: Colors.gray100,
    borderRadius: Layout.radii.control,
    paddingVertical: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: Colors.gray200,
  },
  secondaryText: { ...Typography.button, color: Colors.textPrimary },

  dangerBtn: {
    backgroundColor: "#FFF",
    borderRadius: Layout.radii.control,
    paddingVertical: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E11D48",
  },
  dangerBtnDisabled: { opacity: 0.7 },
  dangerText: { ...Typography.button, color: "#E11D48" },

  note: { ...Typography.caption, color: Colors.gray600, marginTop: 12, textAlign: "center" },
});
