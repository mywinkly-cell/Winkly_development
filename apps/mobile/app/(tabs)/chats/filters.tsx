// Chats filters — Filter conversations by mode, unread, etc.
// Reached from Chats header filter icon (no longer opens planner).

import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Header } from "@/components/ds";
import { useAppTheme, type AppTheme } from "@/constants/design-system";

export default function ChatsFilters() {
  const { t } = useTranslation();
  const router = useRouter();
  const theme = useAppTheme();
  const styles = createStyles(theme);

  return (
    <View style={styles.screen}>
      <Header title={t("chat.filters.title")} onBack={() => router.back()} />
      <View style={styles.content}>
        <Text style={styles.placeholder}>
          {t("chat.filters.placeholder")}
        </Text>
      </View>
    </View>
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.colors.background },
    content: {
      flex: 1,
      padding: theme.spacing.xl,
    },
    placeholder: {
      ...theme.type.body,
      fontFamily: theme.type.body.fontFamily,
      color: theme.colors.textSecondary,
    },
  });
}
