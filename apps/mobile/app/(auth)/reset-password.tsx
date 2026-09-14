// ────────────────────────────────────────────────
// Winkly Password Reset Screen
// v7.0 – November 2025
// © Winkly Technologies UG (haftungsbeschränkt)
// Purpose: Allow user to request a password reset link
// via Supabase auth, consistent with onboarding design
// ────────────────────────────────────────────────

import React, { useState } from "react";
import {
  Text,
  TextInput,
  TouchableOpacity,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Image,
  ActivityIndicator,
} from "react-native";
import { SafeScreenView } from "@/components/SafeScreenView";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { supabase } from "@/lib/supabase";
import { useAppTheme } from "@/constants/design-system";
import { getEmailRedirectTo } from "@/lib/authRedirectUrl";

export default function ResetPassword() {
  const router = useRouter();
  const { t } = useTranslation();
  const theme = useAppTheme();
  const [email, setEmail] = useState("");
  const [sentToEmail, setSentToEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const inputStyle = {
    borderWidth: 2,
    borderColor: theme.colors.border,
    borderRadius: theme.radii.md,
    padding: 16,
    marginBottom: 12,
    width: "100%" as const,
    maxWidth: 360,
    backgroundColor: theme.colors.surface,
    fontSize: 16,
    color: theme.colors.textPrimary,
  };

  // ────────────────────────────────────────────────
  //  Handle Reset
  // ────────────────────────────────────────────────
  const handleReset = async () => {
    const cleanEmail = email.trim();
    if (!cleanEmail) {
      Alert.alert(t("auth.incomplete"), t("auth.reset.enterEmail"));
      return;
    }

    try {
      setLoading(true);
      const redirectTo = await getEmailRedirectTo();
      const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
        redirectTo,
      });
      if (error) throw error;

      setSentToEmail(cleanEmail);
      setSent(true);
    } catch (err: any) {
      Alert.alert(t("common.error"), err.message ?? t("auth.reset.sendFailed"));
    } finally {
      setLoading(false);
    }
  };

  // ────────────────────────────────────────────────
  //  UI
  // ────────────────────────────────────────────────
  return (
    <SafeScreenView style={{ flex: 1, backgroundColor: theme.colors.backgroundMuted }}>
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: theme.colors.backgroundMuted }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: "center",
          alignItems: "center",
          padding: 24,
          paddingTop: 24 + theme.spacing.md,
        }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Logo */}
        <Image
          source={require("../../assets/icons/winkly-logo.png")}
          resizeMode="contain"
          style={{ width: 180, height: 60, marginBottom: 30 }}
        />

        {!sent ? (
          <>
            <Text
              style={{
                ...theme.type.h2,
                color: theme.colors.textPrimary,
                textAlign: "center",
                marginBottom: 12,
              }}
            >
              {t("auth.forgotPassword")}
            </Text>
            <Text
              style={{
                ...theme.type.body,
                color: theme.colors.textSecondary,
                textAlign: "center",
                marginBottom: 24,
              }}
            >
              {t("auth.reset.subtitle")}
            </Text>

            <TextInput
              placeholder={t("auth.email")}
              placeholderTextColor={theme.colors.textMuted}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              textContentType="emailAddress"
              autoComplete="email"
              style={inputStyle}
            />

            <TouchableOpacity
              onPress={handleReset}
              disabled={loading}
              style={{
                backgroundColor: theme.colors.primary,
                borderRadius: theme.radii.md,
                paddingVertical: 16,
                width: "85%",
                alignItems: "center",
                opacity: loading ? 0.7 : 1,
                marginTop: 12,
              }}
            >
              {loading ? (
                <ActivityIndicator color={theme.colors.onPrimary} />
              ) : (
                <Text style={{ ...theme.type.button, color: theme.colors.onPrimary }}>
                  {t("auth.reset.sendLink")}
                </Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => router.push("/(auth)/signin")}
              style={{ marginTop: 24 }}
            >
              <Text style={{ ...theme.type.body, color: theme.colors.primary }}>
                {t("auth.reset.backToSignIn")}
              </Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <Text
              style={{
                ...theme.type.h2,
                color: theme.colors.primary,
                textAlign: "center",
                marginBottom: 12,
              }}
            >
              📩 {t("auth.reset.checkInbox")}
            </Text>
            <Text
              style={{
                ...theme.type.body,
                color: theme.colors.textSecondary,
                textAlign: "center",
                marginBottom: 28,
              }}
            >
              {t("auth.reset.sentTo")}
            </Text>
            <Text
              style={{
                ...theme.type.body,
                fontWeight: "600",
                color: theme.colors.textPrimary,
                textAlign: "center",
                marginBottom: 32,
              }}
            >
              {sentToEmail}
            </Text>

            <TouchableOpacity
              onPress={() => router.push("/(auth)/reset-confirm")}
              style={{
                marginBottom: 16,
                paddingVertical: 12,
                alignItems: "center",
              }}
            >
              <Text style={{ ...theme.type.caption, color: theme.colors.primary, fontWeight: "600" }}>
                {t("auth.reset.haveLink")}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => router.push("/(auth)/signin")}
              style={{
                backgroundColor: theme.colors.primary,
                borderRadius: theme.radii.md,
                paddingVertical: 16,
                width: "85%",
                alignItems: "center",
              }}
            >
              <Text style={{ ...theme.type.button, color: theme.colors.onPrimary }}>
                {t("auth.reset.returnToSignIn")}
              </Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
    </SafeScreenView>
  );
}
