// apps/mobile/app/account/premium.tsx
// Winkly – Account: Premium (marketing + CTA)

import React from "react";
import { Text, ScrollView, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { SafeScreenView } from "@/components/SafeScreenView";
import { Card, Header, PrimaryButton, SecondaryButton } from "@/components/ds";
import { useAppTheme, type AppTheme } from "@/constants/design-system";

export default function Premium() {
  const router = useRouter();
  const theme = useAppTheme();
  const styles = createStyles(theme);

  return (
    <SafeScreenView style={styles.screen}>
      <Header title="Premium" onBack={() => router.back()} />
      <ScrollView contentContainerStyle={styles.scroll}>
        <Card style={styles.card}>
          <Text style={styles.title}>Winkly Premium</Text>
          <Text style={styles.subtitle}>
            Upgrade for better discovery, smarter suggestions, and more control. (UI placeholder — pricing later)
          </Text>

          <Card padding="md" elevation={0} style={styles.featureBox}>
            <Text style={styles.featureTitle}>What you'll get</Text>
            <Text style={styles.featureText}>• More daily recommendations</Text>
            <Text style={styles.featureText}>• Advanced filters in Friends & Business</Text>
            <Text style={styles.featureText}>• Priority AI matches</Text>
            <Text style={styles.featureText}>• See who viewed / liked you (future)</Text>
          </Card>

          <PrimaryButton title="View plans" onPress={() => router.push("/account/subscription")} style={styles.actionBtn} />
          <SecondaryButton title="Payment methods" onPress={() => router.push("/account/payments")} />

          <Text style={styles.note}>
            Next step: integrate billing (App Store / Play / Stripe) and store entitlement in Supabase.
          </Text>
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
    subtitle: { ...theme.type.body, fontFamily: theme.type.body.fontFamily, color: theme.colors.textSecondary, marginBottom: theme.spacing.md },
    featureBox: { marginBottom: theme.spacing.md },
    featureTitle: { ...theme.type.h3, fontFamily: theme.type.h3.fontFamily, color: theme.colors.textPrimary, marginBottom: theme.spacing.sm },
    featureText: { ...theme.type.body, fontFamily: theme.type.body.fontFamily, color: theme.colors.textSecondary, marginBottom: theme.spacing.xxs },
    actionBtn: { marginBottom: theme.spacing.sm },
    note: { ...theme.type.caption, fontFamily: theme.type.caption.fontFamily, color: theme.colors.textSecondary, marginTop: theme.spacing.md, textAlign: "center" },
  });
}
