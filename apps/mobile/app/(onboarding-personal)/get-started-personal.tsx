// ────────────────────────────────────────────────
// Winkly Onboarding – Personal Account Intro
// v8.1 – January 2026
// Purpose: Explain Personal mode value before profile setup
// Similar structure to Business on Winkly
// ────────────────────────────────────────────────

import React from "react";
import { View, Text, TouchableOpacity, ScrollView } from "react-native";
import { SafeScreenView } from "@/components/SafeScreenView";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Colors, Typography, Layout, FontFamily, Shadow } from "@/constants/tokens";

export default function GetStartedPersonal() {
  const router = useRouter();

  return (
    <SafeScreenView style={[styles.screen, { backgroundColor: Colors.backgroundMuted }]}>
      <ScrollView contentContainerStyle={{ paddingBottom: 40, padding: 24 }} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={[Typography.h1, styles.title, { fontFamily: FontFamily.heading }]}>Personal on Winkly</Text>
          <Text style={styles.subtitle}>
            Find love, friendships, and opportunities — all in one place.
          </Text>
        </View>

        <View style={[styles.card, { backgroundColor: Colors.white, borderColor: Colors.gray200, ...Shadow.card }]}>
          <Text style={styles.sectionTitle}>What you can do</Text>

          <View style={styles.point}>
            <Text style={styles.bullet}>•</Text>
            <Text style={styles.pointText}>
              Romance — find meaningful connections and dates
            </Text>
          </View>

          <View style={styles.point}>
            <Text style={styles.bullet}>•</Text>
            <Text style={styles.pointText}>
              Friends — meet people who share your passions and energy
            </Text>
          </View>

          <View style={styles.point}>
            <Text style={styles.bullet}>•</Text>
            <Text style={styles.pointText}>
              Business networking — grow your professional circle
            </Text>
          </View>

          <View style={styles.point}>
            <Text style={styles.bullet}>•</Text>
            <Text style={styles.pointText}>
              Events — discover or host experiences in your area
            </Text>
          </View>
        </View>

        <View style={[styles.card, { backgroundColor: Colors.white, borderColor: Colors.gray200, ...Shadow.card }]}>
          <Text style={styles.sectionTitle}>How it works</Text>

          <Text style={styles.step}>1. Create your profile and choose your modes</Text>
          <Text style={styles.step}>2. Discover people who match your vibe</Text>
          <Text style={styles.step}>3. Connect and plan real meetups</Text>
        </View>

        <View style={[styles.card, { backgroundColor: "#F5F1FF", borderColor: Colors.primaryViolet, borderWidth: 1, ...Shadow.card }]}>
          <Text style={[styles.sectionTitle, { color: Colors.primaryViolet }]}>Why Winkly is unique</Text>

          <View style={styles.point}>
            <View style={{ width: 24, alignItems: "center" }}>
              <Ionicons name="sparkles" size={16} color={Colors.primaryViolet} />
            </View>
            <Text style={[styles.pointText, { flex: 1 }]}>
              One app, multiple modes — switch between Romance, Friends, and Business without separate profiles
            </Text>
          </View>

          <View style={styles.point}>
            <View style={{ width: 24, alignItems: "center" }}>
              <Ionicons name="shield-checkmark" size={16} color={Colors.primaryViolet} />
            </View>
            <Text style={[styles.pointText, { flex: 1 }]}>
              Identity Firewall — your modes stay separate, no cross-mode leakage
            </Text>
          </View>

          <View style={styles.point}>
            <View style={{ width: 24, alignItems: "center" }}>
              <Ionicons name="calendar" size={16} color={Colors.primaryViolet} />
            </View>
            <Text style={[styles.pointText, { flex: 1 }]}>
              Unified Planner — dates, meetups, and events in one place
            </Text>
          </View>
        </View>

        <TouchableOpacity
          onPress={() => { Haptics.selectionAsync(); router.push("/(onboarding-personal)/profile-core"); }}
          style={[styles.primaryBtn, { backgroundColor: Colors.primaryViolet, ...Shadow.button }]}
          activeOpacity={0.9}
        >
          <Text style={styles.primaryText}>Create personal profile</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => { Haptics.selectionAsync(); router.push("/account/subscription"); }}
          style={styles.subscriptionLink}
          activeOpacity={0.8}
        >
          <Ionicons name="diamond-outline" size={18} color={Colors.primaryViolet} />
          <Text style={styles.subscriptionLinkText}>View plans & pricing</Text>
          <Ionicons name="chevron-forward" size={18} color={Colors.gray500} />
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => { Haptics.selectionAsync(); router.back(); }}
          style={[styles.secondaryBtn, { borderColor: Colors.gray300 }]}
          activeOpacity={0.9}
        >
          <Text style={styles.secondaryText}>Return to account selection</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeScreenView>
  );
}

const styles = {
  screen: { flex: 1, paddingTop: 16 },
  header: { marginBottom: 18 },
  title: { fontWeight: "900" as const, color: Colors.textPrimary },
  subtitle: { color: Colors.textSecondary, marginTop: 8, lineHeight: 20 },
  card: {
    borderWidth: 1,
    borderRadius: Layout.radii.card,
    padding: 16,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600" as const,
    color: Colors.textPrimary,
    marginBottom: 10,
  },
  point: { flexDirection: "row" as const, marginBottom: 8, alignItems: "flex-start" as const },
  bullet: { marginRight: 8, color: Colors.primaryViolet, fontWeight: "900" as const },
  pointText: { color: Colors.textPrimary, flex: 1, lineHeight: 20 },
  step: { color: Colors.textPrimary, marginBottom: 6 },
  primaryBtn: {
    borderRadius: Layout.radii.control,
    paddingVertical: 14,
    alignItems: "center" as const,
    marginTop: 6,
  },
  primaryText: { color: Colors.accentYellow, fontWeight: "600" as const, fontSize: 16 },
  subscriptionLink: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    paddingVertical: 12,
    marginTop: 16,
    gap: 8,
  },
  subscriptionLinkText: {
    ...Typography.body,
    color: Colors.primaryViolet,
    fontWeight: "600" as const,
  },
  secondaryBtn: {
    borderRadius: Layout.radii.control,
    paddingVertical: 14,
    alignItems: "center" as const,
    borderWidth: 1,
    marginTop: 12,
  },
  secondaryText: { color: Colors.textPrimary, fontWeight: "600" as const },
};
