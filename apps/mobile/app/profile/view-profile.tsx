// apps/mobile/app/profile/view-profile.tsx
// Winkly – Profile: View (MVP-safe)
// Purpose: Read-only preview (placeholder), later connect to user_profiles/sub_profiles.

import React, { useEffect, useState } from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Colors, Typography, Layout } from "@/constants/tokens";
import { supabase } from "@/lib/supabase";
import { useNormalizedLocation } from "@/lib/location/useLocationDisplay";

type MinimalProfile = {
  displayName: string;
  city: string;
  bio: string;
  verified: boolean;
};

export default function ViewProfile() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<MinimalProfile | null>(null);

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        setLoading(true);

        const { data: userData, error: userError } = await supabase.auth.getUser();
        if (userError) throw userError;

        // MVP-safe placeholder: we show UID-based defaults if profile tables are not wired yet.
        const uid = userData?.user?.id;
        const email = userData?.user?.email ?? "";

        if (!mounted) return;

        setProfile({
          displayName: email ? email.split("@")[0] : uid ? "Winkly User" : "Guest",
          city: "Munich (placeholder)",
          bio: "This is your profile preview. Next: fetch real data from user_profiles & sub_profiles.",
          verified: false,
        });
      } catch (e: any) {
        Alert.alert("Error", e?.message ?? "Could not load profile.");
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  const cityDisplay = useNormalizedLocation(profile?.city ?? "");

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.9} accessibilityLabel="Back">
            <Ionicons name="arrow-back" size={24} color={Colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>View profile</Text>
          <TouchableOpacity onPress={() => router.push("/profile/edit-core")} style={styles.ghostBtn} activeOpacity={0.9}>
            <Text style={styles.ghostText}>Edit</Text>
          </TouchableOpacity>
        </View>

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={Colors.primaryViolet} />
            <Text style={styles.loadingText}>Loading…</Text>
          </View>
        ) : (
          <View style={styles.card}>
            <Text style={styles.name}>{profile?.displayName ?? "—"}</Text>
            <Text style={styles.meta}>{cityDisplay || "—"}</Text>

            <View style={styles.badgeRow}>
              <View style={[styles.badge, profile?.verified ? styles.badgeGood : styles.badgeNeutral]}>
                <Text style={styles.badgeText}>{profile?.verified ? "Verified" : "Not verified"}</Text>
              </View>
            </View>

            <Text style={styles.sectionTitle}>Bio</Text>
            <Text style={styles.bodyText}>{profile?.bio ?? "—"}</Text>

            <View style={styles.hr} />

            <Text style={styles.sectionTitle}>Mode sections</Text>
            <Text style={styles.bodyText}>
              Romance • Friends • Business sections will appear here after we connect sub_profiles.
            </Text>

            <TouchableOpacity
              onPress={() => router.push("/profile/verification")}
              style={styles.primaryBtn}
              activeOpacity={0.9}
            >
              <Text style={styles.primaryText}>Start verification</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.backgroundLight },
  scroll: { padding: 20, paddingBottom: 40 },

  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
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
  ghostBtn: {
    width: 70,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: Colors.gray200,
    alignItems: "center",
  },
  ghostText: { ...Typography.caption, color: Colors.textPrimary },

  center: { paddingTop: 60, alignItems: "center" },
  loadingText: { ...Typography.caption, color: Colors.gray600, marginTop: 10 },

  card: { backgroundColor: "#FFF", borderRadius: Layout.radii.card, borderWidth: 1, borderColor: Colors.gray200, padding: 16 },
  name: { ...Typography.h2, color: Colors.textPrimary, marginBottom: 4 },
  meta: { ...Typography.body, color: Colors.gray700, marginBottom: 12 },

  badgeRow: { flexDirection: "row", gap: 8, marginBottom: 12 },
  badge: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1 },
  badgeGood: { backgroundColor: Colors.accentMint ?? Colors.gray100, borderColor: Colors.gray200 },
  badgeNeutral: { backgroundColor: Colors.gray100, borderColor: Colors.gray200 },
  badgeText: { ...Typography.caption, color: Colors.textPrimary },

  sectionTitle: { ...Typography.h3, color: Colors.textPrimary, marginBottom: 8 },
  bodyText: { ...Typography.body, color: Colors.gray700 },

  hr: { height: 1, backgroundColor: Colors.gray200, marginVertical: 14 },

  primaryBtn: {
    backgroundColor: Colors.primaryViolet,
    borderRadius: Layout.radii.control,
    paddingVertical: 12,
    alignItems: "center",
    marginTop: 16,
  },
  primaryText: { ...Typography.button, color: Colors.accentYellow },
});
