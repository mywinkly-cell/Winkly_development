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
import { useAppTheme, type AppTheme } from "@/constants/design-system";
import { useTranslation } from "react-i18next";
import { isInvalidRefreshToken, validateSigninInput } from "@/lib/auth/formValidation";
import { getTermsAndCookiesAccepted } from "@/lib/legalFlags";
import { hasKnownAccount, markHasAccount, recordLastActivity } from "@/lib/lastActivity";
import { routeAfterAuthentication } from "@/lib/auth/postAuthRouting";
import { OAuthButtons } from "@/components/auth/OAuthButtons";
import { LanguageGlobeButton } from "@/components/i18n/LanguageGlobeButton";

export default function Signin() {
  const { t } = useTranslation();
  const router = useRouter();
  const { signOut } = useAuth();
  const theme = useAppTheme();
  const styles = createStyles(theme);
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
        <View style={[styles.topBarSide, styles.topBarSideEnd]}>
          <LanguageGlobeButton />
        </View>
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
              placeholderTextColor={theme.colors.textMuted}
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
              placeholderTextColor={theme.colors.textMuted}
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
              accessibilityRole="button"
              accessibilityLabel={t("auth.signin")}
              accessibilityState={{ disabled: loading, busy: loading }}
            >
              {loading ? (
                <ActivityIndicator color={theme.colors.onPrimary} />
              ) : (
                <Text style={styles.primaryText}>{t("auth.signin")}</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => router.push("/(auth)/reset-password")}
              style={styles.resetLink}
              accessibilityRole="button"
              accessibilityLabel={t("auth.forgotPassword")}
            >
              <Text style={styles.resetText}>{t("auth.forgotPassword")}</Text>
            </TouchableOpacity>

            <OAuthButtons disabled={loading} hideDivider compact />

            <TouchableOpacity
              onPress={() => router.replace("/(onboarding-personal)/get-started")}
              style={styles.footerLink}
              accessibilityRole="button"
              accessibilityLabel={`${t("auth.noAccount")} ${t("auth.signup")}`}
            >
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

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: theme.colors.backgroundMuted },
    topBar: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 16,
      paddingTop: theme.spacing.sm,
      paddingBottom: theme.spacing.md,
      minHeight: 56,
      backgroundColor: theme.colors.surface,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border,
    },
    topBarSide: { width: 44 },
    topBarSideEnd: { alignItems: "flex-end" },
    topBarTitle: {
      ...theme.type.h2,
      fontSize: 22,
      lineHeight: 31,
      fontWeight: "700",
      color: theme.colors.primary,
      fontFamily: theme.type.h1.fontFamily,
      textAlign: "center",
    },
    screen: { flex: 1, backgroundColor: theme.colors.backgroundMuted },
    inner: { flex: 1, justifyContent: "center", paddingHorizontal: theme.spacing.lg, paddingVertical: theme.spacing.md },
    card: {
      width: "100%",
      maxWidth: 420,
      alignSelf: "center",
      backgroundColor: theme.colors.surface,
      borderRadius: theme.radii.lg,
      padding: theme.spacing.lg,
      ...theme.elevation(1),
    },
    title: {
      fontFamily: theme.type.h1.fontFamily,
      fontSize: 22,
      lineHeight: 28,
      color: theme.colors.textPrimary,
      marginBottom: 8,
    },
    subtitle: { ...theme.type.body, color: theme.colors.textSecondary, marginBottom: theme.spacing.lg },
    label: { ...theme.type.caption, color: theme.colors.textSecondary, marginBottom: 6 },
    input: {
      borderWidth: 2,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
      borderRadius: theme.radii.md,
      paddingHorizontal: 14,
      paddingVertical: 12,
      marginBottom: 12,
      color: theme.colors.textPrimary,
      fontSize: 16,
      minHeight: 44,
    },
    inputFocused: { borderColor: theme.colors.primary },
    primaryBtn: {
      backgroundColor: theme.colors.primary,
      borderRadius: theme.radii.md,
      paddingVertical: 14,
      alignItems: "center",
      marginTop: 4,
      marginBottom: 8,
      minHeight: 44,
      justifyContent: "center",
      ...theme.elevation(2),
    },
    primaryBtnDisabled: { opacity: 0.7 },
    primaryText: { ...theme.type.button, color: theme.colors.onPrimary, fontFamily: theme.type.button.fontFamily },
    resetLink: { alignItems: "center", marginBottom: 8, minHeight: 40, justifyContent: "center" },
    resetText: { ...theme.type.caption, color: theme.colors.primary },
    footerLink: { marginTop: 12, alignItems: "center", minHeight: 40, justifyContent: "center" },
    footerText: { ...theme.type.body, color: theme.colors.textSecondary },
    link: { color: theme.colors.primary, fontWeight: "600" },
  });
}
