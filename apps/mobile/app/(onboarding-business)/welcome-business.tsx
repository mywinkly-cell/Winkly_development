// ────────────────────────────────────────────────
// Winkly Onboarding: Welcome (Business)
// v7.0 – November 2025
// © Winkly Technologies UG (haftungsbeschränkt)
// Maintainer: Kateryna Shyshkalova
// Purpose: Final onboarding screen for Business Accounts
// ────────────────────────────────────────────────

import React, { useState, useEffect } from "react";
import { View, Text, TouchableOpacity, Image, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { useModeContext } from "@/providers";
import { Colors, Typography, Layout } from "@/constants/tokens";
import { supabase } from "@/lib/supabase";

export default function WelcomeBusiness() {
  useRouter(); // router available for future nav
  const { setActiveMode } = useModeContext();
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
        backgroundColor: Colors.backgroundLight,
        alignItems: "center",
        justifyContent: "center",
        padding: 28,
        paddingTop: 28 + 24,
      }}
    >
      {/* Logo */}
      <Image
        source={require("../../assets/icons/winkly-logo.png")}
        style={{ width: 160, height: 55, marginBottom: 32 }}
        resizeMode="contain"
      />

      {/* Illustration / Emoji */}
      <Image
        source={require("../../assets/icons/winkly-emoji-shadow.png")}
        style={{ width: 120, height: 120, marginBottom: 20 }}
        resizeMode="contain"
      />

      <Text
        style={{
          ...Typography.h2,
          color: Colors.textPrimary,
          textAlign: "center",
          marginBottom: 12,
        }}
      >
        Welcome {businessName ? businessName : "to Winkly Business"} 👋
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
        Your business profile is ready.{"\n"}
        Start networking, connecting, and creating events that make an impact.
      </Text>

      {/* Illustration */}
      <Image
        source={require("../../assets/images/onboarding/welcome-business-illustration.png")}
        style={{ width: 280, height: 180, marginBottom: 48 }}
        resizeMode="contain"
      />

      {/* CTA */}
      <TouchableOpacity
        onPress={() => setActiveMode("business")}
        style={{
          backgroundColor: Colors.primaryViolet,
          borderRadius: Layout.radii.card,
          paddingVertical: 16,
          width: "85%",
          alignItems: "center",
        }}
      >
        <Text style={{ ...Typography.button, color: Colors.accentYellow }}>
          Go to Business Mode
        </Text>
      </TouchableOpacity>

      {/* Option: Switch to Events */}
      <TouchableOpacity
        onPress={() => setActiveMode("events")}
        style={{ marginTop: 18 }}
      >
        <Text
          style={{
            ...Typography.caption,
            color: Colors.primaryViolet,
            textDecorationLine: "underline",
          }}
        >
          Explore Events
        </Text>
      </TouchableOpacity>

      {!businessName && (
        <ActivityIndicator
          style={{ position: "absolute", top: 40, right: 40 }}
          color={Colors.primaryViolet}
        />
      )}
    </View>
  );
}
