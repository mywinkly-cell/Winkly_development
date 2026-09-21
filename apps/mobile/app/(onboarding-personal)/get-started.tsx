// ────────────────────────────────────────────────
// Winkly Onboarding – Get Started Screen
// v7.0 – November 2025
// © Winkly Technologies UG (haftungsbeschränkt)
// Purpose: Let user choose account type (Personal / Business)
// and start onboarding flow
// ────────────────────────────────────────────────

import React, { useEffect, useRef } from "react";
import { Text, Image, Pressable, ScrollView, Animated } from "react-native";
import { SafeScreenView } from "@/components/SafeScreenView";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Card, TextButton } from "@/components/ds";
import { useAppTheme, type AppTheme } from "@/constants/design-system";
import { isAccountTypeAvailable } from "@/lib/modes/availability";
import { getTermsAndCookiesAccepted } from "@/lib/legalFlags";

export default function GetStarted() {
  const { t } = useTranslation();
  const router = useRouter();
  const theme = useAppTheme();
  const styles = createStyles(theme);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 320, useNativeDriver: true }).start();
  }, [fadeAnim]);

  useEffect(() => {
    getTermsAndCookiesAccepted().then((accepted) => {
      if (!accepted) router.replace("/(auth)/terms-cookies");
    });
  }, [router]);

  return (
    <SafeScreenView style={{ flex: 1, backgroundColor: theme.colors.backgroundMuted }}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View style={{ alignItems: "center", opacity: fadeAnim }}>
          <Image
            source={require("../../assets/icons/winkly-emoji-shadow.png")}
            resizeMode="contain"
            style={{ width: 140, height: 140, marginBottom: theme.spacing.xxl }}
          />

          <Text style={styles.title}>
            {t("onboarding.getStarted.title")}
          </Text>

          <Text style={styles.subtitle}>
            {t("onboarding.getStarted.subtitle")}
          </Text>

          <Pressable
            onPress={() => { Haptics.selectionAsync(); router.push("/(auth)/signup?accountType=personal"); }}
          >
            <Card style={styles.cardButton}>
              <Text style={styles.cardTitle}>{t("onboarding.getStarted.personalTitle")}</Text>
              <Text style={styles.cardText}>{t("onboarding.getStarted.personalLine1")}</Text>
              <Text style={styles.cardText}>{t("onboarding.getStarted.personalLine2")}</Text>
            </Card>
          </Pressable>

          {isAccountTypeAvailable("business") ? (
            <Pressable
              onPress={() => { Haptics.selectionAsync(); router.push("/(auth)/signup?accountType=business"); }}
            >
              <Card style={styles.cardButton}>
                <Text style={styles.cardTitle}>{t("onboarding.getStarted.businessTitle")}</Text>
                <Text style={styles.cardText}>{t("onboarding.getStarted.businessLine1")}</Text>
                <Text style={styles.cardText}>{t("onboarding.getStarted.businessLine2")}</Text>
              </Card>
            </Pressable>
          ) : null}

          <TextButton
            title={`${t("auth.hasAccount")} ${t("auth.signin")}`}
            onPress={() => { Haptics.selectionAsync(); router.push("/(auth)/signin"); }}
            style={{ marginTop: theme.spacing.lg }}
          />

          <Text style={styles.hint}>
            {t("onboarding.getStarted.switchHint")}
          </Text>
        </Animated.View>
      </ScrollView>
    </SafeScreenView>
  );
}

function createStyles(theme: AppTheme) {
  return {
    scroll: {
      flexGrow: 1,
      justifyContent: "center" as const,
      alignItems: "center" as const,
      paddingHorizontal: theme.spacing.xxxl,
      paddingVertical: theme.spacing.xxl,
    },
    title: {
      ...theme.type.h1,
      fontFamily: theme.type.h1.fontFamily,
      color: theme.colors.primary,
      textAlign: "center" as const,
      marginBottom: theme.spacing.md,
    },
    subtitle: {
      ...theme.type.body,
      fontFamily: theme.type.body.fontFamily,
      color: theme.colors.textSecondary,
      textAlign: "center" as const,
      marginBottom: theme.spacing.xxxl,
    },
    cardButton: {
      width: "100%" as const,
      maxWidth: 360,
      borderWidth: 2,
      borderColor: theme.colors.primary,
      backgroundColor: theme.colors.primary + "10",
      marginBottom: theme.spacing.lg,
    },
    cardTitle: {
      ...theme.type.h3,
      fontFamily: theme.type.h3.fontFamily,
      color: theme.colors.primary,
      marginBottom: theme.spacing.xxs,
    },
    cardText: {
      ...theme.type.body,
      fontFamily: theme.type.body.fontFamily,
      color: theme.colors.textSecondary,
      marginBottom: 2,
    },
    hint: {
      ...theme.type.caption,
      fontFamily: theme.type.caption.fontFamily,
      color: theme.colors.textMuted,
      marginTop: theme.spacing.xxl,
      textAlign: "center" as const,
    },
  };
}
