// apps/mobile/app/account/subscription.tsx
// Winkly – Account: Subscription plans (reads tier from Supabase; billing TBD)

import React, { useCallback, useEffect, useState } from "react";
import { View, Text, ScrollView, ActivityIndicator, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { SafeScreenView } from "@/components/SafeScreenView";
import { Card, Header, PrimaryButton, SecondaryButton, TextButton } from "@/components/ds";
import { useAppTheme, type AppTheme } from "@/constants/design-system";
import {
  getSubscriptionStatus,
  purchase,
  openManageSubscriptions,
  type SubscriptionStatus,
} from "@/lib/integrations/payments";
import { trialDaysRemaining } from "@/lib/billing/subscriptionTier";
import type { SubscriptionTier } from "@/types";

const PLAN_COPY: Record<
  SubscriptionTier,
  { label: string; description: string }
> = {
  free: {
    label: "Free",
    description: "Basic discovery & limited daily suggestions",
  },
  super: {
    label: "Super",
    description: "More Super Sparks per day, extra filters, limited AI",
  },
  premium: {
    label: "Premium",
    description: "AI-powered matching, concierge, and all features",
  },
  enterprise: {
    label: "Enterprise",
    description: "B2B features and team controls (coming soon)",
  },
};

const UPGRADE_TIERS: Array<Exclude<SubscriptionTier, "free" | "enterprise">> = [
  "super",
  "premium",
];

export default function Subscription() {
  const router = useRouter();
  const theme = useAppTheme();
  const styles = createStyles(theme);
  const [status, setStatus] = useState<SubscriptionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState<SubscriptionTier | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    const next = await getSubscriptionStatus();
    setStatus(next);
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const onChoosePlan = async (tier: Exclude<SubscriptionTier, "free">) => {
    if (!status?.isBillingConfigured) {
      setNotice("In-app billing is not live yet. Your current plan is shown above.");
      return;
    }
    setNotice(null);
    setPurchasing(tier);
    const result = await purchase(tier);
    setPurchasing(null);
    if (result.ok) {
      await refresh();
      setNotice(`You're now on ${PLAN_COPY[result.tier].label}.`);
      return;
    }
    if (result.reason === "cancelled") return;
    setNotice(result.message ?? "Purchase could not be completed. Try again later.");
  };

  const current = status?.tier ?? "free";
  const currentCopy = PLAN_COPY[current];

  return (
    <SafeScreenView style={styles.screen}>
      <Header title="Subscription plans" onBack={() => router.back()} />
      <ScrollView contentContainerStyle={styles.scroll}>
        <Card style={styles.card}>
          <Text style={styles.title}>Your plan</Text>
          {loading ? (
            <ActivityIndicator color={theme.colors.primary} style={{ marginVertical: theme.spacing.md }} />
          ) : (
            <>
              <Card padding="md" elevation={0} style={styles.planBox}>
                <Text style={styles.planName}>
                  {currentCopy.label}
                  {status?.isOnTrial ? " (Trial)" : ""}
                </Text>
                <Text style={styles.planText}>{currentCopy.description}</Text>
                {status?.activeUntil ? (
                  <Text style={styles.activeUntil}>
                    {status.isOnTrial ? "Trial ends" : "Active until"}{" "}
                    {new Date(status.activeUntil).toLocaleDateString()}
                  </Text>
                ) : null}
              </Card>

              {status?.isOnTrial ? (
                <View style={styles.trialBanner}>
                  <Ionicons name="sparkles-outline" size={18} color={theme.colors.primary} />
                  <Text style={styles.trialText}>
                    Your free Premium trial — {trialDaysRemaining(status.activeUntil)} day
                    {trialDaysRemaining(status.activeUntil) === 1 ? "" : "s"} left. Subscribe to keep full
                    AI and concierge, or continue on Free (limited AI) when it ends.
                  </Text>
                </View>
              ) : null}

              {!status?.isBillingConfigured ? (
                <View style={styles.comingSoonBanner}>
                  <Ionicons name="information-circle-outline" size={18} color={theme.colors.textSecondary} />
                  <Text style={styles.comingSoonText}>
                    Paid upgrades are coming soon. Plans below are for preview — no charges yet.
                  </Text>
                </View>
              ) : null}

              {notice ? <Text style={styles.notice}>{notice}</Text> : null}

              <Text style={styles.sectionTitle}>Upgrade options</Text>

              {UPGRADE_TIERS.map((tier) => {
                const copy = PLAN_COPY[tier];
                // During the trial the user holds no paid plan yet, so keep both
                // upgrade options actionable (promote them) rather than "Current".
                const isCurrent = !status?.isOnTrial && current === tier;
                const disabled = isCurrent || !status?.isBillingConfigured || purchasing !== null;
                return (
                  <View key={tier} style={styles.planOption}>
                    <Text style={styles.planOptionTitle}>{copy.label}</Text>
                    <Text style={styles.planOptionSub}>{copy.description}</Text>
                    <PrimaryButton
                      title={isCurrent ? "Current plan" : `Choose ${copy.label}`}
                      onPress={() => void onChoosePlan(tier)}
                      disabled={disabled}
                      loading={purchasing === tier}
                    />
                  </View>
                );
              })}

              <SecondaryButton title="Payment methods" onPress={() => router.push("/account/payments")} style={styles.secondaryBtn} />

              {status?.isBillingConfigured ? (
                <TextButton
                  title="Manage subscription in store"
                  onPress={() => void openManageSubscriptions()}
                  style={styles.linkBtn}
                />
              ) : null}
            </>
          )}
        </Card>
      </ScrollView>
    </SafeScreenView>
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.colors.backgroundMuted },
    scroll: { padding: theme.spacing.xl, paddingBottom: theme.spacing.huge },
    card: {},
    title: { ...theme.type.h2, fontFamily: theme.type.h2.fontFamily, color: theme.colors.textPrimary, marginBottom: theme.spacing.xxs },

    planBox: { marginBottom: theme.spacing.md },
    planName: { ...theme.type.h3, fontFamily: theme.type.h3.fontFamily, color: theme.colors.textPrimary, marginBottom: theme.spacing.xxs },
    planText: { ...theme.type.body, fontFamily: theme.type.body.fontFamily, color: theme.colors.textSecondary },
    activeUntil: { ...theme.type.caption, fontFamily: theme.type.caption.fontFamily, color: theme.colors.textSecondary, marginTop: theme.spacing.sm },

    comingSoonBanner: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: theme.spacing.sm,
      backgroundColor: theme.colors.backgroundMuted,
      borderRadius: theme.radii.sm,
      padding: theme.spacing.md,
      marginBottom: theme.spacing.md,
    },
    comingSoonText: { ...theme.type.caption, fontFamily: theme.type.caption.fontFamily, color: theme.colors.textSecondary, flex: 1 },

    trialBanner: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: theme.spacing.sm,
      backgroundColor: theme.colors.primary + "12",
      borderRadius: theme.radii.sm,
      padding: theme.spacing.md,
      marginBottom: theme.spacing.md,
    },
    trialText: { ...theme.type.caption, fontFamily: theme.type.caption.fontFamily, color: theme.colors.primary, flex: 1 },

    notice: {
      ...theme.type.caption,
      fontFamily: theme.type.caption.fontFamily,
      color: theme.colors.primary,
      marginBottom: theme.spacing.md,
      textAlign: "center",
    },

    sectionTitle: { ...theme.type.h3, fontFamily: theme.type.h3.fontFamily, color: theme.colors.textPrimary, marginBottom: theme.spacing.md },

    planOption: { marginBottom: theme.spacing.md },
    planOptionTitle: { ...theme.type.bodyMedium, fontFamily: theme.type.bodyMedium.fontFamily, color: theme.colors.textPrimary, marginBottom: theme.spacing.xxs },
    planOptionSub: { ...theme.type.caption, fontFamily: theme.type.caption.fontFamily, color: theme.colors.textSecondary, marginBottom: theme.spacing.sm },

    secondaryBtn: { marginTop: theme.spacing.xxs },
    linkBtn: { marginTop: theme.spacing.md, alignSelf: "center" },
  });
}
