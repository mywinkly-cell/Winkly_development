// apps/mobile/app/(auth)/signup.tsx
// Winkly Sign-up — Premium, modern, professional (SDK 54)

import React, { useMemo, useState, useRef } from "react";
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
import { AUTH_REDIRECT_URL } from "@/constants/config";

function isInvalidRefreshToken(err: unknown): boolean {
  const msg = String((err as any)?.message ?? "").toLowerCase();
  return msg.includes("refresh token") && (msg.includes("invalid") || msg.includes("not found"));
}

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

  const oauthReady = useMemo(() => {
    const googleAndroid = process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID;
    const googleIos = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
    const facebook = process.env.EXPO_PUBLIC_FACEBOOK_APP_ID;
    const googleReady = Platform.OS === "android" ? !!googleAndroid : Platform.OS === "ios" ? !!googleIos : false;
    return { googleReady, facebookReady: !!facebook, appleReady: Platform.OS === "ios" };
  }, []);

  const onSignup = async () => {
    const cleanEmail = email.trim();
    if (!cleanEmail || !password) {
      Alert.alert("Incomplete", "Please enter email and password.");
      return;
    }
    if (password.length < 8) {
      Alert.alert("Password too short", "Use at least 8 characters.");
      return;
    }
    if (!isAdult) {
      Alert.alert("Confirmation required", "Please confirm you are 18 or older.");
      return;
    }
    try {
      setLoading(true);
      const { error } = await supabase.auth.signUp({
        email: cleanEmail,
        password,
        options: { data: { account_type: accountType }, emailRedirectTo: AUTH_REDIRECT_URL },
      });
      if (error) throw error;
      await AsyncStorage.setItem("winkly_last_signup_email", cleanEmail);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace("/(auth)/verify");
    } catch (err: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      if (isInvalidRefreshToken(err)) {
        try { await signOut(); } catch { /* already cleared */ }
        Alert.alert("Session expired", "Your previous session has expired. Please sign in again or create a new account.");
      } else {
        const msg = String(err?.message ?? err ?? "").toLowerCase();
        const isExistingUser = msg.includes("already registered") || msg.includes("already exists") || msg.includes("user already");
        if (isExistingUser) {
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

  const handleOAuth = (type: string) => {
    Alert.alert("Coming soon", `${type} sign-up will be enabled after OAuth setup.`);
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
              <Text style={styles.title}>Create your account</Text>
              <Text style={styles.subtitle}>Join Winkly and start meaningful connections.</Text>

              <Text style={styles.label}>Account type</Text>
              <View style={styles.accountTypeRow}>
                <TouchableOpacity
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

              <View style={styles.dividerRow}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>or continue with</Text>
                <View style={styles.dividerLine} />
              </View>

              <View style={styles.oauthStack}>
                {oauthReady.googleReady && (
                  <TouchableOpacity onPress={() => handleOAuth("Google")} activeOpacity={0.85} style={styles.oauthBtnFull}>
                    <Image source={require("../../assets/icons/google.png")} style={styles.oauthIcon} />
                    <Text style={styles.oauthLabel}>Continue with Google</Text>
                  </TouchableOpacity>
                )}
                {oauthReady.facebookReady && (
                  <TouchableOpacity onPress={() => handleOAuth("Facebook")} activeOpacity={0.85} style={styles.oauthBtnFull}>
                    <Image source={require("../../assets/icons/facebook.png")} style={styles.oauthIcon} />
                    <Text style={styles.oauthLabel}>Continue with Facebook</Text>
                  </TouchableOpacity>
                )}
                {Platform.OS === "ios" && (
                  <TouchableOpacity onPress={() => handleOAuth("Apple")} activeOpacity={0.85} style={styles.oauthBtnFull}>
                    <Image source={require("../../assets/icons/apple.png")} style={styles.oauthIcon} />
                    <Text style={styles.oauthLabel}>Continue with Apple</Text>
                  </TouchableOpacity>
                )}
              </View>

              <Text style={styles.legal}>
                By continuing, you agree to Winkly's <Text style={styles.link}>Terms</Text> & <Text style={styles.link}>Privacy Policy</Text>.
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

  title: { fontFamily: FontFamily.heading, fontSize: 24, lineHeight: 32, color: Colors.textPrimary, marginBottom: 8 },
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
  accountTypeTextActive: { color: Colors.primaryViolet, fontFamily: FontFamily.heading },

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
  primaryText: { ...Typography.button, color: Colors.accentYellow, fontFamily: FontFamily.heading },

  dividerRow: { flexDirection: "row", alignItems: "center", marginBottom: 16 },
  dividerLine: { flex: 1, height: 1, backgroundColor: Colors.gray200 },
  dividerText: { ...Typography.caption, color: Colors.gray600, marginHorizontal: 12 },

  oauthStack: { gap: 12 },
  oauthBtnFull: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: Layout.radii.control,
    borderWidth: 1,
    borderColor: Colors.gray200,
    backgroundColor: Colors.white,
    minHeight: Layout.touchTargetMin,
  },
  oauthIcon: { width: 20, height: 20, marginRight: 12 },
  oauthLabel: { ...Typography.button, color: Colors.textPrimary },

  legal: { ...Typography.caption, color: Colors.gray500, textAlign: "center", marginTop: 16, lineHeight: 20 },
  link: { color: Colors.primaryViolet, fontWeight: "600" },

  footerLink: { marginTop: 24, alignItems: "center", minHeight: 44, justifyContent: "center" },
  footerText: { ...Typography.body, color: Colors.gray600 },
});
