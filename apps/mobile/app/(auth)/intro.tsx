// apps/mobile/app/(auth)/intro.tsx
// Winkly Intro — Premium, modern, professional

import React, { useRef, useEffect } from "react";
import { View, Text, Image, TouchableOpacity, StyleSheet, Animated } from "react-native";
import { SafeScreenView } from "@/components/SafeScreenView";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { Trans, useTranslation } from "react-i18next";
import { useAppTheme, type AppTheme } from "@/constants/design-system";

export default function Intro() {
  const router = useRouter();
  const { t } = useTranslation();
  const theme = useAppTheme();
  const styles = createStyles(theme);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }).start();
  }, [fadeAnim]);

  return (
    <SafeScreenView style={styles.safe}>
      <Animated.View style={[styles.screen, { opacity: fadeAnim }]}>
        <View style={styles.content}>
          <Image
            source={require("../../assets/icons/winkly-logo.png")}
            resizeMode="contain"
            style={styles.wordmark}
            accessibilityLabel={t("auth.intro.logoA11y")}
          />

          <Text style={styles.title}>{t("auth.intro.title")}</Text>

          <Text style={styles.subtitle}>{t("auth.intro.subtitle")}</Text>

          <TouchableOpacity
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push("/(auth)/signup");
            }}
            style={styles.primaryBtn}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={t("auth.createAccount")}
          >
            <Text style={styles.primaryText}>{t("auth.createAccount")}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push("/(auth)/signin");
            }}
            style={styles.secondaryBtn}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={t("auth.signin")}
          >
            <Text style={styles.secondaryText}>{t("auth.signin")}</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.legal}>
          <Trans
            i18nKey="auth.intro.legal"
            components={{ terms: <Text style={styles.link} />, privacy: <Text style={styles.link} /> }}
          />
        </Text>
      </Animated.View>
    </SafeScreenView>
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: theme.colors.backgroundMuted },
    screen: {
      flex: 1,
      backgroundColor: theme.colors.backgroundMuted,
      paddingHorizontal: theme.spacing.xxl,
      paddingTop: theme.spacing.xxxl,
      paddingBottom: theme.spacing.xxl,
      justifyContent: "space-between",
    },
    content: { alignItems: "center", justifyContent: "center", flex: 1 },
    wordmark: { width: 220, height: 80, marginBottom: 32 },
    title: {
      fontFamily: theme.type.h1.fontFamily,
      fontSize: 26,
      lineHeight: 36,
      color: theme.colors.textPrimary,
      textAlign: "center",
      marginBottom: 16,
      letterSpacing: 0.3,
    },
    subtitle: {
      ...theme.type.body,
      color: theme.colors.textSecondary,
      textAlign: "center",
      marginBottom: 32,
      maxWidth: 340,
      lineHeight: 24,
    },
    primaryBtn: {
      width: "100%",
      maxWidth: 360,
      backgroundColor: theme.colors.primary,
      borderRadius: theme.radii.md,
      paddingVertical: 16,
      alignItems: "center",
      marginBottom: 12,
      minHeight: 44,
      justifyContent: "center",
      ...theme.elevation(2),
    },
    primaryText: { ...theme.type.button, color: theme.colors.onPrimary, fontFamily: theme.type.button.fontFamily },
    secondaryBtn: {
      width: "100%",
      maxWidth: 360,
      borderRadius: theme.radii.md,
      paddingVertical: 14,
      alignItems: "center",
      borderWidth: 2,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
      minHeight: 48,
      justifyContent: "center",
    },
    secondaryText: { ...theme.type.button, color: theme.colors.primary, fontFamily: theme.type.button.fontFamily },
    legal: { ...theme.type.caption, color: theme.colors.textSecondary, textAlign: "center", paddingHorizontal: 16, lineHeight: 20 },
    link: { color: theme.colors.primary, fontWeight: "600" },
  });
}
