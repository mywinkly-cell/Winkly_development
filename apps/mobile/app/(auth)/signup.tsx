// apps/mobile/app/(auth)/signup.tsx
// Winkly Sign-up — Premium, modern, professional (SDK 54)

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
  Switch,
  Image,
  StyleSheet,
  Animated,
} from "react-native";
import { SafeScreenView } from "@/components/SafeScreenView";
import * as Haptics from "expo-haptics";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter, useLocalSearchParams } from "expo-router";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/providers/AuthProvider";
import { Colors, Typography, Layout, FontFamily, Shadow } from "@/constants/tokens";
import { getEmailRedirectTo } from "@/lib/authRedirectUrl";
import {
  isExistingUserError,
  isInvalidRefreshToken,
  validateSignupInput,
} from "@/lib/auth/formValidation";
import { getTermsAndCookiesAccepted } from "@/lib/legalFlags";
import { markHasAccount } from "@/lib/lastActivity";
import { trackAccountCreated } from "@/lib/analytics/events";

export default function Signup() {
  const router = useRouter();
  const params = useLocalSearchParams<{ accountType?: string }>();
  const { signOut } = useAuth();
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

  const onSignup = async () => {
    const validation = validateSignupInput({ email, password, isAdult });
    if (!validation.ok) {
      Alert.alert(validation.title, validation.message);
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
        Alert.alert("Session expired", "Your previous session has expired. Please sign in again or create a new account.");
      } else {
        if (isExistingUserError(err)) {
          Alert.alert(
            "Account exists",
            "A user with this email already exists. Please sign in or use a different email.",
            [{ text: "Sign in", onPress: () => router.replace("/(auth)/signin") }, { text: "OK" }]
          );
        } else {
          Alert.alert("Error", err?.message ?? "Something went wrong. Please try again.");
        }
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

            <View style={styles.card} testID="signup-screen">
              <Text style={styles.title}>Create your account</Text>
              <Text style={styles.subtitle}>Join Winkly and start meaningful connections.</Text>

              <Text style={styles.label}>Account type</Text>
              <View style={styles.accountTypeRow}>
                <TouchableOpacity
                  testID="signup-account-personal"
                  onPress={() => { setAccountType("personal"); Haptics.selectionAsync(); }}
                  style={[styles.accountTypeBtn, accountType === "personal" && styles.accountTypeActive]}
                >
                  <Text style={[styles.accountTypeText, accountType === "personal" && styles.accountTypeTextActive]}>Personal</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => { setAccountType("business"); Haptics.selectionAsync(); }}
                  style={[styles.accountTypeBtn, accountType === "business" && styles.accountTypeActive]}
                >
                  <Text style={[styles.accountTypeText, accountType === "business" && styles.accountTypeTextActive]}>Business</Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.label}>Email</Text>
              <TextInput
                testID="signup-email"
                placeholder="name@example.com"
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

              <Text style={styles.label}>Password</Text>
              <View style={styles.passwordRow}>
                <TextInput
                  testID="signup-password"
                  placeholder="Use device password manager for a strong password"
                  placeholderTextColor={Colors.gray500}
                  value={password}
                  onChangeText={setPassword}
                  onFocus={() => setPasswordFocused(true)}
                  onBlur={() => setPasswordFocused(false)}
                  secureTextEntry={!showPwd}
                  textContentType="newPassword"
                  autoComplete="password-new"
                  style={[styles.input, styles.inputFlex, passwordFocused && styles.inputFocused]}
                />
                <TouchableOpacity onPress={() => setShowPwd((v) => !v)} style={styles.smallBtn} activeOpacity={0.85}>
                  <Text style={styles.smallBtnText}>{showPwd ? "Hide" : "Show"}</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.adultRow}>
                <Switch
                  value={isAdult}
                  onValueChange={setIsAdult}
                  thumbColor={Platform.OS === "android" ? (isAdult ? Colors.primaryViolet : Colors.gray400) : undefined}
                  trackColor={{ false: Colors.gray300, true: Colors.primaryViolet }}
                  ios_backgroundColor={Colors.gray300}
                />
                <Text style={styles.adultText}>I confirm I am 18+ and agree to the Terms.</Text>
              </View>

              <TouchableOpacity
                testID="signup-submit"
                onPress={onSignup}
                disabled={loading}
                activeOpacity={0.85}
                style={[styles.primaryBtn, loading && styles.primaryBtnDisabled]}
              >
                {loading ? (
                  <ActivityIndicator color={Colors.accentYellow} />
                ) : (
                  <Text style={styles.primaryText}>Create account</Text>
                )}
              </TouchableOpacity>

              <Text style={styles.oauthComingSoonNote}>
                Social sign-in coming soon — use email for now.
              </Text>

              <Text style={styles.legal}>
                By continuing, you agree to Winkly&apos;s <Text style={styles.link}>Terms</Text> & <Text style={styles.link}>Privacy Policy</Text>.
              </Text>

              <TouchableOpacity onPress={() => router.replace("/(auth)/signin")} style={styles.footerLink}>
                <Text style={styles.footerText}>
                  Already have an account? <Text style={styles.link}>Sign in</Text>
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
  accountTypeRow: { flexDirection: "row", gap: 12, marginBottom: 16 },
  accountTypeBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: Layout.radii.control,
    borderWidth: 2,
    borderColor: Colors.gray200,
    backgroundColor: Colors.white,
    alignItems: "center",
    minHeight: Layout.touchTargetMin,
    justifyContent: "center",
  },
  accountTypeActive: { borderColor: Colors.primaryViolet, backgroundColor: Colors.backgroundMuted },
  accountTypeText: { ...Typography.button, color: Colors.textSecondary },
  accountTypeTextActive: { color: Colors.primaryViolet, fontFamily: FontFamily.headingBold },

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
  inputFlex: { flex: 1, marginBottom: 0 },
  inputFocused: { borderColor: Colors.primaryViolet },

  passwordRow: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 8 },
  smallBtn: {
    borderWidth: 2,
    borderColor: Colors.gray200,
    backgroundColor: Colors.white,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: Layout.radii.control,
    minHeight: Layout.touchTargetMin,
    justifyContent: "center",
  },
  smallBtnText: { ...Typography.caption, color: Colors.primaryViolet, fontWeight: "600" },


  adultRow: { flexDirection: "row", alignItems: "center", marginBottom: 24 },
  adultText: { ...Typography.caption, color: Colors.gray600, marginLeft: 12, flex: 1 },

  primaryBtn: {
    backgroundColor: Colors.primaryViolet,
    borderRadius: Layout.radii.control,
    paddingVertical: 16,
    alignItems: "center",
    marginBottom: 24,
    minHeight: Layout.touchTargetMin,
    justifyContent: "center",
    ...Shadow.button,
  },
  primaryBtnDisabled: { opacity: 0.7 },
  primaryText: { ...Typography.button, color: Colors.accentYellow, fontFamily: FontFamily.headingBold },

  oauthComingSoonNote: {
    ...Typography.caption,
    color: Colors.gray600,
    textAlign: "center",
    marginTop: 8,
    marginBottom: 4,
    lineHeight: 20,
  },

  legal: { ...Typography.caption, color: Colors.gray500, textAlign: "center", marginTop: 16, lineHeight: 20 },
  link: { color: Colors.primaryViolet, fontWeight: "600" },

  footerLink: { marginTop: 24, alignItems: "center", minHeight: 44, justifyContent: "center" },
  footerText: { ...Typography.body, color: Colors.gray600 },
});
