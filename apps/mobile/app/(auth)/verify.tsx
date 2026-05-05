// apps/mobile/app/(auth)/verify.tsx
// Shown when user signed in but email is NOT verified — premium styling

import React, { useCallback, useEffect, useState, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Image,
  Alert,
  TextInput,
  StyleSheet,
  Platform,
  ScrollView,
  Animated,
  ActivityIndicator,
} from "react-native";
import { SafeScreenView } from "@/components/SafeScreenView";
import * as Haptics from "expo-haptics";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import { supabase } from "@/lib/supabase";
import { createSessionFromUrl } from "@/lib/authDeepLink";
import { Colors, Typography, Layout, FontFamily, Shadow } from "@/constants/tokens";
import { AUTH_REDIRECT_URL } from "@/constants/config";

export default function Verify() {
  const router = useRouter();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const [loading, setLoading] = useState(false);
  const [emailForResend, setEmailForResend] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const last = await AsyncStorage.getItem("winkly_last_signup_email");
        if (last) setEmailForResend(last);
      } catch {}
    })();
  }, []);

  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 300, useNativeDriver: true }).start();
  }, [fadeAnim]);

  const resendEmail = useCallback(async () => {
    const cleanEmail = emailForResend.trim();
    if (!cleanEmail) {
      Alert.alert("Email required", "Please enter the email you used to sign up.");
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.resend({
        type: "signup",
        email: cleanEmail,
        options: { emailRedirectTo: AUTH_REDIRECT_URL },
      });
      if (error) throw error;
      await AsyncStorage.setItem("winkly_last_signup_email", cleanEmail);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Sent", "Verification email has been resent. Check your inbox and tap the link.");
    } catch (err: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert("Resend failed", err?.message ?? "Please try again.");
    } finally {
      setLoading(false);
    }
  }, [emailForResend]);

  const goSignin = useCallback(() => router.replace("/(auth)/signin"), [router]);
  const goSignup = useCallback(() => router.replace("/(onboarding-personal)/get-started"), [router]);

  // Dev-only: paste verification link when testing in Expo Go (winkly:// deep links don't work)
  const [pasteUrl, setPasteUrl] = useState("");
  const [pasteLoading, setPasteLoading] = useState(false);
  const handlePasteVerify = useCallback(async () => {
    const url = pasteUrl.trim();
    if (!url) {
      Alert.alert("Paste link", "Paste the full URL from your browser's address bar into the field above.");
      return;
    }
    setPasteLoading(true);
    try {
      const urlToUse = url.includes("#") ? "winkly://callback" + url.slice(url.indexOf("#")) : url;
      const ok = await createSessionFromUrl(urlToUse);
      if (ok) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        router.replace("/(auth)/email-verified");
      } else {
        Alert.alert("Invalid link", "Could not use this link. Make sure it's the full URL from the verification email.");
      }
    } catch {
      Alert.alert("Error", "Could not verify. Try again.");
    } finally {
      setPasteLoading(false);
    }
  }, [pasteUrl, router]);

  return (
    <SafeScreenView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <Animated.View style={[styles.inner, { opacity: fadeAnim }]}>
          <Image source={require("../../assets/icons/winkly-logo.png")} resizeMode="contain" style={styles.wordmark} />

          <View style={styles.card}>
            <Text style={styles.title}>Please confirm your email</Text>
            <Text style={styles.subtitle}>
              We sent a verification link to your inbox. Tap the link to verify your email and continue.{"\n\n"}
              You can&apos;t use the app until your email is verified.
            </Text>

            <View style={styles.resendSection}>
              <Text style={styles.resendTitle}>Didn&apos;t get the email?</Text>
              <TextInput
                value={emailForResend}
                onChangeText={setEmailForResend}
                placeholder="Email you used to sign up"
                placeholderTextColor={Colors.gray500}
                autoCapitalize="none"
                keyboardType="email-address"
                textContentType="emailAddress"
                autoComplete="email"
                style={styles.input}
              />
              <TouchableOpacity
                onPress={resendEmail}
                disabled={loading}
                activeOpacity={0.85}
                style={[styles.resendBtn, loading && { opacity: 0.7 }]}
              >
                {loading ? (
                  <ActivityIndicator color={Colors.accentYellow} size="small" />
                ) : (
                  <Text style={styles.resendBtnText}>Resend verification email</Text>
                )}
              </TouchableOpacity>
            </View>

            {__DEV__ && (
              <View style={styles.devSection}>
                <Text style={styles.devTitle}>Testing in Expo Go?</Text>
                <Text style={styles.devHint}>Deep links don&apos;t work in Expo Go. Paste the full URL from your browser after opening the verification link:</Text>
                <TextInput
                  value={pasteUrl}
                  onChangeText={setPasteUrl}
                  placeholder="Paste https://... or the full URL"
                  placeholderTextColor={Colors.gray500}
                  autoCapitalize="none"
                  autoCorrect={false}
                  multiline
                  style={styles.pasteInput}
                />
                <TouchableOpacity
                  onPress={handlePasteVerify}
                  disabled={pasteLoading}
                  activeOpacity={0.85}
                  style={[styles.pasteBtn, pasteLoading && { opacity: 0.7 }]}
                >
                  {pasteLoading ? (
                    <ActivityIndicator color={Colors.accentYellow} size="small" />
                  ) : (
                    <Text style={styles.pasteBtnText}>Paste & verify</Text>
                  )}
                </TouchableOpacity>
              </View>
            )}

            <TouchableOpacity onPress={goSignin} style={styles.linkBtn} activeOpacity={0.7}>
              <Text style={styles.linkText}>Back to Sign in</Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={goSignup} style={styles.linkBtn} activeOpacity={0.7}>
              <Text style={styles.linkText}>Signed up with another email? Sign up again</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </ScrollView>
    </SafeScreenView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.backgroundMuted },
  container: { flexGrow: 1, justifyContent: "center", alignItems: "center", padding: Layout.spacing.lg },
  inner: { alignItems: "center", width: "100%", maxWidth: 420 },
  wordmark: { width: 190, height: 60, marginBottom: 24 },
  card: {
    width: "100%",
    backgroundColor: Colors.white,
    borderRadius: Layout.radii.card,
    padding: Layout.spacing.xl,
    ...Shadow.card,
  },
  title: {
    fontFamily: FontFamily.heading,
    fontSize: 22,
    lineHeight: 30,
    color: Colors.textPrimary,
    marginBottom: 12,
    textAlign: "center",
  },
  subtitle: {
    ...Typography.body,
    color: Colors.textSecondary,
    marginBottom: 24,
    textAlign: "center",
    lineHeight: 24,
  },
  resendSection: {
    borderTopWidth: 1,
    borderTopColor: Colors.gray200,
    paddingTop: 20,
    marginBottom: 20,
  },
  resendTitle: { fontFamily: FontFamily.heading, fontSize: 16, color: Colors.textPrimary, marginBottom: 12 },
  input: {
    borderWidth: 2,
    borderColor: Colors.gray200,
    backgroundColor: Colors.white,
    borderRadius: Layout.radii.control,
    paddingHorizontal: 16,
    paddingVertical: Platform.OS === "ios" ? 14 : 12,
    marginBottom: 16,
    color: Colors.textPrimary,
    fontSize: 16,
  },
  resendBtn: {
    backgroundColor: Colors.primaryViolet,
    borderRadius: Layout.radii.control,
    paddingVertical: 16,
    alignItems: "center",
    minHeight: Layout.touchTargetMin,
    justifyContent: "center",
    ...Shadow.button,
  },
  resendBtnText: { ...Typography.button, color: Colors.accentYellow, fontFamily: FontFamily.heading },
  devSection: {
    borderTopWidth: 1,
    borderTopColor: Colors.gray200,
    paddingTop: 20,
    marginBottom: 20,
  },
  devTitle: { fontFamily: FontFamily.heading, fontSize: 14, color: Colors.gray600, marginBottom: 8 },
  devHint: { ...Typography.caption, color: Colors.gray500, marginBottom: 12 },
  pasteInput: {
    borderWidth: 2,
    borderColor: Colors.gray200,
    borderRadius: Layout.radii.control,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 12,
    color: Colors.textPrimary,
    fontSize: 14,
    minHeight: 80,
  },
  pasteBtn: {
    backgroundColor: Colors.primaryViolet,
    borderRadius: Layout.radii.control,
    paddingVertical: 12,
    alignItems: "center",
  },
  pasteBtnText: { ...Typography.button, color: Colors.accentYellow, fontFamily: FontFamily.heading },
  linkBtn: { alignItems: "center", paddingVertical: 12, minHeight: 44, justifyContent: "center" },
  linkText: { ...Typography.caption, color: Colors.primaryViolet, fontWeight: "600" },
});
