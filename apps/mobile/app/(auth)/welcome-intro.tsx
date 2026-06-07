// apps/mobile/app/(auth)/welcome-intro.tsx
// WelcomeIntroScreen — Pre-login first-time intro
// Shown once on first app launch, before Sign in / Sign up

import React, { useRef, useEffect } from "react";
import { View, Text, TouchableOpacity, Animated, StyleSheet } from "react-native";
import { SafeScreenView } from "@/components/SafeScreenView";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Colors, Typography, Layout, FontFamily, Shadow } from "@/constants/tokens";
import { setIntroSeen } from "@/lib/introFlags";

export default function WelcomeIntro() {
  const router = useRouter();
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
          <Text style={styles.title}>Welcome to Winkly</Text>
          <Text style={styles.subtitle}>
            Winkly is an AI-powered networking app for intentional connections across personal life, professional goals, and real-world experiences.
          </Text>

          <View style={styles.section}>
            <View style={styles.iconWrap}>
              <Ionicons name="heart" size={24} color={Colors.primaryViolet} />
            </View>
            <View style={styles.sectionText}>
              <Text style={styles.sectionTitle}>Personal</Text>
              <Text style={styles.sectionBody}>
                Romance, friends, lifestyle — no mixed signals.
              </Text>
            </View>
          </View>

          <View style={styles.section}>
            <View style={styles.iconWrap}>
              <Ionicons name="briefcase" size={24} color={Colors.primaryViolet} />
            </View>
            <View style={styles.sectionText}>
              <Text style={styles.sectionTitle}>Business</Text>
              <Text style={styles.sectionBody}>
                Professional networking, collaboration, opportunities.
              </Text>
            </View>
          </View>

          <View style={styles.section}>
            <View style={styles.iconWrap}>
              <Ionicons name="calendar" size={24} color={Colors.primaryViolet} />
            </View>
            <View style={styles.sectionText}>
              <Text style={styles.sectionTitle}>Events & Planner</Text>
              <Text style={styles.sectionBody}>
                Discover events, plan meetups, move from online to real life with an AI planner.
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.footer}>
          <TouchableOpacity
            onPress={handleContinue}
            style={styles.cta}
            activeOpacity={0.9}
          >
            <Text style={styles.ctaText}>Continue</Text>
          </TouchableOpacity>
        </View>
      </Animated.View>
    </SafeScreenView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.backgroundMuted },
  container: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 24,
    justifyContent: "space-between",
  },
  content: { flex: 1 },
  title: {
    fontFamily: FontFamily.headingBold,
    fontSize: 28,
    lineHeight: 36,
    color: Colors.textPrimary,
    marginBottom: 16,
  },
  subtitle: {
    ...Typography.body,
    color: Colors.gray600,
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
    backgroundColor: "#F5F1FF",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 14,
  },
  sectionText: { flex: 1 },
  sectionTitle: {
    fontFamily: FontFamily.headingBold,
    fontSize: 16,
    color: Colors.textPrimary,
    marginBottom: 4,
  },
  sectionBody: {
    ...Typography.body,
    fontSize: 14,
    color: Colors.gray600,
    lineHeight: 20,
  },
  footer: { paddingTop: 16 },
  cta: {
    backgroundColor: Colors.primaryViolet,
    borderRadius: Layout.radii.control,
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 52,
    ...Shadow.button,
  },
  ctaText: {
    ...Typography.button,
    color: Colors.accentYellow,
    fontFamily: FontFamily.headingBold,
  },
});
