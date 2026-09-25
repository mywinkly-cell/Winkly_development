// ────────────────────────────────────────────────
// Winkly — Privacy & Safety (Settings v8)
// Visibility, discovery, location, blocked users (blacklist)
// ────────────────────────────────────────────────

import React from "react";
import { View, Text, ScrollView, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { SafeScreenView } from "@/components/SafeScreenView";
import { Card, Header, ListRow } from "@/components/ds";
import { useAppTheme, type AppTheme } from "@/constants/design-system";

export default function PrivacySafety() {
  const { t } = useTranslation();
  const router = useRouter();
  const theme = useAppTheme();
  const styles = createStyles(theme);

  const Row = ({
    title,
    subtitle,
    onPress,
    icon,
    last,
  }: {
    title: string;
    subtitle?: string;
    onPress: () => void;
    icon: keyof typeof Ionicons.glyphMap;
    last?: boolean;
  }) => (
    <ListRow
      title={title}
      subtitle={subtitle}
      onPress={() => {
        Haptics.selectionAsync();
        onPress();
      }}
      style={last ? styles.row : { ...styles.row, ...styles.rowBorder }}
      leading={
        <View style={styles.iconWrap}>
          <Ionicons name={icon} size={20} color={theme.colors.primary} />
        </View>
      }
    />
  );

  return (
    <SafeScreenView style={styles.screen}>
      <Header title={t("account.privacy.title")} onBack={() => router.back()} />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={styles.sectionTitle}>{t("account.privacy.discoverySection")}</Text>
        <Card padding="none" style={styles.card}>
          <Row title={t("account.privacy.visibility")} subtitle={t("account.privacy.visibilitySub")} onPress={() => {}} icon="eye-outline" />
          <Row title={t("account.privacy.recommendations")} subtitle={t("account.privacy.recommendationsSub")} onPress={() => {}} icon="options-outline" />
          <Row title={t("account.privacy.locationRadius")} subtitle={t("account.privacy.locationRadiusSub")} onPress={() => router.push("/planner/settings")} icon="location-outline" />
          <Row title={t("account.location.title")} subtitle={t("account.privacy.locationPrecisionSub")} onPress={() => router.push("/account/location-privacy" as never)} icon="navigate-outline" />
          <Row title={t("settings.photoVerification")} subtitle={t("account.privacy.photoVerificationSub")} onPress={() => router.push("/account/photo-verification" as never)} icon="camera-outline" />
          <Row title={t("account.privacy.dataSharing")} subtitle={t("account.privacy.dataSharingSub")} onPress={() => router.push("/account/ai-memory")} icon="share-social-outline" last />
        </Card>

        <Text style={styles.sectionTitle}>{t("account.privacy.aiSection")}</Text>
        <Card padding="none" style={styles.card}>
          <Row title={t("account.aiMemory.deleteButton")} subtitle={t("account.privacy.deleteAiMemorySub")} onPress={() => router.push("/account/ai-memory")} icon="trash-outline" last />
        </Card>

        <Text style={styles.sectionTitle}>{t("account.blocked.title")}</Text>
        <Card style={styles.card}>
          <Text style={styles.hint}>
            {t("account.privacy.blockedHint")}
          </Text>
          <ListRow
            title={t("account.privacy.viewBlocked")}
            onPress={() => {
              Haptics.selectionAsync();
              router.push("/account/blocked-users");
            }}
            style={styles.plainRow}
            leading={<Ionicons name="remove-circle-outline" size={22} color={theme.colors.primary} />}
          />
        </Card>
      </ScrollView>
    </SafeScreenView>
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.colors.backgroundMuted },
    scroll: { padding: theme.spacing.xl, paddingBottom: theme.spacing.huge },
    sectionTitle: {
      ...theme.type.overline,
      fontFamily: theme.type.overline.fontFamily,
      color: theme.colors.textSecondary,
      marginBottom: theme.spacing.sm,
      marginLeft: theme.spacing.xxs,
    },
    card: { marginBottom: theme.spacing.xxl, overflow: "hidden" },
    row: { paddingHorizontal: theme.spacing.lg },
    rowBorder: { borderBottomWidth: 1, borderBottomColor: theme.colors.border },
    plainRow: { paddingHorizontal: 0 },
    iconWrap: {
      width: 36,
      height: 36,
      borderRadius: theme.radii.sm,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.colors.primary + "15",
    },
    hint: {
      ...theme.type.caption,
      fontFamily: theme.type.caption.fontFamily,
      color: theme.colors.textSecondary,
      marginBottom: theme.spacing.sm,
    },
  });
}
