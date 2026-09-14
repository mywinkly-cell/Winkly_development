import React from "react";
import { View, Text, ScrollView } from "react-native";
import { SafeScreenView } from "@/components/SafeScreenView";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { Card, PrimaryButton, SecondaryButton, TextButton } from "@/components/ds";
import { useAppTheme, type AppTheme } from "@/constants/design-system";

export default function GetStartedBusiness() {
  const router = useRouter();
  const theme = useAppTheme();
  const styles = createStyles(theme);

  return (
    <SafeScreenView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={styles.title}>Business on Winkly</Text>
          <Text style={styles.subtitle}>
            Build meaningful professional connections — not noisy networking.
          </Text>
        </View>

        <Card style={styles.card}>
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
        </Card>

        <Card style={styles.card}>
          <Text style={styles.sectionTitle}>How it works</Text>

          <Text style={styles.step}>1. Create your business profile</Text>
          <Text style={styles.step}>2. Discover relevant people & companies</Text>
          <Text style={styles.step}>3. Connect & plan real conversations</Text>
        </Card>

        <Card style={{ ...styles.card, ...styles.highlightCard }}>
          <Text style={{ ...styles.sectionTitle, color: theme.colors.primary }}>Why Winkly is unique</Text>

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
        </Card>

        <PrimaryButton
          title="Create business profile"
          onPress={() => { Haptics.selectionAsync(); router.push("/(onboarding-business)/profile-business"); }}
          style={styles.primaryBtn}
        />

        <TextButton
          title="View plans & pricing"
          onPress={() => { Haptics.selectionAsync(); router.push("/account/subscription"); }}
          style={styles.subscriptionLink}
        />

        <SecondaryButton
          title="Return to account selection"
          onPress={() => { Haptics.selectionAsync(); router.push("/(onboarding-personal)/get-started"); }}
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
    point: { flexDirection: "row" as const, marginBottom: theme.spacing.sm },
    bullet: { marginRight: theme.spacing.sm, color: theme.colors.primary, fontWeight: "900" as const },
    pointText: { ...theme.type.body, fontFamily: theme.type.body.fontFamily, color: theme.colors.textPrimary, flex: 1 },
    step: { ...theme.type.body, fontFamily: theme.type.body.fontFamily, color: theme.colors.textPrimary, marginBottom: theme.spacing.xs },
    primaryBtn: { marginTop: theme.spacing.xs },
    subscriptionLink: { marginTop: theme.spacing.lg, alignSelf: "center" as const },
    secondaryBtn: { marginTop: theme.spacing.sm },
  };
}
