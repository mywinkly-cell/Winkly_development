// apps/mobile/app/account/subscription.tsx
// Winkly – Account: Subscription plans (reads tier from Supabase; billing TBD)

import React, { useCallback, useEffect, useState } from "react";
import { View, Text, ScrollView, ActivityIndicator, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
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
import { formatAppDate } from "@/lib/i18n/appLocale";
import type { SubscriptionTier } from "@/types";

/** i18n keys: paywall.plans.<tier>.label / .description */
const planLabelKey = (tier: SubscriptionTier) => `paywall.plans.${tier}.label`;
const planDescriptionKey = (tier: SubscriptionTier) => `paywall.plans.${tier}.description`;

const UPGRADE_TIERS: Array<Exclude<SubscriptionTier, "free" | "enterprise">> = [
  "super",
  "premium",
];

export default function Subscription() {
  const { t } = useTranslation();
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
      setNotice(t("paywall.plans.notLive"));
      return;
    }
    setNotice(null);
    setPurchasing(tier);
    const result = await purchase(tier);
    setPurchasing(null);
    if (result.ok) {
      await refresh();
      setNotice(t("paywall.plans.nowOn", { plan: t(planLabelKey(result.tier)) }));
      return;
    }
    if (result.reason === "cancelled") return;
    if (__DEV__ && result.message) console.warn("[subscription] purchase failed:", result.message);
    setNotice(result.reason === "not_configured" ? t("paywall.plans.notLive") : t("paywall.plans.purchaseFailed"));
  };

  const current = status?.tier ?? "free";

  return (
    <SafeScreenView style={styles.screen}>
      <Header title={t("settings.subscriptionPlans")} onBack={() => router.back()} />
      <ScrollView contentContainerStyle={styles.scroll}>
        <Card style={styles.card}>
          <Text style={styles.title}>{t("paywall.plans.yourPlan")}</Text>
          {loading ? (
            <ActivityIndicator color={theme.colors.primary} style={{ marginVertical: theme.spacing.md }} />
          ) : (
            <>
              <Card padding="md" elevation={0} style={styles.planBox}>
                <Text style={styles.planName}>
                  {status?.isOnTrial
                    ? t("paywall.plans.trialName", { plan: t(planLabelKey(current)) })
                    : t(planLabelKey(current))}
                </Text>
                <Text style={styles.planText}>{t(planDescriptionKey(current))}</Text>
                {status?.activeUntil ? (
                  <Text style={styles.activeUntil}>
                    {t(status.isOnTrial ? "paywall.plans.trialEnds" : "paywall.plans.activeUntil", {
                      date: formatAppDate(new Date(status.activeUntil), { year: "numeric", month: "short", day: "numeric" }),
                    })}
                  </Text>
                ) : null}
              </Card>

              {status?.isOnTrial ? (
                <View style={styles.trialBanner}>
                  <Ionicons name="sparkles-outline" size={18} color={theme.colors.primary} />
                  <Text style={styles.trialText}>
                    {t("paywall.plans.trialBanner", { count: trialDaysRemaining(status.activeUntil) })}
                  </Text>
                </View>
              ) : null}

              {!status?.isBillingConfigured ? (
                <View style={styles.comingSoonBanner}>
                  <Ionicons name="information-circle-outline" size={18} color={theme.colors.textSecondary} />
                  <Text style={styles.comingSoonText}>
                    {t("paywall.plans.comingSoon")}
                  </Text>
                </View>
              ) : null}

              {notice ? <Text style={styles.notice}>{notice}</Text> : null}

              <Text style={styles.sectionTitle}>{t("paywall.plans.upgradeOptions")}</Text>

              {UPGRADE_TIERS.map((tier) => {
                const label = t(planLabelKey(tier));
                // During the trial the user holds no paid plan yet, so keep both
                // upgrade options actionable (promote them) rather than "Current".
                const isCurrent = !status?.isOnTrial && current === tier;
                const disabled = isCurrent || !status?.isBillingConfigured || purchasing !== null;
                return (
                  <View key={tier} style={styles.planOption}>
                    <Text style={styles.planOptionTitle}>{label}</Text>
                    <Text style={styles.planOptionSub}>{t(planDescriptionKey(tier))}</Text>
                    <PrimaryButton
                      title={isCurrent ? t("paywall.plans.currentPlan") : t("paywall.plans.choose", { plan: label })}
                      onPress={() => void onChoosePlan(tier)}
                      disabled={disabled}
                      loading={purchasing === tier}
                    />
                  </View>
                );
              })}

              <SecondaryButton title={t("settings.paymentMethods")} onPress={() => router.push("/account/payments")} style={styles.secondaryBtn} />

              {status?.isBillingConfigured ? (
                <TextButton
                  title={t("paywall.plans.manageInStore")}
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
