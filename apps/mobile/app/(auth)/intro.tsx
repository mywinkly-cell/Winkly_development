// apps/mobile/app/(auth)/intro.tsx
// Winkly Intro — Premium, modern, professional

import React, { useRef, useEffect } from "react";
import { View, Text, Image, TouchableOpacity, StyleSheet, Animated } from "react-native";
import { SafeScreenView } from "@/components/SafeScreenView";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { Colors, Typography, Layout, FontFamily, Shadow } from "@/constants/tokens";

export default function Intro() {
  const router = useRouter();
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
            accessibilityLabel="Winkly logo"
          />

          <Text style={styles.title}>Because every story{"\n"}begins with a wink.</Text>

          <Text style={styles.subtitle}>
            Dating, friends, business & events — in one intelligent connection space.
          </Text>

          <TouchableOpacity
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push("/(auth)/signup");
            }}
            style={styles.primaryBtn}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Create account"
          >
            <Text style={styles.primaryText}>Create account</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push("/(auth)/signin");
            }}
            style={styles.secondaryBtn}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Sign in"
          >
            <Text style={styles.secondaryText}>Sign in</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.legal}>
          By continuing, you agree to Winkly&apos;s <Text style={styles.link}>Terms</Text> & <Text style={styles.link}>Privacy Policy</Text>.
        </Text>
      </Animated.View>
    </SafeScreenView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.backgroundMuted },
  screen: {
    flex: 1,
    backgroundColor: Colors.backgroundMuted,
    paddingHorizontal: Layout.spacing.xl,
    paddingTop: Layout.spacing.xxl,
    paddingBottom: Layout.spacing.xl,
    justifyContent: "space-between",
  },
  content: { alignItems: "center", justifyContent: "center", flex: 1 },
  wordmark: { width: 220, height: 80, marginBottom: 32 },
  title: {
    fontFamily: FontFamily.headingBold,
    fontSize: 26,
    lineHeight: 36,
    color: Colors.textPrimary,
    textAlign: "center",
    marginBottom: 16,
    letterSpacing: 0.3,
  },
  subtitle: {
    ...Typography.body,
    color: Colors.gray600,
    textAlign: "center",
    marginBottom: 32,
    maxWidth: 340,
    lineHeight: 24,
  },
  primaryBtn: {
    width: "100%",
    maxWidth: 360,
    backgroundColor: Colors.primaryViolet,
    borderRadius: Layout.radii.control,
    paddingVertical: 16,
    alignItems: "center",
    marginBottom: 12,
    minHeight: Layout.touchTargetMin,
    justifyContent: "center",
    ...Shadow.button,
  },
  primaryText: { ...Typography.button, color: Colors.accentYellow, fontFamily: FontFamily.headingBold },
  secondaryBtn: {
    width: "100%",
    maxWidth: 360,
    borderRadius: Layout.radii.control,
    paddingVertical: 14,
    alignItems: "center",
    borderWidth: 2,
    borderColor: Colors.gray200,
    backgroundColor: Colors.white,
    minHeight: 48,
    justifyContent: "center",
  },
  secondaryText: { ...Typography.button, color: Colors.primaryViolet, fontFamily: FontFamily.headingBold },
  legal: { ...Typography.caption, color: Colors.gray600, textAlign: "center", paddingHorizontal: 16, lineHeight: 20 },
  link: { color: Colors.primaryViolet, fontWeight: "600" },
});
