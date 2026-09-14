// ────────────────────────────────────────────────
// Winkly Onboarding – Personal Account Intro
// v8.1 – January 2026
// Purpose: Explain Personal mode value before profile setup
// Similar structure to Business on Winkly
// ────────────────────────────────────────────────

import React from "react";
import { View, Text, ScrollView } from "react-native";
import { SafeScreenView } from "@/components/SafeScreenView";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { SparklesIcon } from "@/components/ui/WinklyAISpark";
import { Card, ListRow, PrimaryButton, SecondaryButton } from "@/components/ds";
import { useAppTheme, type AppTheme } from "@/constants/design-system";

export default function GetStartedPersonal() {
  const router = useRouter();
  const theme = useAppTheme();
  const styles = createStyles(theme);

  return (
    <SafeScreenView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={styles.title}>Personal on Winkly</Text>
          <Text style={styles.subtitle}>
            Find love, friendships, and opportunities — all in one place.
          </Text>
        </View>

        <Card style={styles.card}>
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
        </Card>

        <Card style={styles.card}>
          <Text style={styles.sectionTitle}>How it works</Text>

          <Text style={styles.step}>1. Create your profile and choose your modes</Text>
          <Text style={styles.step}>2. Discover people who match your vibe</Text>
          <Text style={styles.step}>3. Connect and plan real meetups</Text>
        </Card>

        <Card style={{ ...styles.card, ...styles.highlightCard }}>
          <Text style={{ ...styles.sectionTitle, color: theme.colors.primary }}>Why Winkly is unique</Text>

          <View style={styles.point}>
            <View style={styles.iconSlot}>
              <SparklesIcon size={16} color={theme.colors.primary} />
            </View>
            <Text style={{ ...styles.pointText, flex: 1 }}>
              One app, multiple modes — switch between Romance, Friends, and Business without separate profiles
            </Text>
          </View>

          <View style={styles.point}>
            <View style={styles.iconSlot}>
              <Ionicons name="shield-checkmark" size={16} color={theme.colors.primary} />
            </View>
            <Text style={{ ...styles.pointText, flex: 1 }}>
              Identity Firewall — your modes stay separate, no cross-mode leakage
            </Text>
          </View>

          <View style={styles.point}>
            <View style={styles.iconSlot}>
              <Ionicons name="calendar" size={16} color={theme.colors.primary} />
            </View>
            <Text style={{ ...styles.pointText, flex: 1 }}>
              Unified Planner — dates, meetups, and events in one place
            </Text>
          </View>
        </Card>

        <PrimaryButton
          title="Create personal profile"
          onPress={() => { Haptics.selectionAsync(); router.push("/(onboarding-personal)/profile-core"); }}
          style={styles.primaryBtn}
        />

        <ListRow
          title="View plans & pricing"
          onPress={() => { Haptics.selectionAsync(); router.push("/account/subscription"); }}
          style={styles.subscriptionLink}
          leading={<Ionicons name="star-outline" size={18} color={theme.colors.primary} />}
        />

        <SecondaryButton
          title="Return to account selection"
          onPress={() => { Haptics.selectionAsync(); router.back(); }}
          style={styles.secondaryBtn}
        />
      </ScrollView>
    </SafeScreenView>
  );
}

function createStyles(theme: AppTheme) {
  return {
    screen: { flex: 1, backgroundColor: theme.colors.backgroundMuted, paddingTop: theme.spacing.md },
    scroll: { paddingBottom: theme.spacing.huge, padding: theme.spacing.xl },
    header: { marginBottom: theme.spacing.lg },
    title: { ...theme.type.h1, fontFamily: theme.type.h1.fontFamily, color: theme.colors.textPrimary },
    subtitle: { ...theme.type.body, fontFamily: theme.type.body.fontFamily, color: theme.colors.textSecondary, marginTop: theme.spacing.sm },
    card: { marginBottom: theme.spacing.lg },
    highlightCard: { borderWidth: 1, borderColor: theme.colors.primary, backgroundColor: theme.colors.primary + "10" },
    sectionTitle: {
      ...theme.type.bodyMedium,
      fontFamily: theme.type.bodyMedium.fontFamily,
      color: theme.colors.textPrimary,
      marginBottom: theme.spacing.sm,
    },
    point: { flexDirection: "row" as const, marginBottom: theme.spacing.sm, alignItems: "flex-start" as const },
    bullet: { marginRight: theme.spacing.sm, color: theme.colors.primary, fontWeight: "900" as const },
    pointText: { ...theme.type.body, fontFamily: theme.type.body.fontFamily, color: theme.colors.textPrimary, flex: 1 },
    step: { ...theme.type.body, fontFamily: theme.type.body.fontFamily, color: theme.colors.textPrimary, marginBottom: theme.spacing.xs },
    iconSlot: { width: 24, alignItems: "center" as const },
    primaryBtn: { marginTop: theme.spacing.xs },
    subscriptionLink: { paddingHorizontal: 0, marginTop: theme.spacing.md },
    secondaryBtn: { marginTop: theme.spacing.sm },
  };
}
