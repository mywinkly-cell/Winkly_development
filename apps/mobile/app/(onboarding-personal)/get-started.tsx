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
import { useTranslation } from "react-i18next";
import { Colors, Typography, Layout, FontFamily, Shadow } from "@/constants/tokens";
import { getTermsAndCookiesAccepted } from "@/lib/legalFlags";

export default function GetStarted() {
  const { t } = useTranslation();
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

      <Text style={{ ...Typography.h1, color: Colors.primaryViolet, textAlign: "center", marginBottom: 12, fontFamily: FontFamily.headingBold }}>
        {t("onboarding.getStarted.title")}
      </Text>

      <Text
        style={{
          ...Typography.body,
          color: Colors.gray700,
          textAlign: "center",
          marginBottom: 32,
        }}
      >
        {t("onboarding.getStarted.subtitle")}
      </Text>

      <TouchableOpacity
        onPress={() => { Haptics.selectionAsync(); router.push("/(auth)/signup?accountType=personal"); }}
        style={[cardButton, { backgroundColor: "#F5F1FF", borderColor: Colors.primaryViolet }]}
        activeOpacity={0.9}
      >
        <Text style={[cardTitle, { color: Colors.primaryViolet }]}>{t("onboarding.getStarted.personalTitle")}</Text>
        <Text style={[cardText, { color: Colors.textPrimary }]}>{t("onboarding.getStarted.personalLine1")}</Text>
        <Text style={[cardText, { color: Colors.textPrimary }]}>{t("onboarding.getStarted.personalLine2")}</Text>
      </TouchableOpacity>

      <TouchableOpacity
        onPress={() => { Haptics.selectionAsync(); router.push("/(auth)/signup?accountType=business"); }}
        style={[cardButton, { backgroundColor: "#F5F1FF", borderColor: Colors.primaryViolet }]}
        activeOpacity={0.9}
      >
        <Text style={[cardTitle, { color: Colors.primaryViolet }]}>{t("onboarding.getStarted.businessTitle")}</Text>
        <Text style={[cardText, { color: Colors.textPrimary }]}>{t("onboarding.getStarted.businessLine1")}</Text>
        <Text style={[cardText, { color: Colors.textPrimary }]}>{t("onboarding.getStarted.businessLine2")}</Text>
      </TouchableOpacity>

      <TouchableOpacity onPress={() => { Haptics.selectionAsync(); router.push("/(auth)/signin"); }} style={{ marginTop: 20 }}>
        <Text style={{ ...Typography.body, color: Colors.primaryViolet, fontWeight: "600" }}>
          {t("auth.hasAccount")} {t("auth.signin")}
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
        {t("onboarding.getStarted.switchHint")}
      </Text>
      </Animated.View>
    </ScrollView>
    </SafeScreenView>
  );
}

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
  fontFamily: FontFamily.headingBold,
  color: Colors.textPrimary,
  marginBottom: 4,
};

const cardText = {
  ...Typography.body,
  color: Colors.gray700,
  marginBottom: 2,
};
