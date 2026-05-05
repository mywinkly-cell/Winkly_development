// ────────────────────────────────────────────────
// Winkly Onboarding – Get Started Screen
// v7.0 – November 2025
// © Winkly Technologies UG (haftungsbeschränkt)
// Maintainer: Kateryna Shyshkalova
// Purpose: Let user choose account type (Personal / Business)
// and start onboarding flow
// ────────────────────────────────────────────────

import React, { useEffect, useRef } from "react";
import { Text, Image, TouchableOpacity, ScrollView, Animated, type ViewStyle } from "react-native";
import { SafeScreenView } from "@/components/SafeScreenView";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { Colors, Typography, Layout, FontFamily, Shadow } from "@/constants/tokens";
import { getTermsAndCookiesAccepted } from "@/lib/legalFlags";

export default function GetStarted() {
  const router = useRouter();
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
    <SafeScreenView style={{ flex: 1, backgroundColor: Colors.backgroundMuted }}>
    <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: "center",
          alignItems: "center",
          paddingHorizontal: 36,
          paddingVertical: 28,
        }}
      showsVerticalScrollIndicator={false}
    >
      <Animated.View style={{ alignItems: "center", opacity: fadeAnim }}>
      <Image
        source={require("../../assets/icons/winkly-emoji-shadow.png")}
        resizeMode="contain"
        style={{ width: 140, height: 140, marginBottom: 24 }}
      />

      <Text style={{ ...Typography.h1, color: Colors.primaryViolet, textAlign: "center", marginBottom: 12, fontFamily: FontFamily.heading }}>
        Welcome to Winkly 💫
      </Text>

      <Text
        style={{
          ...Typography.body,
          color: Colors.gray700,
          textAlign: "center",
          marginBottom: 32,
        }}
      >
        Every story starts with a wink 😉  
        Choose how you’d like to begin your journey.
      </Text>

      {/* Personal Account Option — Winkly violet frame like Business */}
      <TouchableOpacity
        onPress={() => { Haptics.selectionAsync(); router.push("/(auth)/signup?accountType=personal"); }}
        style={[cardButton, { backgroundColor: "#F5F1FF", borderColor: Colors.primaryViolet }]}
        activeOpacity={0.9}
      >
        <Text style={[cardTitle, { color: Colors.primaryViolet }]}>✨ Personal Account</Text>
        <Text style={[cardText, { color: Colors.textPrimary }]}>Romance, friends, lifestyle & events.</Text>
        <Text style={[cardText, { color: Colors.textPrimary }]}>Build meaningful connections and plan real-life meetups.</Text>
      </TouchableOpacity>

      {/* Business Account Option */}
      <TouchableOpacity
        onPress={() => { Haptics.selectionAsync(); router.push("/(auth)/signup?accountType=business"); }}
        style={[cardButton, { backgroundColor: "#F5F1FF", borderColor: Colors.primaryViolet }]}
        activeOpacity={0.9}
      >
        <Text style={[cardTitle, { color: Colors.primaryViolet }]}>💼 Business Account</Text>
        <Text style={[cardText, { color: Colors.textPrimary }]}>Professional connections, networking & opportunities.</Text>
        <Text style={[cardText, { color: Colors.textPrimary }]}>Promote your work, organize events, and connect with partners or clients.</Text>
      </TouchableOpacity>

      <TouchableOpacity onPress={() => { Haptics.selectionAsync(); router.push("/(auth)/signin"); }} style={{ marginTop: 20 }}>
        <Text style={{ ...Typography.body, color: Colors.primaryViolet, fontWeight: "600" }}>
          Already have an account? Sign in
        </Text>
      </TouchableOpacity>

      <Text
        style={{
          ...Typography.caption,
          color: Colors.gray500,
          marginTop: 28,
          textAlign: "center",
        }}
      >
        You can always switch account type in the settings.
      </Text>
      </Animated.View>
    </ScrollView>
    </SafeScreenView>
  );
}

// ────────────────────────────────────────────────
// Styles
// ────────────────────────────────────────────────
const cardButton: ViewStyle = {
  width: "100%",
  maxWidth: 360,
  borderWidth: 2,
  borderRadius: Layout.radii.card,
  paddingVertical: 20,
  paddingHorizontal: 20,
  marginBottom: 18,
  ...Shadow.card,
};

const cardTitle = {
  ...Typography.h3,
  fontFamily: FontFamily.heading,
  color: Colors.textPrimary,
  marginBottom: 4,
};

const cardText = {
  ...Typography.body,
  color: Colors.gray700,
  marginBottom: 2,
};
