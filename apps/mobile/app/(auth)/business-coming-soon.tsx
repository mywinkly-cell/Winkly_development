// apps/mobile/app/(auth)/business-coming-soon.tsx
// Landing screen for existing business accounts while BUSINESS_ACCOUNTS_ENABLED is off.
// Read-only: their account and business_profiles data are left untouched.

import React, { useState } from "react";
import { Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useAppTheme } from "@/constants/design-system";
import { Card, PrimaryButton, Screen } from "@/components/ds";
import { useAuth } from "@/providers/AuthProvider";

export default function BusinessComingSoon() {
  const router = useRouter();
  const { t } = useTranslation();
  const theme = useAppTheme();
  const { signOut } = useAuth();
  const [signingOut, setSigningOut] = useState(false);

  const onSignOut = async () => {
    setSigningOut(true);
    try {
      await signOut();
      router.replace("/(auth)/signin");
    } finally {
      setSigningOut(false);
    }
  };

  return (
    <Screen scroll={false} edges={["top", "bottom", "left", "right"]} muted>
      <View testID="business-coming-soon" style={{ flex: 1, justifyContent: "center" }}>
        <Card padding="xl">
          <View style={{ alignItems: "center", marginBottom: theme.spacing.lg }}>
            <Ionicons name="briefcase-outline" size={theme.spacing.huge} color={theme.modeAccent("business").primary} />
          </View>
          <Text
            accessibilityRole="header"
            style={[theme.type.h2, { color: theme.colors.textPrimary, fontFamily: theme.type.h2.fontFamily, textAlign: "center" }]}
          >
            {t("businessAccount.comingSoonTitle")}
          </Text>
          <Text
            style={[
              theme.type.body,
              {
                color: theme.colors.textSecondary,
                fontFamily: theme.type.body.fontFamily,
                textAlign: "center",
                marginTop: theme.spacing.sm,
                marginBottom: theme.spacing.xxl,
              },
            ]}
          >
            {t("businessAccount.comingSoonBody")}
          </Text>
          <PrimaryButton title={t("auth.signOut")} onPress={() => void onSignOut()} loading={signingOut} disabled={signingOut} />
        </Card>
      </View>
    </Screen>
  );
}
