// ────────────────────────────────────────────────
// Winkly General Settings — One place for account, notifications, planner & app
// Entry: Mode Selection home tab only (violet settings icon).
// ────────────────────────────────────────────────

import React from "react";
import { View, Text, ScrollView, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { Routes } from "@/constants/routes";
import { useTranslation } from "react-i18next";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { SafeScreenView } from "@/components/SafeScreenView";
import { Card, Header, ListRow } from "@/components/ds";
import { useAppTheme, type AppTheme, type ModeName } from "@/constants/design-system";

type SectionItem = {
  title: string;
  subtitle?: string;
  route: string;
  icon: keyof typeof Ionicons.glyphMap;
  accentMode?: ModeName;
};

type Section = {
  title: string;
  items: SectionItem[];
};

function useSections(): Section[] {
  const { t } = useTranslation();
  return [
    {
      title: t("settings.account"),
      items: [
        { title: t("settings.accountIdentity"), subtitle: t("settings.accountIdentitySub"), route: "/account/account-identity", icon: "person-outline" },
      ],
    },
    {
      title: t("settings.privacySafety"),
      items: [
        { title: t("settings.privacySafety"), subtitle: t("settings.privacySafetySub"), route: "/account/privacy-safety", icon: "shield-checkmark-outline" },
        { title: t("settings.photoVerification"), subtitle: t("settings.photoVerificationSub"), route: "/account/photo-verification", icon: "camera-outline" },
      ],
    },
    {
      title: t("settings.notificationsPlanner"),
      items: [
        { title: t("settings.notificationsLanguage"), subtitle: t("settings.notificationsLanguageSub"), route: "/account/notifications-preferences", icon: "notifications-outline" },
        { title: t("settings.plannerReminders"), subtitle: t("settings.plannerRemindersSub"), route: "/planner/settings", icon: "calendar-outline", accentMode: "events" },
      ],
    },
    {
      title: t("settings.billing"),
      items: [
        { title: t("settings.subscriptionPlans"), subtitle: t("settings.subscriptionPlansSub"), route: "/account/subscription", icon: "card-outline" },
        { title: t("settings.paymentMethods"), subtitle: t("settings.paymentMethodsSub"), route: "/account/payments", icon: "wallet-outline" },
      ],
    },
    {
      title: t("settings.supportLegal"),
      items: [
        { title: t("settings.legal"), subtitle: t("settings.legalSub"), route: "/account/legal", icon: "document-text-outline" },
        { title: t("settings.inviteFriends"), subtitle: t("settings.inviteFriendsSub"), route: "/account/invite", icon: "people-outline" },
        { title: "Send feedback", subtitle: "Tell us what's working (or not)", route: "/account/send-feedback", icon: "chatbox-ellipses-outline" },
      ],
    },
    {
      title: t("settings.app"),
      items: [
        { title: t("settings.appInfo"), subtitle: t("settings.appInfoSub"), route: "/account/app-info", icon: "information-circle-outline" },
      ],
    },
  ];
}

function SectionCard({ title, items }: Section) {
  const router = useRouter();
  const theme = useAppTheme();
  const styles = createStyles(theme);

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <Card padding="none" style={styles.card}>
        {items.map((item, idx) => {
          const accent = item.accentMode ? theme.modeAccent(item.accentMode) : null;
          return (
            <ListRow
              key={item.route}
              title={item.title}
              subtitle={item.subtitle}
              onPress={() => {
                Haptics.selectionAsync();
                router.push(item.route as any);
              }}
              style={{
                ...styles.row,
                ...(idx < items.length - 1 ? styles.rowBorder : null),
              }}
              leading={
                <View
                  style={[
                    styles.iconWrap,
                    { backgroundColor: accent ? accent.bg : theme.colors.primary + "15" },
                  ]}
                >
                  <Ionicons name={item.icon} size={22} color={accent ? accent.primary : theme.colors.primary} />
                </View>
              }
            />
          );
        })}
      </Card>
    </View>
  );
}

export default function SettingsIndex() {
  const router = useRouter();
  const { t } = useTranslation();
  const theme = useAppTheme();
  const styles = createStyles(theme);
  const sections = useSections();

  const handleBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace(Routes.onboardingModeSelection);
  };

  return (
    <SafeScreenView style={styles.screen}>
      <Header title={t("settings.general")} onBack={handleBack} />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.intro}>
          {t("settings.intro")}
        </Text>
        {sections.map((section) => (
          <SectionCard key={section.title} {...section} />
        ))}
      </ScrollView>
    </SafeScreenView>
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: theme.colors.backgroundMuted,
    },
    scroll: {
      flex: 1,
    },
    scrollContent: {
      padding: theme.spacing.xl,
      paddingBottom: theme.spacing.huge,
    },
    intro: {
      ...theme.type.body,
      fontFamily: theme.type.body.fontFamily,
      color: theme.colors.textSecondary,
      marginBottom: theme.spacing.xl,
      paddingHorizontal: theme.spacing.xxs,
    },
    section: {
      marginBottom: theme.spacing.xxl,
    },
    sectionTitle: {
      ...theme.type.overline,
      fontFamily: theme.type.overline.fontFamily,
      color: theme.colors.textSecondary,
      marginBottom: theme.spacing.sm,
      marginLeft: theme.spacing.xxs,
    },
    card: {
      overflow: "hidden",
    },
    row: {
      paddingHorizontal: theme.spacing.lg,
    },
    rowBorder: {
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border,
    },
    iconWrap: {
      width: 40,
      height: 40,
      borderRadius: theme.radii.sm,
      alignItems: "center",
      justifyContent: "center",
      marginRight: theme.spacing.xs,
    },
  });
}
