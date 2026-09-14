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
import { useTranslation } from "react-i18next";
import { useAppTheme, type AppTheme } from "@/constants/design-system";
import { getTermsAndCookiesAccepted, setTermsAndCookiesAccepted } from "@/lib/legalFlags";
import { LanguageGlobeButton } from "@/components/i18n/LanguageGlobeButton";

const TERMS_URL = "https://mywinkly.de/terms";
const PRIVACY_URL = "https://mywinkly.de/privacy";
const COOKIES_URL = "https://mywinkly.de/privacy#cookies";

export default function TermsCookiesScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const theme = useAppTheme();
  const styles = createStyles(theme);
  const params = useLocalSearchParams<{ next?: string }>();
  const next =
    params.next === "signin"
      ? "/(auth)/signin"
      : params.next === "signup"
        ? "/(auth)/signup"
        : params.next === "callback"
          ? "/(auth)/callback"
          : "/(onboarding-personal)/get-started";

  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [acceptedCookies, setAcceptedCookies] = useState(false);
  const [loading, setLoading] = useState(true);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    getTermsAndCookiesAccepted().then((accepted) => {
      setLoading(false);
      if (accepted) router.replace(next as any);
    });
  }, [next, router]);

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
      <View style={styles.topBar}>
        <View style={styles.topBarSide} />
        <Text style={styles.topBarTitle}>Winkly</Text>
        <View style={[styles.topBarSide, styles.topBarSideEnd]}>
          <LanguageGlobeButton />
        </View>
      </View>
      <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.iconWrap}>
            <Ionicons name="document-text" size={48} color={theme.colors.primary} />
          </View>
          <Text style={styles.title}>{t("legal.termsTitle")}</Text>
          <Text style={styles.subtitle}>{t("legal.termsSubtitle")}</Text>

          <TouchableOpacity
            onPress={() => {
              Haptics.selectionAsync();
              setAcceptedTerms((v) => !v);
            }}
            style={styles.checkRow}
            activeOpacity={0.8}
          >
            <View style={[styles.checkbox, acceptedTerms && styles.checkboxChecked]}>
              {acceptedTerms && <Ionicons name="checkmark" size={18} color={theme.colors.onPrimary} />}
            </View>
            <Text style={styles.checkLabel}>
              {t("legal.acceptTermsPrefix")}{" "}
              <Text style={styles.link} onPress={() => openUrl(TERMS_URL)}>
                {t("legal.termsOfService")}
              </Text>
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
              {acceptedCookies && <Ionicons name="checkmark" size={18} color={theme.colors.onPrimary} />}
            </View>
            <Text style={styles.checkLabel}>
              {t("legal.acceptCookiesPrefix")}{" "}
              <Text style={styles.link} onPress={() => openUrl(COOKIES_URL)}>
                {t("legal.cookieNotice")}
              </Text>{" "}
              {t("legal.and")}{" "}
              <Text style={styles.link} onPress={() => openUrl(PRIVACY_URL)}>
                {t("legal.privacyPolicy")}
              </Text>
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
              {t("legal.acceptAndContinue")}
            </Text>
          </TouchableOpacity>
        </View>
      </Animated.View>
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
    container: { flex: 1, paddingHorizontal: 24, paddingTop: 16, paddingBottom: 24 },
    scroll: { flex: 1 },
    scrollContent: { paddingBottom: 24 },
    iconWrap: {
      width: 80,
      height: 80,
      borderRadius: 40,
      backgroundColor: theme.colors.primary + "18",
      alignItems: "center",
      justifyContent: "center",
      alignSelf: "center",
      marginBottom: 20,
    },
    title: {
      fontFamily: theme.type.h1.fontFamily,
      fontSize: 26,
      lineHeight: 34,
      color: theme.colors.textPrimary,
      textAlign: "center",
      marginBottom: 12,
    },
    subtitle: {
      ...theme.type.body,
      color: theme.colors.textSecondary,
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
      borderColor: theme.colors.textMuted,
      alignItems: "center",
      justifyContent: "center",
      marginRight: 12,
      marginTop: 2,
    },
    checkboxChecked: {
      backgroundColor: theme.colors.primary,
      borderColor: theme.colors.primary,
    },
    checkLabel: {
      ...theme.type.body,
      color: theme.colors.textPrimary,
      flex: 1,
      lineHeight: 22,
    },
    link: {
      color: theme.colors.primary,
      fontWeight: "600",
    },
    footerSpacer: { height: 16 },
    footer: { paddingTop: 16 },
    cta: {
      backgroundColor: theme.colors.primary,
      borderRadius: theme.radii.md,
      paddingVertical: 16,
      alignItems: "center",
      justifyContent: "center",
      minHeight: 52,
      ...theme.elevation(2),
    },
    ctaDisabled: {
      backgroundColor: theme.colors.border,
      opacity: 0.9,
    },
    ctaText: {
      ...theme.type.button,
      color: theme.colors.onPrimary,
      fontFamily: theme.type.button.fontFamily,
    },
    ctaTextDisabled: {
      color: theme.colors.textMuted,
    },
  });
}
