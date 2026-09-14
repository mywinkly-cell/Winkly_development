// apps/mobile/app/(auth)/welcome-back-setup.tsx
// Shown when returning user has verified session but incomplete onboarding

import React, { useRef, useEffect } from "react";
import { Text, TouchableOpacity, Animated, StyleSheet } from "react-native";
import { SafeScreenView } from "@/components/SafeScreenView";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/providers";
import { useAppTheme, type AppTheme } from "@/constants/design-system";

export default function WelcomeBackSetup() {
  const router = useRouter();
  const { t } = useTranslation();
  const { accountType } = useAuth();
  const theme = useAppTheme();
  const styles = createStyles(theme);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideY = useRef(new Animated.Value(16)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }),
      Animated.timing(slideY, { toValue: 0, duration: 400, useNativeDriver: true }),
    ]).start();
  }, [fadeAnim, slideY]);

  const handleContinue = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (accountType === "business") {
      router.replace("/(onboarding-business)/get-started-business");
    } else {
      router.replace("/(onboarding-personal)/profile-core");
    }
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
        <Text style={styles.title}>{t("auth.welcomeBack")}</Text>
        <Text style={styles.subtitle}>{t("auth.welcomeBack.subtitle")}</Text>

        <TouchableOpacity
          onPress={handleContinue}
          style={styles.cta}
          activeOpacity={0.9}
        >
          <Text style={styles.ctaText}>{t("auth.welcomeBack.continue")}</Text>
        </TouchableOpacity>
      </Animated.View>
    </SafeScreenView>
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: theme.colors.backgroundMuted },
    container: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      paddingHorizontal: 32,
      paddingTop: 16,
    },
    title: {
      ...theme.type.h1,
      fontFamily: theme.type.h1.fontFamily,
      color: theme.colors.primary,
      textAlign: "center",
      marginBottom: 12,
    },
    subtitle: {
      ...theme.type.body,
      color: theme.colors.textSecondary,
      textAlign: "center",
      marginBottom: 40,
      lineHeight: 24,
    },
    cta: {
      backgroundColor: theme.colors.primary,
      borderRadius: theme.radii.md,
      paddingVertical: 16,
      paddingHorizontal: 32,
      minWidth: 200,
      alignItems: "center",
      ...theme.elevation(2),
    },
    ctaText: {
      ...theme.type.button,
      fontFamily: theme.type.button.fontFamily,
      color: theme.colors.onPrimary,
    },
  });
}
