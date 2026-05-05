// apps/mobile/app/(auth)/email-verified.tsx
// Shown when user arrives from email verification link — session is already set

import React, { useEffect } from "react";
import { View, Text, ActivityIndicator } from "react-native";
import { SafeScreenView } from "@/components/SafeScreenView";
import { useRouter } from "expo-router";
import { supabase } from "@/lib/supabase";
import { Colors, Typography, FontFamily } from "@/constants/tokens";

export default function EmailVerified() {
  const router = useRouter();

  useEffect(() => {
    const goToOnboarding = async () => {
      const { data } = await supabase.auth.getUser();
      const accountType = data?.user?.user_metadata?.account_type as string | undefined;

      if (accountType === "business") {
        router.replace("/(onboarding-business)/get-started-business");
      } else {
        router.replace("/(onboarding-personal)/profile-core");
      }
    };

    const t = setTimeout(goToOnboarding, 1800);
    return () => clearTimeout(t);
  }, [router]);

  return (
    <SafeScreenView style={{ flex: 1, justifyContent: "center", alignItems: "center", padding: 24, backgroundColor: Colors.backgroundMuted }}>
      <Text style={{ fontFamily: FontFamily.heading, fontSize: 24, color: Colors.primaryViolet, textAlign: "center", marginBottom: 12 }}>
        ✅ Your email was verified!
      </Text>
      <Text style={{ ...Typography.body, color: Colors.textSecondary, textAlign: "center", marginBottom: 24 }}>
        Setting up your profile…
      </Text>
      <ActivityIndicator size="large" color={Colors.primaryViolet} />
    </SafeScreenView>
  );
}
