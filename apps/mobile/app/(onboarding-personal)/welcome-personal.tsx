// ────────────────────────────────────────────────
// Winkly Onboarding: Welcome (Personal)
// v7.0 – November 2025
// © Winkly Technologies UG (haftungsbeschränkt)
// Purpose: Final onboarding screen — congratulations + CTA to start using app.
// ────────────────────────────────────────────────

import React, { useState, useEffect } from "react";
import { View, Text, Image, ActivityIndicator } from "react-native";
import { useRouter, type Href } from "expo-router";
import { Routes } from "@/constants/routes";
import { PrimaryButton, TextButton } from "@/components/ds";
import { useAppTheme } from "@/constants/design-system";
import { supabase } from "@/lib/supabase";

export default function WelcomePersonal() {
  const router = useRouter();
  const theme = useAppTheme();
  const [firstName, setFirstName] = useState<string | null>(null);

  useEffect(() => {
    const loadName = async () => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) return;
      const { data } = await supabase
        .from("users")
        .select("first_name")
        .eq("id", userData.user.id)
        .single();
      if (data?.first_name) setFirstName(data.first_name);
    };
    loadName();
  }, []);

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: theme.colors.background,
        alignItems: "center",
        justifyContent: "center",
        padding: theme.spacing.xxl,
      }}
    >
      {/* Logo */}
      <Image
        source={require("../../assets/icons/winkly-logo.png")}
        style={{ width: 140, height: 50, marginBottom: theme.spacing.xxxl }}
        resizeMode="contain"
      />

      {/* Emoji illustration */}
      <Text style={{ fontSize: 64, marginBottom: theme.spacing.md }}>😉</Text>

      <Text
        style={{
          ...theme.type.h2,
          fontFamily: theme.type.h2.fontFamily,
          color: theme.colors.textPrimary,
          textAlign: "center",
          marginBottom: theme.spacing.sm,
        }}
      >
        Welcome {firstName ? firstName : "to Winkly"}!
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
        Your profile is set, and you&apos;re ready to start connecting.{"\n"}
        Switch modes anytime — Romance, Friends, Business, or Events.
      </Text>

      {/* Animation / illustration */}
      <Image
        source={require("../../assets/images/onboarding/welcome-illustration.png")}
        style={{ width: 280, height: 180, marginBottom: theme.spacing.massive }}
        resizeMode="contain"
      />

      {/* CTA */}
      <PrimaryButton
        title="Start exploring"
        onPress={() => router.replace("/(modes)/romance" as Href)}
        style={{ width: "85%" }}
      />

      {/* Option: Go back to Mode Selection */}
      <TextButton
        title="Change my mode"
        onPress={() => router.push(Routes.modeSelection)}
        style={{ marginTop: theme.spacing.md }}
        textStyle={{ textDecorationLine: "underline" }}
      />

      {!firstName && (
        <ActivityIndicator
          style={{ position: "absolute", top: 40, right: 40 }}
          color={theme.colors.primary}
        />
      )}
    </View>
  );
}
