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
import { useTranslation } from "react-i18next";
import { Ionicons } from "@expo/vector-icons";
import { SparklesIcon } from "@/components/ui/WinklyAISpark";
import { Card, ListRow, PrimaryButton, SecondaryButton } from "@/components/ds";
import { useAppTheme, type AppTheme } from "@/constants/design-system";

export default function GetStartedPersonal() {
  const router = useRouter();
  const { t } = useTranslation();
  const theme = useAppTheme();
  const styles = createStyles(theme);

  return (
    <SafeScreenView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={styles.title}>{t("onboarding.getStartedPersonal.title")}</Text>
          <Text style={styles.subtitle}>{t("onboarding.getStartedPersonal.subtitle")}</Text>
        </View>

        <Card style={styles.card}>
          <Text style={styles.sectionTitle}>{t("onboarding.getStarted.whatYouCanDo")}</Text>

          <View style={styles.point}>
            <Text style={styles.bullet}>•</Text>
            <Text style={styles.pointText}>{t("onboarding.getStartedPersonal.can1")}</Text>
          </View>

          <View style={styles.point}>
            <Text style={styles.bullet}>•</Text>
            <Text style={styles.pointText}>{t("onboarding.getStartedPersonal.can2")}</Text>
          </View>

          <View style={styles.point}>
            <Text style={styles.bullet}>•</Text>
            <Text style={styles.pointText}>{t("onboarding.getStartedPersonal.can3")}</Text>
          </View>

          <View style={styles.point}>
            <Text style={styles.bullet}>•</Text>
            <Text style={styles.pointText}>{t("onboarding.getStartedPersonal.can4")}</Text>
          </View>
        </Card>

        <Card style={styles.card}>
          <Text style={styles.sectionTitle}>{t("onboarding.getStarted.howItWorks")}</Text>

          <Text style={styles.step}>{t("onboarding.getStartedPersonal.step1")}</Text>
          <Text style={styles.step}>{t("onboarding.getStartedPersonal.step2")}</Text>
          <Text style={styles.step}>{t("onboarding.getStartedPersonal.step3")}</Text>
        </Card>

        <Card style={{ ...styles.card, ...styles.highlightCard }}>
          <Text style={{ ...styles.sectionTitle, color: theme.colors.primary }}>{t("onboarding.getStarted.whyUnique")}</Text>

          <View style={styles.point}>
            <View style={styles.iconSlot}>
              <SparklesIcon size={16} color={theme.colors.primary} />
            </View>
            <Text style={{ ...styles.pointText, flex: 1 }}>{t("onboarding.getStartedPersonal.unique1")}</Text>
          </View>

          <View style={styles.point}>
            <View style={styles.iconSlot}>
              <Ionicons name="shield-checkmark" size={16} color={theme.colors.primary} />
            </View>
            <Text style={{ ...styles.pointText, flex: 1 }}>{t("onboarding.getStartedPersonal.unique2")}</Text>
          </View>

          <View style={styles.point}>
            <View style={styles.iconSlot}>
              <Ionicons name="calendar" size={16} color={theme.colors.primary} />
            </View>
            <Text style={{ ...styles.pointText, flex: 1 }}>{t("onboarding.getStartedPersonal.unique3")}</Text>
          </View>
        </Card>

        <PrimaryButton
          title={t("onboarding.getStartedPersonal.cta")}
          onPress={() => { Haptics.selectionAsync(); router.push("/(onboarding-personal)/profile-core"); }}
          style={styles.primaryBtn}
        />

        <ListRow
          title={t("onboarding.getStarted.viewPlans")}
          onPress={() => { Haptics.selectionAsync(); router.push("/account/subscription"); }}
          style={styles.subscriptionLink}
          leading={<Ionicons name="star-outline" size={18} color={theme.colors.primary} />}
        />

        <SecondaryButton
          title={t("onboarding.getStarted.returnToAccountSelection")}
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
