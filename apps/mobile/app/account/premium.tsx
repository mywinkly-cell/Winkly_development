// apps/mobile/app/account/premium.tsx
// Winkly – Account: Premium (marketing + CTA)

import React from "react";
import { Text, ScrollView, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { SafeScreenView } from "@/components/SafeScreenView";
import { Card, Header, PrimaryButton, SecondaryButton } from "@/components/ds";
import { useAppTheme, type AppTheme } from "@/constants/design-system";

export default function Premium() {
  const { t } = useTranslation();
  const router = useRouter();
  const theme = useAppTheme();
  const styles = createStyles(theme);

  return (
    <SafeScreenView style={styles.screen}>
      <Header title={t("paywall.premium.title")} onBack={() => router.back()} />
      <ScrollView contentContainerStyle={styles.scroll}>
        <Card style={styles.card}>
          <Text style={styles.title}>{t("paywall.premium.heading")}</Text>
          <Text style={styles.subtitle}>
            {t("paywall.premium.subtitle")}
          </Text>

          <Card padding="md" elevation={0} style={styles.featureBox}>
            <Text style={styles.featureTitle}>{t("paywall.premium.whatYouGet")}</Text>
            <Text style={styles.featureText}>{t("paywall.premium.bullet", { text: t("paywall.premium.featureRecommendations") })}</Text>
            <Text style={styles.featureText}>{t("paywall.premium.bullet", { text: t("paywall.premium.featureFilters") })}</Text>
            <Text style={styles.featureText}>{t("paywall.premium.bullet", { text: t("paywall.premium.featurePriority") })}</Text>
            <Text style={styles.featureText}>{t("paywall.premium.bullet", { text: t("paywall.premium.featureWhoLiked") })}</Text>
          </Card>

          <PrimaryButton title={t("paywall.premium.viewPlans")} onPress={() => router.push("/account/subscription")} style={styles.actionBtn} />
          <SecondaryButton title={t("settings.paymentMethods")} onPress={() => router.push("/account/payments")} />
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
  });
}
