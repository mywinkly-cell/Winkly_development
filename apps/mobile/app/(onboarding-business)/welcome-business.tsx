// ────────────────────────────────────────────────
// Winkly Onboarding: Welcome (Business)
// v7.0 – November 2025
// © Winkly Technologies UG (haftungsbeschränkt)
// Purpose: Final onboarding screen for Business Accounts
// ────────────────────────────────────────────────

import React, { useState, useEffect } from "react";
import { View, Text, Image, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { useModeContext } from "@/providers";
import { PrimaryButton, TextButton } from "@/components/ds";
import { useAppTheme } from "@/constants/design-system";
import { supabase } from "@/lib/supabase";

export default function WelcomeBusiness() {
  useRouter(); // router available for future nav
  const { setActiveMode } = useModeContext();
  const { t } = useTranslation();
  const theme = useAppTheme();
  const [businessName, setBusinessName] = useState<string | null>(null);

  useEffect(() => {
    const loadBusinessName = async () => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) return;

      const { data } = await supabase
        .from("business_profiles")
        .select("business_name, company_name")
        .or(`id.eq.${userData.user.id},user_id.eq.${userData.user.id}`)
        .limit(1)
        .maybeSingle();

      const name = (data as any)?.business_name ?? (data as any)?.company_name;
      if (name) setBusinessName(name);
    };

    loadBusinessName();
  }, []);

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: theme.colors.background,
        alignItems: "center",
        justifyContent: "center",
        padding: theme.spacing.xxl,
        paddingTop: theme.spacing.xxl + theme.spacing.xxl,
      }}
    >
      {/* Logo */}
      <Image
        source={require("../../assets/icons/winkly-logo.png")}
        style={{ width: 160, height: 55, marginBottom: theme.spacing.xxxl }}
        resizeMode="contain"
      />

      {/* Illustration / Emoji */}
      <Image
        source={require("../../assets/icons/winkly-emoji-shadow.png")}
        style={{ width: 120, height: 120, marginBottom: theme.spacing.xl }}
        resizeMode="contain"
      />

      <Text
        style={{
          ...theme.type.h2,
          fontFamily: theme.type.h2.fontFamily,
          color: theme.colors.textPrimary,
          textAlign: "center",
          marginBottom: theme.spacing.md,
        }}
      >
        {businessName
          ? t("onboarding.welcomeBusiness.titleNamed", { name: businessName })
          : t("onboarding.welcomeBusiness.title")}
      </Text>

      <Text
        style={{
          ...theme.type.body,
          fontFamily: theme.type.body.fontFamily,
          color: theme.colors.textSecondary,
          textAlign: "center",
          marginBottom: theme.spacing.xxxl,
        }}
      >
        {t("onboarding.welcomeBusiness.body")}
      </Text>

      {/* Illustration */}
      <Image
        source={require("../../assets/images/onboarding/welcome-business-illustration.png")}
        style={{ width: 280, height: 180, marginBottom: theme.spacing.massive }}
        resizeMode="contain"
      />

      {/* CTA */}
      <PrimaryButton
        title={t("onboarding.welcomeBusiness.cta")}
        onPress={() => setActiveMode("business")}
        style={{ width: "85%" }}
      />

      {/* Option: Switch to Events */}
      <TextButton
        title={t("onboarding.welcomeBusiness.exploreEvents")}
        onPress={() => setActiveMode("events")}
        style={{ marginTop: theme.spacing.md }}
        textStyle={{ textDecorationLine: "underline" }}
      />

      {!businessName && (
        <ActivityIndicator
          style={{ position: "absolute", top: 40, right: 40 }}
          color={theme.colors.primary}
        />
      )}
    </View>
  );
}
