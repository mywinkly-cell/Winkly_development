// ────────────────────────────────────────────────
// Winkly Password Reset Confirmation Screen
// v7.0 – November 2025
// © Winkly Technologies UG (haftungsbeschränkt)
// Maintainer: Kateryna Shyshkalova
// Purpose: Allow user to set a new password after reset link
// opened via deep link (winkly://reset-confirm)
// ────────────────────────────────────────────────

import React, { useState, useCallback } from "react";
import {
  View,
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
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { supabase } from "@/lib/supabase";
import { createSessionFromUrl } from "@/lib/authDeepLink";
import { Colors, Typography, Layout } from "@/constants/tokens";

export default function ResetConfirm() {
  const router = useRouter();
  const { t } = useTranslation();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);

  // Paste reset link when the email link opened in a browser (Expo Go, or when app didn’t open from deep link)
  const [pasteUrl, setPasteUrl] = useState("");
  const [pasteLoading, setPasteLoading] = useState(false);
  const handlePasteResetLink = useCallback(async () => {
    const url = pasteUrl.trim();
    if (!url) {
      Alert.alert(
        t("common.pasteLink"),
        t("auth.resetConfirm.pasteLinkMessage")
      );
      return;
    }
    setPasteLoading(true);
    try {
      const urlToUse = url.includes("#") ? "winkly://callback" + url.slice(url.indexOf("#")) : url;
      const ok = await createSessionFromUrl(urlToUse);
      if (ok) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert(t("auth.resetConfirm.linkAppliedTitle"), t("auth.resetConfirm.linkAppliedMessage"));
      } else {
        Alert.alert(
          t("auth.resetConfirm.invalidLinkTitle"),
          t("auth.resetConfirm.invalidLinkMessage")
        );
      }
    } catch {
      Alert.alert(t("common.error"), t("auth.resetConfirm.applyLinkFailed"));
    } finally {
      setPasteLoading(false);
    }
  }, [pasteUrl, t]);

  // ────────────────────────────────────────────────
  //  Handle Password Update
  // ────────────────────────────────────────────────
  const handleUpdatePassword = async () => {
    if (!password || !confirmPassword) {
      Alert.alert(t("auth.incomplete"), t("auth.resetConfirm.fillBoth"));
      return;
    }
    if (password.length < 8) {
      Alert.alert(t("common.weakPassword"), t("auth.passwordMinLength"));
      return;
    }
    if (password !== confirmPassword) {
      Alert.alert(t("auth.resetConfirm.mismatchTitle"), t("auth.resetConfirm.mismatchMessage"));
      return;
    }

    try {
      setLoading(true);
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;

      Alert.alert(t("common.success"), t("auth.resetConfirm.successMessage"));
      router.replace("/(auth)/signin");
    } catch (err: any) {
      Alert.alert(t("common.error"), err.message ?? t("auth.resetConfirm.updateFailed"));
    } finally {
      setLoading(false);
    }
  };

  // ────────────────────────────────────────────────
  //  UI
  // ────────────────────────────────────────────────
  return (
    <SafeScreenView style={{ flex: 1, backgroundColor: Colors.backgroundMuted }}>
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: Colors.backgroundMuted }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: "center",
          alignItems: "center",
          padding: 24,
          paddingTop: 24,
        }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Logo */}
        <Image
          source={require("../../assets/icons/winkly-logo.png")}
          resizeMode="contain"
          style={{ width: 180, height: 60, marginBottom: 30 }}
        />

        <Text
          style={{
            ...Typography.h2,
            color: Colors.textPrimary,
            textAlign: "center",
            marginBottom: 12,
          }}
        >
          {t("auth.resetConfirm.title")}
        </Text>

        <Text
          style={{
            ...Typography.body,
            color: Colors.gray700,
            textAlign: "center",
            marginBottom: 24,
          }}
        >
          {t("auth.resetConfirm.subtitle")}
        </Text>

        {__DEV__ && (
        <View style={{ marginBottom: 24, width: "100%", maxWidth: 360 }}>
          <Text style={{ ...Typography.caption, color: Colors.gray600, marginBottom: 8, fontWeight: "600" }}>
            {t("auth.verify.devTitle")}
          </Text>
          <Text style={{ ...Typography.caption, color: Colors.gray500, marginBottom: 8 }}>
            {t("auth.verify.devHint")}
          </Text>
          <TextInput
            value={pasteUrl}
            onChangeText={setPasteUrl}
            placeholder={t("auth.verify.pastePlaceholder")}
            placeholderTextColor={Colors.gray500}
            autoCapitalize="none"
            autoCorrect={false}
            multiline
            style={{
              ...inputStyle,
              minHeight: 72,
              marginBottom: 8,
            }}
          />
          <TouchableOpacity
            onPress={handlePasteResetLink}
            disabled={pasteLoading}
            style={{
              backgroundColor: Colors.primaryViolet,
              borderRadius: Layout.radii.control,
              paddingVertical: 12,
              alignItems: "center",
              opacity: pasteLoading ? 0.7 : 1,
            }}
          >
            {pasteLoading ? (
              <ActivityIndicator color={Colors.accentYellow} size="small" />
            ) : (
              <Text style={{ ...Typography.button, color: Colors.accentYellow }}>{t("auth.resetConfirm.pasteAndContinue")}</Text>
            )}
          </TouchableOpacity>
        </View>
        )}

        <TextInput
          placeholder={t("auth.resetConfirm.newPasswordPlaceholder")}
          placeholderTextColor={Colors.gray500}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          textContentType="newPassword"
          autoComplete="password-new"
          style={inputStyle}
        />

        <TextInput
          placeholder={t("auth.resetConfirm.confirmPlaceholder")}
          placeholderTextColor={Colors.gray500}
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          secureTextEntry
          textContentType="newPassword"
          autoComplete="password-new"
          style={inputStyle}
        />

        <TouchableOpacity
          onPress={handleUpdatePassword}
          disabled={loading}
          style={{
            backgroundColor: Colors.primaryViolet,
            borderRadius: Layout.radii.control,
            paddingVertical: 16,
            width: "85%",
            alignItems: "center",
            opacity: loading ? 0.7 : 1,
            marginTop: 12,
          }}
        >
          {loading ? (
            <ActivityIndicator color={Colors.accentYellow} />
          ) : (
            <Text style={{ ...Typography.button, color: Colors.accentYellow }}>
              {t("auth.resetConfirm.updateButton")}
            </Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => router.push("/(auth)/signin")}
          style={{ marginTop: 24 }}
        >
          <Text style={{ ...Typography.body, color: Colors.primaryViolet }}>
            {t("auth.reset.backToSignIn")}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
    </SafeScreenView>
  );
}

// ────────────────────────────────────────────────
// Shared Styles
// ────────────────────────────────────────────────
const inputStyle = {
  borderWidth: 2,
  borderColor: Colors.gray200,
  borderRadius: Layout.radii.control,
  padding: 16,
  marginBottom: 12,
  width: "100%" as const,
  maxWidth: 360,
  backgroundColor: Colors.white,
  fontSize: 16,
  color: Colors.textPrimary,
};
