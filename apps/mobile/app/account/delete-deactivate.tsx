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
import { Colors, Typography, Layout } from "@/constants/tokens";

export default function DeleteDeactivate() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const onDeactivate = async () => {
    Alert.alert(
      "Deactivate account",
      "This will hide your profile and pause all modes. You can reactivate by signing in again.\n\n(Temporary placeholder — we’ll wire this to DB later.)",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Deactivate",
          style: "destructive",
          onPress: () => Alert.alert("Done", "Account deactivation placeholder saved."),
        },
      ]
    );
  };

  const onDelete = async () => {
    Alert.alert(
      "Delete account",
      "This action is permanent.\n\n(Temporary placeholder — in production we’ll call an admin function to delete user data safely.)",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Request deletion",
          style: "destructive",
          onPress: () => Alert.alert("Request sent", "Deletion request placeholder created."),
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
              Request permanent deletion of your profile and data. This action cannot be undone.
            </Text>
            <TouchableOpacity onPress={onDelete} style={styles.dangerBtn} activeOpacity={0.9}>
              <Text style={styles.dangerText}>Request deletion</Text>
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
          Note: Deactivate/Delete are placeholders for now. Next step: connect to Supabase tables + admin function.
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
  headerTitle: { ...Typography.h3, color: Colors.textPrimary },

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
  dangerText: { ...Typography.button, color: "#E11D48" },

  note: { ...Typography.caption, color: Colors.gray600, marginTop: 12, textAlign: "center" },
});
