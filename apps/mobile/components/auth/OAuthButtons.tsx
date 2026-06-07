// components/auth/OAuthButtons.tsx
// Google + Apple sign-in buttons (Supabase OAuth).

import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  StyleSheet,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import * as Haptics from "expo-haptics";
import { Colors, Typography, Layout } from "@/constants/tokens";
import {
  isAppleSignInConfigured,
  signInWithAppleOAuth,
  signInWithGoogleOAuth,
} from "@/lib/auth/oauth";
import { routeAfterAuthentication } from "@/lib/auth/postAuthRouting";
import { markHasAccount, recordLastActivity } from "@/lib/lastActivity";
import { trackAccountCreated } from "@/lib/analytics/events";
import { supabase } from "@/lib/supabase";

type OAuthButtonsProps = {
  /** Sign-up passes account type into user metadata for new OAuth users. */
  accountType?: "personal" | "business";
  /** Sign-up requires 18+ confirmation before OAuth. */
  requireAdult?: boolean;
  isAdult?: boolean;
  disabled?: boolean;
};

export function OAuthButtons({
  accountType,
  requireAdult = false,
  isAdult = true,
  disabled = false,
}: OAuthButtonsProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const [loadingProvider, setLoadingProvider] = useState<"google" | "apple" | null>(null);
  const [showApple, setShowApple] = useState(false);

  useEffect(() => {
    void isAppleSignInConfigured().then(setShowApple);
  }, []);

  const metadata = accountType != null ? { account_type: accountType } : undefined;

  const onOAuth = async (provider: "google" | "apple") => {
    if (disabled || loadingProvider) return;

    if (requireAdult && !isAdult) {
      Alert.alert(t("auth.confirm18"), t("auth.confirm18Message"));
      return;
    }

    setLoadingProvider(provider);
    try {
      const { data: beforeUser } = await supabase.auth.getUser();
      const hadAccount = !!beforeUser?.user?.id;

      const result =
        provider === "google"
          ? await signInWithGoogleOAuth(metadata)
          : await signInWithAppleOAuth(metadata);

      if (!result.ok) {
        if (result.reason === "cancelled") return;
        if (result.reason === "not_configured") {
          Alert.alert(t("auth.oauthNotConfigured"), t("auth.oauthNotConfiguredHint"));
          return;
        }
        Alert.alert(t("common.error"), result.message ?? t("auth.oauthFailed"));
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        return;
      }

      if (accountType) {
        const { data: afterUser } = await supabase.auth.getUser();
        if (afterUser?.user && !afterUser.user.user_metadata?.account_type) {
          await supabase.auth.updateUser({ data: { account_type: accountType } });
        }
      }

      await markHasAccount();
      await recordLastActivity();
      if (accountType && !hadAccount) {
        trackAccountCreated({ account_type: accountType, method: provider });
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await routeAfterAuthentication(router);
    } catch (err: unknown) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      const message = err instanceof Error ? err.message : t("auth.oauthFailed");
      Alert.alert(t("common.error"), message);
    } finally {
      setLoadingProvider(null);
    }
  };

  const busy = loadingProvider != null || disabled;
  const showGoogle = Platform.OS === "android" || Platform.OS === "ios";

  if (!showGoogle && !showApple) return null;

  return (
    <View style={styles.wrap}>
      <Text style={styles.dividerLabel}>{t("auth.orContinueWith")}</Text>

      {showGoogle ? (
        <TouchableOpacity
          onPress={() => void onOAuth("google")}
          disabled={busy}
          activeOpacity={0.85}
          style={[styles.oauthBtn, busy && styles.oauthBtnDisabled]}
          accessibilityLabel={t("auth.continueWithGoogle")}
        >
          {loadingProvider === "google" ? (
            <ActivityIndicator color={Colors.textPrimary} />
          ) : (
            <>
              <Ionicons name="logo-google" size={20} color="#4285F4" />
              <Text style={styles.oauthText}>{t("auth.continueWithGoogle")}</Text>
            </>
          )}
        </TouchableOpacity>
      ) : null}

      {showApple ? (
        <TouchableOpacity
          onPress={() => void onOAuth("apple")}
          disabled={busy}
          activeOpacity={0.85}
          style={[styles.oauthBtn, styles.oauthBtnApple, busy && styles.oauthBtnDisabled]}
          accessibilityLabel={t("auth.continueWithApple")}
        >
          {loadingProvider === "apple" ? (
            <ActivityIndicator color={Colors.white} />
          ) : (
            <>
              <Ionicons name="logo-apple" size={20} color={Colors.white} />
              <Text style={[styles.oauthText, styles.oauthTextApple]}>{t("auth.continueWithApple")}</Text>
            </>
          )}
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 8, marginBottom: 8 },
  dividerLabel: {
    ...Typography.caption,
    color: Colors.gray600,
    textAlign: "center",
    marginBottom: 12,
  },
  oauthBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    borderWidth: 2,
    borderColor: Colors.gray200,
    borderRadius: Layout.radii.control,
    paddingVertical: 14,
    marginBottom: 10,
    minHeight: Layout.touchTargetMin,
    backgroundColor: Colors.white,
  },
  oauthBtnApple: {
    backgroundColor: Colors.textPrimary,
    borderColor: Colors.textPrimary,
  },
  oauthBtnDisabled: { opacity: 0.65 },
  oauthText: {
    ...Typography.button,
    color: Colors.textPrimary,
    fontWeight: "600",
  },
  oauthTextApple: { color: Colors.white },
});
