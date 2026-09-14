import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { useAppTheme, type AppTheme } from "@/constants/design-system";

export default function NotFoundScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const theme = useAppTheme();
  const styles = createStyles(theme);

  return (
    <View style={styles.screen}>
      <Text style={styles.title}>{t("notFound.title")}</Text>

      <Text style={styles.text}>{t("notFound.message")}</Text>

      <TouchableOpacity
        onPress={() => router.replace("/")}
        style={styles.btn}
        activeOpacity={0.9}
      >
        <Text style={styles.btnText}>{t("notFound.goHome")}</Text>
      </TouchableOpacity>
    </View>
  );
}

function createStyles(theme: AppTheme) {
  return {
    screen: {
      flex: 1,
      paddingTop: theme.spacing.md,
      alignItems: "center" as const,
      justifyContent: "center" as const,
      paddingHorizontal: theme.spacing.xl,
      backgroundColor: theme.colors.background,
    },
    title: { ...theme.type.h1, fontWeight: "900" as const, marginBottom: 10, color: theme.colors.textPrimary },
    text: { color: theme.colors.textSecondary, textAlign: "center" as const, marginBottom: 20 },
    btn: { borderRadius: 16, paddingVertical: 14, paddingHorizontal: 30, backgroundColor: theme.colors.primary },
    btnText: { color: theme.colors.onPrimary, fontWeight: "900" as const },
  };
}
