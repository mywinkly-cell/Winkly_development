import React from "react";
import { View, Text, ScrollView } from "react-native";
import { SafeScreenView } from "@/components/SafeScreenView";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Card, PrimaryButton, SecondaryButton, TextButton } from "@/components/ds";
import { useAppTheme, type AppTheme } from "@/constants/design-system";

export default function GetStartedBusiness() {
  const router = useRouter();
  const { t } = useTranslation();
  const theme = useAppTheme();
  const styles = createStyles(theme);

  return (
    <SafeScreenView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={styles.title}>{t("onboarding.getStartedBusiness.title")}</Text>
          <Text style={styles.subtitle}>{t("onboarding.getStartedBusiness.subtitle")}</Text>
        </View>

        <Card style={styles.card}>
          <Text style={styles.sectionTitle}>{t("onboarding.getStarted.whatYouCanDo")}</Text>

          <View style={styles.point}>
            <Text style={styles.bullet}>•</Text>
            <Text style={styles.pointText}>{t("onboarding.getStartedBusiness.can1")}</Text>
          </View>

          <View style={styles.point}>
            <Text style={styles.bullet}>•</Text>
            <Text style={styles.pointText}>{t("onboarding.getStartedBusiness.can2")}</Text>
          </View>

          <View style={styles.point}>
            <Text style={styles.bullet}>•</Text>
            <Text style={styles.pointText}>{t("onboarding.getStartedBusiness.can3")}</Text>
          </View>

          <View style={styles.point}>
            <Text style={styles.bullet}>•</Text>
            <Text style={styles.pointText}>{t("onboarding.getStartedBusiness.can4")}</Text>
          </View>
        </Card>

        <Card style={styles.card}>
          <Text style={styles.sectionTitle}>{t("onboarding.getStarted.howItWorks")}</Text>

          <Text style={styles.step}>{t("onboarding.getStartedBusiness.step1")}</Text>
          <Text style={styles.step}>{t("onboarding.getStartedBusiness.step2")}</Text>
          <Text style={styles.step}>{t("onboarding.getStartedBusiness.step3")}</Text>
        </Card>

        <Card style={{ ...styles.card, ...styles.highlightCard }}>
          <Text style={{ ...styles.sectionTitle, color: theme.colors.primary }}>{t("onboarding.getStarted.whyUnique")}</Text>

          <View style={styles.point}>
            <Text style={styles.bullet}>•</Text>
            <Text style={styles.pointText}>{t("onboarding.getStartedBusiness.unique1")}</Text>
          </View>

          <View style={styles.point}>
            <Text style={styles.bullet}>•</Text>
            <Text style={styles.pointText}>{t("onboarding.getStartedBusiness.unique2")}</Text>
          </View>

          <View style={styles.point}>
            <Text style={styles.bullet}>•</Text>
            <Text style={styles.pointText}>{t("onboarding.getStartedBusiness.unique3")}</Text>
          </View>
        </Card>

        <PrimaryButton
          title={t("onboarding.getStartedBusiness.cta")}
          onPress={() => { Haptics.selectionAsync(); router.push("/(onboarding-business)/profile-business"); }}
          style={styles.primaryBtn}
        />

        <TextButton
          title={t("onboarding.getStarted.viewPlans")}
          onPress={() => { Haptics.selectionAsync(); router.push("/account/subscription"); }}
          style={styles.subscriptionLink}
        />

        <SecondaryButton
          title={t("onboarding.getStarted.returnToAccountSelection")}
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
