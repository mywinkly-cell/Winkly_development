// apps/mobile/app/account/language.tsx
// Winkly — App language selection
// Entry: Notifications & Preferences → Language

import React from "react";
import { Text, ScrollView, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { SafeScreenView } from "@/components/SafeScreenView";
import { LanguageList } from "@/components/i18n/LanguageList";
import { Header } from "@/components/ds";
import { useAppTheme, type AppTheme } from "@/constants/design-system";

export default function LanguageScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const theme = useAppTheme();
  const styles = createStyles(theme);

  return (
    <SafeScreenView style={styles.screen}>
      <Header title={t("language.title")} onBack={() => router.back()} />

      <Text style={styles.subtitle}>{t("language.subtitle")}</Text>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <LanguageList />
      </ScrollView>
    </SafeScreenView>
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.colors.backgroundMuted },
    subtitle: {
      ...theme.type.body,
      fontFamily: theme.type.body.fontFamily,
      color: theme.colors.textSecondary,
      paddingHorizontal: theme.spacing.xl,
      paddingTop: theme.spacing.md,
      paddingBottom: theme.spacing.sm,
    },
    scroll: { flex: 1 },
    scrollContent: { padding: theme.spacing.xl, paddingBottom: theme.spacing.huge },
  });
}
