// apps/mobile/app/(auth)/signup.tsx
// Winkly Sign-up — Premium, modern, professional (SDK 54)

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
  Switch,
  StyleSheet,
  Animated,
} from "react-native";
import { SafeScreenView } from "@/components/SafeScreenView";
import * as Haptics from "expo-haptics";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useTranslation } from "react-i18next";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/providers/AuthProvider";
import { useAppTheme, type AppTheme } from "@/constants/design-system";
import { getEmailRedirectTo } from "@/lib/authRedirectUrl";
import {
  isExistingUserError,
  isInvalidRefreshToken,
  validateSignupInput,
} from "@/lib/auth/formValidation";
import { getTermsAndCookiesAccepted } from "@/lib/legalFlags";
import { markHasAccount } from "@/lib/lastActivity";
import { trackAccountCreated } from "@/lib/analytics/events";
import { OAuthButtons } from "@/components/auth/OAuthButtons";
import { LanguageGlobeButton } from "@/components/i18n/LanguageGlobeButton";

export default function Signup() {
  const { t } = useTranslation();
  const router = useRouter();
  const params = useLocalSearchParams<{ accountType?: string }>();
  const { signOut } = useAuth();
  const theme = useAppTheme();
  const styles = createStyles(theme);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [accountType, setAccountType] = useState<"personal" | "business">(
    params.accountType === "business" ? "business" : "personal"
  );
  const [isAdult, setIsAdult] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showPwd, setShowPwd] = useState(false);
  const [emailFocused, setEmailFocused] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);

  React.useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 300, useNativeDriver: true }).start();
  }, [fadeAnim]);

  React.useEffect(() => {
    if (params.accountType === "business") setAccountType("business");
    else if (params.accountType === "personal") setAccountType("personal");
  }, [params.accountType]);

  React.useEffect(() => {
    getTermsAndCookiesAccepted().then((accepted) => {
      if (!accepted) router.replace("/(auth)/terms-cookies?next=signup");
    });
  }, [router]);

  const alternateType = accountType === "personal" ? "business" : "personal";

  const signupValidationAlert = (code: "incomplete" | "password_too_short" | "confirm_18_required") => {
    if (code === "incomplete") {
      Alert.alert(t("auth.incomplete"), t("auth.enterEmailPassword"));
    } else if (code === "password_too_short") {
      Alert.alert(t("auth.passwordTooShort"), t("auth.passwordMinLength"));
    } else {
      Alert.alert(t("auth.confirm18"), t("auth.confirm18Message"));
    }
  };

  const onSignup = async () => {
    const validation = validateSignupInput({ email, password, isAdult });
    if (!validation.ok) {
      signupValidationAlert(validation.code);
      return;
    }
    const cleanEmail = validation.email;
    try {
      setLoading(true);
      const emailRedirectTo = await getEmailRedirectTo();
      const { error } = await supabase.auth.signUp({
        email: cleanEmail,
        password,
        options: { data: { account_type: accountType }, emailRedirectTo },
      });
      if (error) throw error;
      trackAccountCreated({ account_type: accountType, method: "email" });
      await markHasAccount();
      await AsyncStorage.setItem("winkly_last_signup_email", cleanEmail);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace("/(auth)/verify");
    } catch (err: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      if (isInvalidRefreshToken(err)) {
        try { await signOut(); } catch { /* already cleared */ }
        Alert.alert(t("auth.sessionExpired"), t("auth.sessionExpiredMessage"));
      } else {
        if (isExistingUserError(err)) {
          Alert.alert(
            t("auth.accountExists"),
            t("auth.accountExistsMessage"),
            [{ text: t("auth.signin"), onPress: () => router.replace("/(auth)/signin") }, { text: t("common.ok") }]
          );
        } else {
          Alert.alert(t("common.error"), err?.message ?? t("auth.oauthFailed"));
        }
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
          <View style={styles.card} testID="signup-screen">
            <Text style={styles.title}>{t("auth.createYourAccount")}</Text>

            <Text style={styles.label}>{t("auth.accountType")}</Text>
            <View style={styles.accountTypeSelected}>
              <Text style={styles.accountTypeSelectedText}>
                {accountType === "personal" ? t("auth.accountTypePersonal") : t("auth.accountTypeBusiness")}
              </Text>
            </View>

            <Text style={styles.label}>{t("auth.email")}</Text>
            <TextInput
              testID="signup-email"
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
            <View style={styles.passwordRow}>
              <TextInput
                testID="signup-password"
                placeholder={t("auth.passwordSignupPlaceholder")}
                placeholderTextColor={theme.colors.textMuted}
                value={password}
                onChangeText={setPassword}
                onFocus={() => setPasswordFocused(true)}
                onBlur={() => setPasswordFocused(false)}
                secureTextEntry={!showPwd}
                textContentType="newPassword"
                autoComplete="password-new"
                style={[styles.input, styles.inputFlex, passwordFocused && styles.inputFocused]}
              />
              <TouchableOpacity
                onPress={() => setShowPwd((v) => !v)}
                style={styles.smallBtn}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel={showPwd ? t("auth.hidePassword") : t("auth.showPassword")}
              >
                <Text style={styles.smallBtnText}>{showPwd ? t("auth.hidePassword") : t("auth.showPassword")}</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.adultRow}>
              <Switch
                value={isAdult}
                onValueChange={setIsAdult}
                thumbColor={Platform.OS === "android" ? (isAdult ? theme.colors.primary : theme.colors.textMuted) : undefined}
                trackColor={{ false: theme.colors.border, true: theme.colors.primary }}
                ios_backgroundColor={theme.colors.border}
              />
              <Text style={styles.adultText}>{t("auth.confirmAdultTerms")}</Text>
            </View>

            <TouchableOpacity
              testID="signup-submit"
              onPress={onSignup}
              disabled={loading}
              activeOpacity={0.85}
              style={[styles.primaryBtn, loading && styles.primaryBtnDisabled]}
              accessibilityRole="button"
              accessibilityLabel={t("auth.createAccount")}
              accessibilityState={{ disabled: loading, busy: loading }}
            >
              {loading ? (
                <ActivityIndicator color={theme.colors.onPrimary} />
              ) : (
                <Text style={styles.primaryText}>{t("auth.createAccount")}</Text>
              )}
            </TouchableOpacity>

            <OAuthButtons
              accountType={accountType}
              requireAdult
              isAdult={isAdult}
              disabled={loading}
              hideDivider
              compact
            />

            <TouchableOpacity
              onPress={() => router.replace("/(auth)/signin")}
              style={styles.footerLink}
              accessibilityRole="button"
              accessibilityLabel={`${t("auth.hasAccount")} ${t("auth.signin")}`}
            >
              <Text style={styles.footerText}>
                {t("auth.hasAccount")} <Text style={styles.link}>{t("auth.signin")}</Text>
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => {
                Haptics.selectionAsync();
                setAccountType(alternateType);
              }}
              style={styles.altTypeLink}
              accessibilityRole="button"
              accessibilityLabel={alternateType === "business" ? t("auth.createBusinessInstead") : t("auth.createPersonalInstead")}
            >
              <Text style={styles.altTypeText}>
                {alternateType === "business" ? t("auth.createBusinessInstead") : t("auth.createPersonalInstead")}
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
      marginBottom: theme.spacing.md,
    },
    label: { ...theme.type.caption, color: theme.colors.textSecondary, marginBottom: 6 },
    accountTypeSelected: {
      paddingVertical: 12,
      paddingHorizontal: 16,
      borderRadius: theme.radii.md,
      borderWidth: 2,
      borderColor: theme.colors.primary,
      backgroundColor: theme.colors.backgroundMuted,
      marginBottom: 12,
      alignItems: "center",
    },
    accountTypeSelectedText: {
      ...theme.type.button,
      color: theme.colors.primary,
      fontFamily: theme.type.button.fontFamily,
    },
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
    inputFlex: { flex: 1, marginBottom: 0 },
    inputFocused: { borderColor: theme.colors.primary },
    passwordRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
    smallBtn: {
      borderWidth: 2,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
      paddingVertical: 12,
      paddingHorizontal: 12,
      borderRadius: theme.radii.md,
      minHeight: 44,
      justifyContent: "center",
    },
    smallBtnText: { ...theme.type.caption, color: theme.colors.primary, fontWeight: "600" },
    adultRow: { flexDirection: "row", alignItems: "center", marginBottom: 12 },
    adultText: { ...theme.type.caption, color: theme.colors.textSecondary, marginLeft: 10, flex: 1 },
    primaryBtn: {
      backgroundColor: theme.colors.primary,
      borderRadius: theme.radii.md,
      paddingVertical: 14,
      alignItems: "center",
      marginBottom: 8,
      minHeight: 44,
      justifyContent: "center",
      ...theme.elevation(2),
    },
    primaryBtnDisabled: { opacity: 0.7 },
    primaryText: { ...theme.type.button, color: theme.colors.onPrimary, fontFamily: theme.type.button.fontFamily },
    link: { color: theme.colors.primary, fontWeight: "600" },
    footerLink: { marginTop: 12, alignItems: "center", minHeight: 40, justifyContent: "center" },
    footerText: { ...theme.type.body, color: theme.colors.textSecondary },
    altTypeLink: { marginTop: 4, alignItems: "center", minHeight: 40, justifyContent: "center" },
    altTypeText: { ...theme.type.caption, color: theme.colors.primary, fontWeight: "600", textAlign: "center" },
  });
}
