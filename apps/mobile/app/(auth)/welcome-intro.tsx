// apps/mobile/app/(auth)/welcome-intro.tsx
// WelcomeIntroScreen — Pre-login first-time intro
// Shown once on first app launch, before Sign in / Sign up

import React, { useRef, useEffect } from "react";
import { View, Text, TouchableOpacity, Animated, StyleSheet } from "react-native";
import { SafeScreenView } from "@/components/SafeScreenView";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useAppTheme, type AppTheme } from "@/constants/design-system";
import { setIntroSeen } from "@/lib/introFlags";
import { LanguageGlobeButton } from "@/components/i18n/LanguageGlobeButton";

export default function WelcomeIntro() {
  const { t } = useTranslation();
  const router = useRouter();
  const theme = useAppTheme();
  const styles = createStyles(theme);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideY = useRef(new Animated.Value(20)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 480,
        useNativeDriver: true,
      }),
      Animated.timing(slideY, {
        toValue: 0,
        duration: 480,
        useNativeDriver: true,
      }),
    ]).start();
  }, [fadeAnim, slideY]);

  const handleContinue = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await setIntroSeen();
    router.replace("/(auth)/terms-cookies");
  };

  return (
    <SafeScreenView style={styles.safe}>
      <Animated.View
        style={[
          styles.container,
          {
            opacity: fadeAnim,
            transform: [{ translateY: slideY }],
          },
        ]}
      >
        <View style={styles.content}>
          <Text style={styles.title}>{t("onboarding.welcomeIntro.title")}</Text>
          <Text style={styles.subtitle}>{t("onboarding.welcomeIntro.subtitle")}</Text>

          <View style={styles.section}>
            <View style={styles.iconWrap}>
              <Ionicons name="heart" size={24} color={theme.colors.primary} />
            </View>
            <View style={styles.sectionText}>
              <Text style={styles.sectionTitle}>{t("onboarding.welcomeIntro.personalTitle")}</Text>
              <Text style={styles.sectionBody}>{t("onboarding.welcomeIntro.personalBody")}</Text>
            </View>
          </View>

          <View style={styles.section}>
            <View style={styles.iconWrap}>
              <Ionicons name="briefcase" size={24} color={theme.colors.primary} />
            </View>
            <View style={styles.sectionText}>
              <Text style={styles.sectionTitle}>{t("onboarding.welcomeIntro.businessTitle")}</Text>
              <Text style={styles.sectionBody}>{t("onboarding.welcomeIntro.businessBody")}</Text>
            </View>
          </View>

          <View style={styles.section}>
            <View style={styles.iconWrap}>
              <Ionicons name="calendar" size={24} color={theme.colors.primary} />
            </View>
            <View style={styles.sectionText}>
              <Text style={styles.sectionTitle}>{t("onboarding.welcomeIntro.eventsTitle")}</Text>
              <Text style={styles.sectionBody}>{t("onboarding.welcomeIntro.eventsBody")}</Text>
            </View>
          </View>
        </View>

        <View style={styles.footer}>
          <TouchableOpacity
            onPress={handleContinue}
            style={styles.cta}
            activeOpacity={0.9}
          >
            <Text style={styles.ctaText}>{t("onboarding.welcomeIntro.continue")}</Text>
          </TouchableOpacity>
          <LanguageGlobeButton />
        </View>
      </Animated.View>
    </SafeScreenView>
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: theme.colors.backgroundMuted },
    container: {
      flex: 1,
      paddingHorizontal: 24,
      paddingTop: 16,
      paddingBottom: 24,
      justifyContent: "space-between",
    },
    content: { flex: 1 },
    title: {
      fontFamily: theme.type.h1.fontFamily,
      fontSize: 28,
      lineHeight: 36,
      color: theme.colors.textPrimary,
      marginBottom: 16,
    },
    subtitle: {
      ...theme.type.body,
      color: theme.colors.textSecondary,
      lineHeight: 24,
      marginBottom: 28,
    },
    section: {
      flexDirection: "row",
      alignItems: "flex-start",
      marginBottom: 20,
    },
    iconWrap: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: theme.colors.primary + "14",
      alignItems: "center",
      justifyContent: "center",
      marginRight: 14,
    },
    sectionText: { flex: 1 },
    sectionTitle: {
      fontFamily: theme.type.h1.fontFamily,
      fontSize: 16,
      color: theme.colors.textPrimary,
      marginBottom: 4,
    },
    sectionBody: {
      ...theme.type.body,
      fontSize: 14,
      color: theme.colors.textSecondary,
      lineHeight: 20,
    },
    footer: {
      paddingTop: 16,
      alignItems: "center",
      gap: 16,
    },
    cta: {
      width: "100%",
      backgroundColor: theme.colors.primary,
      borderRadius: theme.radii.md,
      paddingVertical: 16,
      alignItems: "center",
      justifyContent: "center",
      minHeight: 52,
      ...theme.elevation(2),
    },
    ctaText: {
      ...theme.type.button,
      color: theme.colors.onPrimary,
      fontFamily: theme.type.button.fontFamily,
    },
  });
}
