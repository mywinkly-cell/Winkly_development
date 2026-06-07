// apps/mobile/app/(auth)/signin.tsx
// Winkly Sign-in — Premium, modern, professional (SDK 54)

import React, { useState, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Alert,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Image,
  StyleSheet,
  Animated,
} from "react-native";
import { SafeScreenView } from "@/components/SafeScreenView";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/providers/AuthProvider";
import { Routes } from "@/constants/routes";
import { Colors, Typography, Layout, FontFamily, Shadow } from "@/constants/tokens";
import { useTranslation } from "react-i18next";
import { isInvalidRefreshToken, validateSigninInput } from "@/lib/auth/formValidation";
import { getTermsAndCookiesAccepted } from "@/lib/legalFlags";
import { hasKnownAccount, markHasAccount, recordLastActivity } from "@/lib/lastActivity";

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
      const { data: userData, error: userErr } = await supabase.auth.getUser();
      if (userErr) throw userErr;
      const accountType = userData?.user?.user_metadata?.account_type as string | undefined;
      await markHasAccount();
      await recordLastActivity();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      if (userData?.user?.email_confirmed_at) {
        const userId = userData.user.id;
        if (accountType === "business") {
          const { data: bp } = await supabase.from("business_profiles").select("business_name").or(`id.eq.${userId},user_id.eq.${userId}`).limit(1).maybeSingle();
          const hasBusinessProfile = !!(bp as any)?.business_name?.trim?.();
          router.replace(hasBusinessProfile ? Routes.modeSelection : "/(auth)/welcome-back-setup");
        } else {
          const { data: up } = await supabase.from("user_profiles").select("first_name, last_name, gender, birthday, city, core_photos").eq("id", userId).maybeSingle();
          const u = up as any;
          const hasCoreProfile = !!(u?.first_name?.trim?.() && u?.last_name?.trim?.() && u?.gender?.trim?.() && u?.birthday && u?.city?.trim?.());
          const hasPhoto = Array.isArray(u?.core_photos) ? u.core_photos.filter(Boolean).length > 0 : false;
          const profileComplete = hasCoreProfile && hasPhoto;
          router.replace(profileComplete ? Routes.modeSelection : "/(auth)/welcome-back-setup");
        }
      } else {
        router.replace("/(auth)/verify");
      }
    } catch (err: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      if (isInvalidRefreshToken(err)) {
        try { await signOut(); } catch { /* already cleared */ }
        Alert.alert(t("auth.sessionExpired"), t("auth.sessionExpiredMessage"));
      } else {
        Alert.alert(t("common.error"), err?.message ?? "Unknown error");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeScreenView style={styles.safe}>
      <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <Animated.View style={[styles.inner, { opacity: fadeAnim }]}>
            <View style={styles.header}>
              <Image source={require("../../assets/icons/winkly-logo.png")} resizeMode="contain" style={styles.wordmark} />
            </View>

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
              <TouchableOpacity onPress={() => router.push("/(auth)/reset-confirm")} style={styles.resetLinkSecondary}>
                <Text style={styles.resetTextSecondary}>Already have a reset link?</Text>
              </TouchableOpacity>

              <Text style={styles.oauthComingSoonNote}>
                Social sign-in coming soon — use email for now.
              </Text>

              <TouchableOpacity onPress={() => router.replace("/(onboarding-personal)/get-started")} style={styles.footerLink}>
                <Text style={styles.footerText}>
                  {t("auth.noAccount")} <Text style={styles.link}>{t("auth.signup")}</Text>
                </Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeScreenView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.backgroundMuted },
  screen: { flex: 1, backgroundColor: Colors.backgroundMuted },
  scroll: { flexGrow: 1, justifyContent: "center", padding: Layout.spacing.lg, paddingBottom: 40 },
  inner: { alignItems: "center" },
  header: { alignItems: "center", marginBottom: Layout.spacing.lg },
  wordmark: { width: 190, height: 60 },

  card: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: Colors.white,
    borderRadius: Layout.radii.card,
    padding: Layout.spacing.xl,
    ...Shadow.card,
  },

  title: { fontFamily: FontFamily.headingBold, fontSize: 24, lineHeight: 32, color: Colors.textPrimary, marginBottom: 8 },
  subtitle: { ...Typography.body, color: Colors.textSecondary, marginBottom: 24 },

  label: { ...Typography.caption, color: Colors.textSecondary, marginBottom: 8 },
  input: {
    borderWidth: 2,
    borderColor: Colors.gray200,
    backgroundColor: Colors.white,
    borderRadius: Layout.radii.control,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 16,
    color: Colors.textPrimary,
    fontSize: 16,
    minHeight: Layout.touchTargetMin,
  },
  inputFocused: { borderColor: Colors.primaryViolet },

  primaryBtn: {
    backgroundColor: Colors.primaryViolet,
    borderRadius: Layout.radii.control,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 8,
    marginBottom: 16,
    minHeight: Layout.touchTargetMin,
    justifyContent: "center",
    ...Shadow.button,
  },
  primaryBtnDisabled: { opacity: 0.7 },
  primaryText: { ...Typography.button, color: Colors.accentYellow, fontFamily: FontFamily.headingBold },

  resetLink: { alignItems: "center", marginBottom: 8, minHeight: 44, justifyContent: "center" },
  resetText: { ...Typography.caption, color: Colors.primaryViolet },
  resetLinkSecondary: { alignItems: "center", marginBottom: 16, minHeight: 44, justifyContent: "center" },
  resetTextSecondary: { ...Typography.caption, color: Colors.gray600, fontSize: 13 },

  oauthComingSoonNote: {
    ...Typography.caption,
    color: Colors.gray600,
    textAlign: "center",
    marginBottom: 8,
    lineHeight: 20,
  },

  footerLink: { marginTop: 16, alignItems: "center", minHeight: 44, justifyContent: "center" },
  footerText: { ...Typography.body, color: Colors.gray600 },
  link: { color: Colors.primaryViolet, fontWeight: "600" },
});
