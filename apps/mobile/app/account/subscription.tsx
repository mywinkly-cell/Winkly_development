// apps/mobile/app/account/subscription.tsx
// Winkly – Account: Subscription plans (reads tier from Supabase; billing TBD)

import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Colors, Typography, Layout } from "@/constants/tokens";
import {
  getSubscriptionStatus,
  purchase,
  openManageSubscriptions,
  type SubscriptionStatus,
} from "@/lib/integrations/payments";
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
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.headerRow}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={styles.backBtn}
            activeOpacity={0.9}
            accessibilityLabel="Back"
          >
            <Ionicons name="arrow-back" size={24} color={Colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Subscription plans</Text>
          <View style={{ width: 60 }} />
        </View>

        <View style={styles.card}>
          <Text style={styles.title}>Your plan</Text>
          {loading ? (
            <ActivityIndicator color={Colors.primaryViolet} style={{ marginVertical: 12 }} />
          ) : (
            <>
              <View style={styles.planBox}>
                <Text style={styles.planName}>{currentCopy.label}</Text>
                <Text style={styles.planText}>{currentCopy.description}</Text>
                {status?.activeUntil ? (
                  <Text style={styles.activeUntil}>
                    Active until {new Date(status.activeUntil).toLocaleDateString()}
                  </Text>
                ) : null}
              </View>

              {!status?.isBillingConfigured ? (
                <View style={styles.comingSoonBanner}>
                  <Ionicons name="information-circle-outline" size={18} color={Colors.gray700} />
                  <Text style={styles.comingSoonText}>
                    Paid upgrades are coming soon. Plans below are for preview — no charges yet.
                  </Text>
                </View>
              ) : null}

              {notice ? <Text style={styles.notice}>{notice}</Text> : null}

              <Text style={styles.sectionTitle}>Upgrade options</Text>

              {UPGRADE_TIERS.map((tier) => {
                const copy = PLAN_COPY[tier];
                const isCurrent = current === tier;
                const disabled = isCurrent || !status?.isBillingConfigured || purchasing !== null;
                return (
                  <View key={tier} style={styles.planOption}>
                    <Text style={styles.planOptionTitle}>{copy.label}</Text>
                    <Text style={styles.planOptionSub}>{copy.description}</Text>
                    <TouchableOpacity
                      onPress={() => void onChoosePlan(tier)}
                      style={[
                        styles.primaryBtn,
                        (disabled || isCurrent) && styles.primaryBtnDisabled,
                      ]}
                      activeOpacity={0.9}
                      disabled={disabled}
                    >
                      {purchasing === tier ? (
                        <ActivityIndicator color={Colors.accentYellow} />
                      ) : (
                        <Text style={styles.primaryText}>
                          {isCurrent ? "Current plan" : `Choose ${copy.label}`}
                        </Text>
                      )}
                    </TouchableOpacity>
                  </View>
                );
              })}

              <TouchableOpacity
                onPress={() => router.push("/account/payments")}
                style={styles.secondaryBtn}
                activeOpacity={0.9}
              >
                <Text style={styles.secondaryText}>Payment methods</Text>
              </TouchableOpacity>

              {status?.isBillingConfigured ? (
                <TouchableOpacity
                  onPress={() => void openManageSubscriptions()}
                  style={styles.linkBtn}
                  activeOpacity={0.9}
                >
                  <Text style={styles.linkText}>Manage subscription in store</Text>
                </TouchableOpacity>
              ) : null}
            </>
          )}
        </View>
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

  planBox: {
    backgroundColor: Colors.backgroundLight,
    borderRadius: Layout.radii.card,
    borderWidth: 1,
    borderColor: Colors.gray200,
    padding: 14,
    marginBottom: 14,
  },
  planName: { ...Typography.h3, color: Colors.textPrimary, marginBottom: 4 },
  planText: { ...Typography.body, color: Colors.gray700 },
  activeUntil: { ...Typography.caption, color: Colors.gray600, marginTop: 8 },

  comingSoonBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    backgroundColor: Colors.gray100,
    borderRadius: Layout.radii.control,
    padding: 12,
    marginBottom: 12,
  },
  comingSoonText: { ...Typography.caption, color: Colors.gray700, flex: 1, lineHeight: 18 },

  notice: {
    ...Typography.caption,
    color: Colors.primaryViolet,
    marginBottom: 12,
    textAlign: "center",
  },

  sectionTitle: { ...Typography.h3, color: Colors.textPrimary, marginBottom: 12 },

  planOption: { marginBottom: 14 },
  planOptionTitle: { ...Typography.body, color: Colors.textPrimary, marginBottom: 4 },
  planOptionSub: { ...Typography.caption, color: Colors.gray600, marginBottom: 10 },

  primaryBtn: {
    backgroundColor: Colors.primaryViolet,
    borderRadius: Layout.radii.control,
    paddingVertical: 12,
    alignItems: "center",
  },
  primaryBtnDisabled: { opacity: 0.55 },
  primaryText: { ...Typography.button, color: Colors.accentYellow },

  secondaryBtn: {
    backgroundColor: Colors.gray100,
    borderRadius: Layout.radii.control,
    paddingVertical: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: Colors.gray200,
    marginTop: 4,
  },
  secondaryText: { ...Typography.button, color: Colors.textPrimary },

  linkBtn: { marginTop: 12, alignItems: "center" },
  linkText: { ...Typography.caption, color: Colors.primaryViolet, textDecorationLine: "underline" },
});
