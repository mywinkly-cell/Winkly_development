// apps/mobile/app/(auth)/terms-cookies.tsx
// Terms & Conditions and Cookie consent — shown on first use before sign-up/sign-in.
// Premium UI; acceptance required to continue.

import React, { useEffect, useState, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Linking,
  StyleSheet,
  Animated,
} from "react-native";
import { SafeScreenView } from "@/components/SafeScreenView";
import * as Haptics from "expo-haptics";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Colors, Typography, Layout, FontFamily, Shadow } from "@/constants/tokens";
import { getTermsAndCookiesAccepted, setTermsAndCookiesAccepted } from "@/lib/legalFlags";

const TERMS_URL = "https://winkly.app/terms";
const PRIVACY_URL = "https://winkly.app/privacy";
const COOKIES_URL = "https://winkly.app/privacy#cookies";

export default function TermsCookiesScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ next?: string }>();
  const next = params.next === "signin" ? "/(auth)/signin" : params.next === "signup" ? "/(auth)/signup" : "/(onboarding-personal)/get-started";

  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [acceptedCookies, setAcceptedCookies] = useState(false);
  const [loading, setLoading] = useState(true);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    getTermsAndCookiesAccepted().then((accepted) => {
      setLoading(false);
      if (accepted) router.replace(next as any);
    });
  }, [next]);

  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }).start();
  }, [fadeAnim]);

  const openUrl = (url: string) => {
    Haptics.selectionAsync();
    Linking.openURL(url).catch(() => {});
  };

  const handleAccept = async () => {
    if (!acceptedTerms || !acceptedCookies) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await setTermsAndCookiesAccepted();
    router.replace(next as any);
  };

  const canAccept = acceptedTerms && acceptedCookies;

  if (loading) return null;

  return (
    <SafeScreenView style={styles.safe}>
      <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.iconWrap}>
            <Ionicons name="document-text" size={48} color={Colors.primaryViolet} />
          </View>
          <Text style={styles.title}>Terms & Conditions</Text>
          <Text style={styles.subtitle}>
            To use Winkly, please read and accept our Terms of Service and our use of cookies. You can review our Privacy Policy and Data protection information at any time in Settings → Support & legal → Legal.
          </Text>

          <TouchableOpacity
            onPress={() => {
              Haptics.selectionAsync();
              setAcceptedTerms((v) => !v);
            }}
            style={styles.checkRow}
            activeOpacity={0.8}
          >
            <View style={[styles.checkbox, acceptedTerms && styles.checkboxChecked]}>
              {acceptedTerms && <Ionicons name="checkmark" size={18} color={Colors.white} />}
            </View>
            <Text style={styles.checkLabel}>
              I have read and accept the{" "}
              <Text style={styles.link} onPress={() => openUrl(TERMS_URL)}>Terms of Service</Text>
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => {
              Haptics.selectionAsync();
              setAcceptedCookies((v) => !v);
            }}
            style={styles.checkRow}
            activeOpacity={0.8}
          >
            <View style={[styles.checkbox, acceptedCookies && styles.checkboxChecked]}>
              {acceptedCookies && <Ionicons name="checkmark" size={18} color={Colors.white} />}
            </View>
            <Text style={styles.checkLabel}>
              I accept the use of cookies and similar technologies as described in our{" "}
              <Text style={styles.link} onPress={() => openUrl(COOKIES_URL)}>Cookie notice</Text> and{" "}
              <Text style={styles.link} onPress={() => openUrl(PRIVACY_URL)}>Privacy Policy</Text>
            </Text>
          </TouchableOpacity>

          <View style={styles.footerSpacer} />
        </ScrollView>

        <View style={styles.footer}>
          <TouchableOpacity
            onPress={handleAccept}
            style={[styles.cta, !canAccept && styles.ctaDisabled]}
            activeOpacity={0.9}
            disabled={!canAccept}
          >
            <Text style={[styles.ctaText, !canAccept && styles.ctaTextDisabled]}>
              Accept and continue
            </Text>
          </TouchableOpacity>
        </View>
      </Animated.View>
    </SafeScreenView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.backgroundMuted },
  container: { flex: 1, paddingHorizontal: 24, paddingTop: 16, paddingBottom: 24 },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 24 },
  iconWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.primaryViolet + "18",
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    marginBottom: 20,
  },
  title: {
    fontFamily: FontFamily.heading,
    fontSize: 26,
    lineHeight: 34,
    color: Colors.textPrimary,
    textAlign: "center",
    marginBottom: 12,
  },
  subtitle: {
    ...Typography.body,
    color: Colors.gray600,
    lineHeight: 24,
    marginBottom: 28,
    textAlign: "center",
  },
  checkRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 16,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: Colors.gray400,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
    marginTop: 2,
  },
  checkboxChecked: {
    backgroundColor: Colors.primaryViolet,
    borderColor: Colors.primaryViolet,
  },
  checkLabel: {
    ...Typography.body,
    color: Colors.textPrimary,
    flex: 1,
    lineHeight: 22,
  },
  link: {
    color: Colors.primaryViolet,
    fontWeight: "600",
  },
  footerSpacer: { height: 16 },
  footer: { paddingTop: 16 },
  cta: {
    backgroundColor: Colors.primaryViolet,
    borderRadius: Layout.radii.control,
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 52,
    ...Shadow.button,
  },
  ctaDisabled: {
    backgroundColor: Colors.gray300,
    opacity: 0.9,
  },
  ctaText: {
    ...Typography.button,
    color: Colors.accentYellow,
    fontFamily: FontFamily.heading,
  },
  ctaTextDisabled: {
    color: Colors.gray500,
  },
});
