// ────────────────────────────────────────────────
// Winkly Onboarding: Welcome (Personal)
// v7.0 – November 2025
// © Winkly Technologies UG (haftungsbeschränkt)
// Purpose: Final onboarding screen — congratulations + CTA to start using app.
// ────────────────────────────────────────────────

import React, { useState, useEffect } from "react";
import { View, Text, TouchableOpacity, Image, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { Colors, Typography, Layout } from "@/constants/tokens";
import { supabase } from "@/lib/supabase";

export default function WelcomePersonal() {
  const router = useRouter();
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
        backgroundColor: Colors.backgroundLight,
        alignItems: "center",
        justifyContent: "center",
        padding: 28,
      }}
    >
      {/* Logo */}
      <Image
        source={require("../../assets/icons/winkly-logo.png")}
        style={{ width: 140, height: 50, marginBottom: 30 }}
        resizeMode="contain"
      />

      {/* Emoji illustration */}
      <Text style={{ fontSize: 64, marginBottom: 12 }}>😉</Text>

      <Text
        style={{
          ...Typography.h2,
          color: Colors.textPrimary,
          textAlign: "center",
          marginBottom: 8,
        }}
      >
        Welcome {firstName ? firstName : "to Winkly"}!
      </Text>

      <Text
        style={{
          ...Typography.body,
          color: Colors.gray700,
          textAlign: "center",
          marginBottom: 32,
          lineHeight: 24,
        }}
      >
        Your profile is set, and you’re ready to start connecting.{"\n"}
        Switch modes anytime — Romance, Friends, Business, or Events.
      </Text>

      {/* Animation / illustration */}
      <Image
        source={require("../../assets/images/onboarding/welcome-illustration.png")}
        style={{ width: 280, height: 180, marginBottom: 48 }}
        resizeMode="contain"
      />

      {/* CTA */}
      <TouchableOpacity
        onPress={() => router.replace("/(modes)/romance/home")}
        style={{
          backgroundColor: Colors.primaryViolet,
          borderRadius: Layout.radii.card,
          paddingVertical: 16,
          width: "85%",
          alignItems: "center",
        }}
      >
        <Text style={{ ...Typography.button, color: Colors.accentYellow }}>
          Start exploring
        </Text>
      </TouchableOpacity>

      {/* Option: Go back to Mode Selection */}
      <TouchableOpacity
        onPress={() => router.push("/(onboarding-personal)/mode-selection")}
        style={{ marginTop: 18 }}
      >
        <Text
          style={{
            ...Typography.caption,
            color: Colors.primaryViolet,
            textDecorationLine: "underline",
          }}
        >
          Change my mode
        </Text>
      </TouchableOpacity>

      {!firstName && (
        <ActivityIndicator
          style={{ position: "absolute", top: 40, right: 40 }}
          color={Colors.primaryViolet}
        />
      )}
    </View>
  );
}
