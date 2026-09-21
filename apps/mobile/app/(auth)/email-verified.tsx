// apps/mobile/app/(auth)/email-verified.tsx
// Shown when user arrives from email verification link — session is already set

import React, { useEffect } from "react";
import { Text, ActivityIndicator } from "react-native";
import { SafeScreenView } from "@/components/SafeScreenView";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { supabase } from "@/lib/supabase";
import { useAppTheme } from "@/constants/design-system";
import { isAccountTypeParked } from "@/lib/modes/availability";
import { BUSINESS_COMING_SOON_ROUTE } from "@/lib/routing/guards";

export default function EmailVerified() {
  const router = useRouter();
  const { t } = useTranslation();
  const theme = useAppTheme();

  useEffect(() => {
    const goToOnboarding = async () => {
      const { data } = await supabase.auth.getUser();
      const accountType = data?.user?.user_metadata?.account_type as string | undefined;

      if (isAccountTypeParked(accountType)) {
        router.replace(BUSINESS_COMING_SOON_ROUTE as never);
      } else if (accountType === "business") {
        router.replace("/(onboarding-business)/get-started-business");
      } else {
        router.replace("/(onboarding-personal)/profile-core");
      }
    };

    const timer = setTimeout(goToOnboarding, 1800);
    return () => clearTimeout(timer);
  }, [router]);

  return (
    <SafeScreenView style={{ flex: 1, justifyContent: "center", alignItems: "center", padding: 24, backgroundColor: theme.colors.backgroundMuted }}>
      <Text style={{ fontFamily: theme.type.h1.fontFamily, fontSize: 24, color: theme.colors.primary, textAlign: "center", marginBottom: 12 }}>
        ✅ {t("auth.emailVerified.title")}
      </Text>
      <Text style={{ ...theme.type.body, color: theme.colors.textSecondary, textAlign: "center", marginBottom: 24 }}>
        {t("auth.emailVerified.subtitle")}
      </Text>
      <ActivityIndicator size="large" color={theme.colors.primary} />
    </SafeScreenView>
  );
}
