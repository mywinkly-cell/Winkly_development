// apps/mobile/app/(auth)/email-verified.tsx
// Shown when user arrives from email verification link — session is already set

import React, { useEffect } from "react";
import { Text, ActivityIndicator } from "react-native";
import { SafeScreenView } from "@/components/SafeScreenView";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { supabase } from "@/lib/supabase";
import { Colors, Typography, FontFamily } from "@/constants/tokens";

export default function EmailVerified() {
  const router = useRouter();
  const { t } = useTranslation();

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

    const timer = setTimeout(goToOnboarding, 1800);
    return () => clearTimeout(timer);
  }, [router]);

  return (
    <SafeScreenView style={{ flex: 1, justifyContent: "center", alignItems: "center", padding: 24, backgroundColor: Colors.backgroundMuted }}>
      <Text style={{ fontFamily: FontFamily.headingBold, fontSize: 24, color: Colors.primaryViolet, textAlign: "center", marginBottom: 12 }}>
        ✅ {t("auth.emailVerified.title")}
      </Text>
      <Text style={{ ...Typography.body, color: Colors.textSecondary, textAlign: "center", marginBottom: 24 }}>
        {t("auth.emailVerified.subtitle")}
      </Text>
      <ActivityIndicator size="large" color={Colors.primaryViolet} />
    </SafeScreenView>
  );
}
