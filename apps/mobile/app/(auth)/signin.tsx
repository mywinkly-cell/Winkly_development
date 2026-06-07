// apps/mobile/app/(auth)/signin.tsx
// Winkly Sign-in — Premium, modern, professional (SDK 54)

import React, { useState, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  StyleSheet,
  Animated,
} from "react-native";
import { SafeScreenView } from "@/components/SafeScreenView";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/providers/AuthProvider";
import { Colors, Typography, Layout, FontFamily, Shadow } from "@/constants/tokens";
import { useTranslation } from "react-i18next";
import { isInvalidRefreshToken, validateSigninInput } from "@/lib/auth/formValidation";
import { getTermsAndCookiesAccepted } from "@/lib/legalFlags";
import { hasKnownAccount, markHasAccount, recordLastActivity } from "@/lib/lastActivity";
import { routeAfterAuthentication } from "@/lib/auth/postAuthRouting";
import { OAuthButtons } from "@/components/auth/OAuthButtons";

export default function Signin() {
  const { t } = useTranslation();
  const router = useRouter();
  const { signOut } = useAuth();
  const fadeAnim = useRef(new Animated.Value(0)).current;

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [emailFocused, setEmailFocused] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);
  const [showWelcomeBack, setShowWelcomeBack] = useState(false);

  React.useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 300, useNativeDriver: true }).start();
  }, [fadeAnim]);

  React.useEffect(() => {
    hasKnownAccount().then(setShowWelcomeBack);
  }, []);

  React.useEffect(() => {
    getTermsAndCookiesAccepted().then((accepted) => {
      if (!accepted) router.replace("/(auth)/terms-cookies?next=signin");
    });
  }, [router]);

  const onSignin = async () => {
    const validation = validateSigninInput({ email, password });
    if (!validation.ok) {
      Alert.alert(t("auth.incomplete"), t("auth.enterEmailPassword"));
      return;
    }
    const cleanEmail = validation.email;
    try {
      setLoading(true);
      const { error } = await supabase.auth.signInWithPassword({ email: cleanEmail, password });
      if (error) throw error;
      await markHasAccount();
      await recordLastActivity();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await routeAfterAuthentication(router);
    } catch (err: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      if (isInvalidRefreshToken(err)) {
        try { await signOut(); } catch { /* already cleared */ }
        Alert.alert(t("auth.sessionExpired"), t("auth.sessionExpiredMessage"));
      } else {
        Alert.alert(t("common.error"), err?.message ?? t("auth.oauthFailed"));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeScreenView style={styles.safe}>
      <View style={styles.topBar}>
        <View style={styles.topBarSide} />
        <Text style={styles.topBarTitle}>Winkly</Text>
        <View style={styles.topBarSide} />
      </View>

      <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <Animated.View style={[styles.inner, { opacity: fadeAnim }]}>
          <View style={styles.card}>
            <Text style={styles.title}>
              {showWelcomeBack ? t("auth.welcomeBack") : t("auth.signin")}
            </Text>
            <Text style={styles.subtitle}>{t("auth.signInSubtitle")}</Text>

            <Text style={styles.label}>{t("auth.email")}</Text>
            <TextInput
              placeholder={t("auth.emailPlaceholder")}
              placeholderTextColor={Colors.gray500}
              value={email}
              onChangeText={setEmail}
              onFocus={() => setEmailFocused(true)}
              onBlur={() => setEmailFocused(false)}
              autoCapitalize="none"
              keyboardType="email-address"
              textContentType="emailAddress"
              autoComplete="email"
              style={[styles.input, emailFocused && styles.inputFocused]}
            />

            <Text style={styles.label}>{t("auth.password")}</Text>
            <TextInput
              placeholder={t("auth.passwordPlaceholder")}
              placeholderTextColor={Colors.gray500}
              value={password}
              onChangeText={setPassword}
              onFocus={() => setPasswordFocused(true)}
              onBlur={() => setPasswordFocused(false)}
              secureTextEntry
              textContentType="password"
              autoComplete="password"
              style={[styles.input, passwordFocused && styles.inputFocused]}
            />

            <TouchableOpacity
              onPress={onSignin}
              disabled={loading}
              activeOpacity={0.85}
              style={[styles.primaryBtn, loading && styles.primaryBtnDisabled]}
            >
              {loading ? (
                <ActivityIndicator color={Colors.accentYellow} />
              ) : (
                <Text style={styles.primaryText}>{t("auth.signin")}</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity onPress={() => router.push("/(auth)/reset-password")} style={styles.resetLink}>
              <Text style={styles.resetText}>{t("auth.forgotPassword")}</Text>
            </TouchableOpacity>

            <OAuthButtons disabled={loading} hideDivider compact />

            <TouchableOpacity onPress={() => router.replace("/(onboarding-personal)/get-started")} style={styles.footerLink}>
              <Text style={styles.footerText}>
                {t("auth.noAccount")} <Text style={styles.link}>{t("auth.signup")}</Text>
              </Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </KeyboardAvoidingView>
    </SafeScreenView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.backgroundMuted },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    ...Layout.topHeaderBar,
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray200,
  },
  topBarSide: { width: 44 },
  topBarTitle: {
    ...Typography.headerWinklyTitle,
    color: Colors.primaryViolet,
    fontFamily: FontFamily.headingBold,
    textAlign: "center",
  },
  screen: { flex: 1, backgroundColor: Colors.backgroundMuted },
  inner: { flex: 1, justifyContent: "center", paddingHorizontal: Layout.spacing.lg, paddingVertical: Layout.spacing.md },
  card: {
    width: "100%",
    maxWidth: 420,
    alignSelf: "center",
    backgroundColor: Colors.white,
    borderRadius: Layout.radii.card,
    padding: Layout.spacing.lg,
    ...Shadow.card,
  },
  title: {
    fontFamily: FontFamily.headingBold,
    fontSize: 22,
    lineHeight: 28,
    color: Colors.textPrimary,
    marginBottom: 8,
  },
  subtitle: { ...Typography.body, color: Colors.textSecondary, marginBottom: Layout.spacing.lg },
  label: { ...Typography.caption, color: Colors.textSecondary, marginBottom: 6 },
  input: {
    borderWidth: 2,
    borderColor: Colors.gray200,
    backgroundColor: Colors.white,
    borderRadius: Layout.radii.control,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 12,
    color: Colors.textPrimary,
    fontSize: 16,
    minHeight: Layout.touchTargetMin,
  },
  inputFocused: { borderColor: Colors.primaryViolet },
  primaryBtn: {
    backgroundColor: Colors.primaryViolet,
    borderRadius: Layout.radii.control,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 4,
    marginBottom: 8,
    minHeight: Layout.touchTargetMin,
    justifyContent: "center",
    ...Shadow.button,
  },
  primaryBtnDisabled: { opacity: 0.7 },
  primaryText: { ...Typography.button, color: Colors.accentYellow, fontFamily: FontFamily.headingBold },
  resetLink: { alignItems: "center", marginBottom: 8, minHeight: 40, justifyContent: "center" },
  resetText: { ...Typography.caption, color: Colors.primaryViolet },
  footerLink: { marginTop: 12, alignItems: "center", minHeight: 40, justifyContent: "center" },
  footerText: { ...Typography.body, color: Colors.gray600 },
  link: { color: Colors.primaryViolet, fontWeight: "600" },
});
