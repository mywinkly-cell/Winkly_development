import React from "react";
import { View, Text, TouchableOpacity, ScrollView } from "react-native";
import { SafeScreenView } from "@/components/SafeScreenView";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { Colors, Typography, Layout, FontFamily, Shadow } from "@/constants/tokens";

export default function GetStartedBusiness() {
  const router = useRouter();

  return (
    <SafeScreenView style={[styles.screen, { backgroundColor: Colors.backgroundMuted }]}>
      <ScrollView contentContainerStyle={{ paddingBottom: 40, padding: 24 }} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={[Typography.h1, styles.title, { fontFamily: FontFamily.heading }]}>Business on Winkly</Text>
          <Text style={styles.subtitle}>
            Build meaningful professional connections — not noisy networking.
          </Text>
        </View>

        <View style={[styles.card, { backgroundColor: Colors.white, borderColor: Colors.gray200, ...Shadow.card }]}>
          <Text style={styles.sectionTitle}>What you can do</Text>

          <View style={styles.point}>
            <Text style={styles.bullet}>•</Text>
            <Text style={styles.pointText}>
              Discover professionals, founders, consultants, and investors
            </Text>
          </View>

          <View style={styles.point}>
            <Text style={styles.bullet}>•</Text>
            <Text style={styles.pointText}>
              Share your expertise, projects, and business interests
            </Text>
          </View>

          <View style={styles.point}>
            <Text style={styles.bullet}>•</Text>
            <Text style={styles.pointText}>
              Plan meetings, follow-ups, and collaborations in one place
            </Text>
          </View>

          <View style={styles.point}>
            <Text style={styles.bullet}>•</Text>
            <Text style={styles.pointText}>
              Connect with intention — no spam, no cold pitches
            </Text>
          </View>
        </View>

        <View style={[styles.card, { backgroundColor: Colors.white, borderColor: Colors.gray200, ...Shadow.card }]}>
          <Text style={styles.sectionTitle}>How it works</Text>

          <Text style={styles.step}>1. Create your business profile</Text>
          <Text style={styles.step}>2. Discover relevant people & companies</Text>
          <Text style={styles.step}>3. Connect & plan real conversations</Text>
        </View>

        <View style={[styles.card, { backgroundColor: "#F5F1FF", borderColor: Colors.primaryViolet, borderWidth: 1, ...Shadow.card }]}>
          <Text style={[styles.sectionTitle, { color: Colors.primaryViolet }]}>Why Winkly is unique</Text>

          <View style={styles.point}>
            <Text style={styles.bullet}>•</Text>
            <Text style={styles.pointText}>
              One platform for meaningful connections — no spam, no cold pitches
            </Text>
          </View>

          <View style={styles.point}>
            <Text style={styles.bullet}>•</Text>
            <Text style={styles.pointText}>
              Unified Planner — meetings and events in one place
            </Text>
          </View>

          <View style={styles.point}>
            <Text style={styles.bullet}>•</Text>
            <Text style={styles.pointText}>
              Connect with intention — quality over quantity
            </Text>
          </View>
        </View>

        <TouchableOpacity
          onPress={() => { Haptics.selectionAsync(); router.push("/(onboarding-business)/profile-business"); }}
          style={[styles.primaryBtn, { backgroundColor: Colors.primaryViolet, ...Shadow.button }]}
          activeOpacity={0.9}
        >
          <Text style={styles.primaryText}>Create business profile</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => { Haptics.selectionAsync(); router.push("/account/subscription"); }}
          style={styles.subscriptionLink}
          activeOpacity={0.8}
        >
          <Text style={styles.subscriptionLinkText}>View plans & pricing</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => { Haptics.selectionAsync(); router.push("/(onboarding-personal)/get-started"); }}
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
  point: { flexDirection: "row" as const, marginBottom: 8 },
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
    marginTop: 10,
  },
  secondaryText: { color: Colors.textPrimary, fontWeight: "600" as const },
};
