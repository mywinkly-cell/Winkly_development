// apps/mobile/app/account/payments.tsx
// Winkly – Account: Payment methods (reads billing status; store integration TBD)

import { Ionicons } from "@expo/vector-icons";
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
import { useAppTheme, type AppTheme } from "@/constants/design-system";
import { getSubscriptionStatus, type SubscriptionStatus } from "@/lib/integrations/payments";

export default function Payments() {
  const router = useRouter();
  const theme = useAppTheme();
  const styles = createStyles(theme);
  const [status, setStatus] = useState<SubscriptionStatus | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    const next = await getSubscriptionStatus();
    setStatus(next);
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const billingReady = status?.isBillingConfigured ?? false;

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.9}>
            <Ionicons name="arrow-back" size={24} color={theme.colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Payments</Text>
          <View style={{ width: 60 }} />
        </View>

        <View style={styles.card}>
          <Text style={styles.title}>Payment methods</Text>
          <Text style={styles.subtitle}>
            Add and manage your payment method for Premium and subscriptions.
          </Text>

          {loading ? (
            <ActivityIndicator color={theme.colors.primary} style={{ marginVertical: 12 }} />
          ) : (
            <>
              <View style={styles.box}>
                <Text style={styles.boxTitle}>No payment method added</Text>
                <Text style={styles.boxText}>
                  {billingReady
                    ? "Add a card or use in-app billing from your device store."
                    : "Payment methods will be available when billing goes live."}
                </Text>
              </View>

              {!billingReady ? (
                <View style={styles.comingSoonBanner}>
                  <Ionicons name="information-circle-outline" size={18} color={theme.colors.textSecondary} />
                  <Text style={styles.comingSoonText}>
                    Paid billing is coming soon. This screen is for preview — no charges yet.
                  </Text>
                </View>
              ) : null}

              <TouchableOpacity
                onPress={() => {}}
                style={[styles.primaryBtn, !billingReady && styles.primaryBtnDisabled]}
                activeOpacity={0.9}
                disabled={!billingReady}
              >
                <Text style={styles.primaryText}>Add payment method</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => router.push("/account/subscription")}
                style={styles.secondaryBtn}
                activeOpacity={0.9}
              >
                <Text style={styles.secondaryText}>Manage subscription</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.colors.background },
    scroll: { padding: 20, paddingBottom: 40 },

    headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
    backBtn: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: theme.colors.backgroundMuted,
      alignItems: "center",
      justifyContent: "center",
      ...theme.elevation(1),
    },
    headerTitle: { ...theme.type.h2, color: theme.colors.textPrimary },

    card: { backgroundColor: theme.colors.surface, borderRadius: theme.radii.lg, borderWidth: 1, borderColor: theme.colors.border, padding: 16 },
    title: { ...theme.type.h2, color: theme.colors.textPrimary, marginBottom: 6 },
    subtitle: { ...theme.type.body, color: theme.colors.textSecondary, marginBottom: 14 },

    box: {
      backgroundColor: theme.colors.background,
      borderRadius: theme.radii.lg,
      borderWidth: 1,
      borderColor: theme.colors.border,
      padding: 14,
      marginBottom: 14,
    },
    boxTitle: { ...theme.type.h3, color: theme.colors.textPrimary, marginBottom: 6 },
    boxText: { ...theme.type.body, color: theme.colors.textSecondary },

    comingSoonBanner: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 8,
      backgroundColor: theme.colors.backgroundMuted,
      borderRadius: theme.radii.md,
      padding: 12,
      marginBottom: 12,
    },
    comingSoonText: { ...theme.type.caption, color: theme.colors.textSecondary, flex: 1, lineHeight: 18 },

    primaryBtn: { backgroundColor: theme.colors.primary, borderRadius: theme.radii.md, paddingVertical: 12, alignItems: "center", marginBottom: 10 },
    primaryBtnDisabled: { opacity: 0.55 },
    primaryText: { ...theme.type.button, color: theme.colors.onPrimary },

    secondaryBtn: { backgroundColor: theme.colors.backgroundMuted, borderRadius: theme.radii.md, paddingVertical: 12, alignItems: "center", borderWidth: 1, borderColor: theme.colors.border },
    secondaryText: { ...theme.type.button, color: theme.colors.textPrimary },
  });
}
