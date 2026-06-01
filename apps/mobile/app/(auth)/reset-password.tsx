// ────────────────────────────────────────────────
// Winkly Password Reset Screen
// v7.0 – November 2025
// © Winkly Technologies UG (haftungsbeschränkt)
// Maintainer: Kateryna Shyshkalova
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
import { supabase } from "@/lib/supabase";
import { Colors, Typography, Layout } from "@/constants/tokens";
import { getEmailRedirectTo } from "@/lib/authRedirectUrl";

export default function ResetPassword() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [sentToEmail, setSentToEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  // ────────────────────────────────────────────────
  //  Handle Reset
  // ────────────────────────────────────────────────
  const handleReset = async () => {
    const cleanEmail = email.trim();
    if (!cleanEmail) {
      Alert.alert("Incomplete", "Please enter your email address.");
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
      Alert.alert("Error", err.message ?? "Unable to send reset link.");
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
          paddingTop: 24 + (Layout.safeTopExtra ?? 24),
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
                ...Typography.h2,
                color: Colors.textPrimary,
                textAlign: "center",
                marginBottom: 12,
              }}
            >
              Forgot your password?
            </Text>
            <Text
              style={{
                ...Typography.body,
                color: Colors.gray700,
                textAlign: "center",
                marginBottom: 24,
              }}
            >
              Enter your email address and we’ll send you a link to reset it.
            </Text>

            <TextInput
              placeholder="Email"
              placeholderTextColor={Colors.gray500}
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
                  Send reset link
                </Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => router.push("/(auth)/signin")}
              style={{ marginTop: 24 }}
            >
              <Text style={{ ...Typography.body, color: Colors.primaryViolet }}>
                Back to Sign in
              </Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <Text
              style={{
                ...Typography.h2,
                color: Colors.primaryViolet,
                textAlign: "center",
                marginBottom: 12,
              }}
            >
              📩 Check your inbox
            </Text>
            <Text
              style={{
                ...Typography.body,
                color: Colors.gray700,
                textAlign: "center",
                marginBottom: 28,
              }}
            >
              We’ve sent a password reset link to:
            </Text>
            <Text
              style={{
                ...Typography.body,
                fontWeight: "600",
                color: Colors.textPrimary,
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
              <Text style={{ ...Typography.caption, color: Colors.primaryViolet, fontWeight: "600" }}>
                Already have the link? Set new password →
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => router.push("/(auth)/signin")}
              style={{
                backgroundColor: Colors.primaryViolet,
                borderRadius: Layout.radii.control,
                paddingVertical: 16,
                width: "85%",
                alignItems: "center",
              }}
            >
              <Text style={{ ...Typography.button, color: Colors.accentYellow }}>
                Return to Sign in
              </Text>
            </TouchableOpacity>
          </>
        )}
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
