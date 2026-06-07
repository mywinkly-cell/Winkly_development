// apps/mobile/app/(auth)/welcome-back-setup.tsx
// Shown when returning user has verified session but incomplete onboarding

import React, { useRef, useEffect } from "react";
import { Text, TouchableOpacity, Animated, StyleSheet } from "react-native";
import { SafeScreenView } from "@/components/SafeScreenView";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { useAuth } from "@/providers";
import { Colors, Typography, Layout, FontFamily, Shadow } from "@/constants/tokens";

export default function WelcomeBackSetup() {
  const router = useRouter();
  const { accountType } = useAuth();
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
        <Text style={styles.title}>Welcome back</Text>
        <Text style={styles.subtitle}>
          Your profile is almost ready. Complete it to unlock the next step.
        </Text>

        <TouchableOpacity
          onPress={handleContinue}
          style={[styles.cta, { ...Shadow.button }]}
          activeOpacity={0.9}
        >
          <Text style={styles.ctaText}>Continue to setup</Text>
        </TouchableOpacity>
      </Animated.View>
    </SafeScreenView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.backgroundMuted },
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 32,
    paddingTop: 16,
  },
  title: {
    ...Typography.h1,
    fontFamily: FontFamily.headingBold,
    color: Colors.primaryViolet,
    textAlign: "center",
    marginBottom: 12,
  },
  subtitle: {
    ...Typography.body,
    color: Colors.gray700,
    textAlign: "center",
    marginBottom: 40,
    lineHeight: 24,
  },
  cta: {
    backgroundColor: Colors.primaryViolet,
    borderRadius: Layout.radii.control,
    paddingVertical: 16,
    paddingHorizontal: 32,
    minWidth: 200,
    alignItems: "center",
  },
  ctaText: {
    ...Typography.button,
    fontFamily: FontFamily.headingBold,
    color: Colors.accentYellow,
  },
});
