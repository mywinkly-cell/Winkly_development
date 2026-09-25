// apps/mobile/components/consent/PrivacyConsentGate.tsx
//
// Blocks its children until the signed-in user has accepted the current
// data-use notice (GDPR). Wrap the authenticated area of the app with it —
// see the wiring note at the bottom. While the consent status is loading it
// shows a spinner; if not yet accepted it shows the notice and an "I agree"
// button; once accepted (or after the user accepts) it renders children.
//
// Fails safe: any error reading the status leaves the gate closed (notice
// shown), never open.

import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Trans, useTranslation } from "react-i18next";
import { Colors, Typography } from "@/constants/tokens";
import {
  hasAcceptedPrivacyConsent,
  recordPrivacyConsent,
} from "@/lib/consent/privacyConsent";

type Props = { children: React.ReactNode };

export function PrivacyConsentGate({ children }: Props) {
  const { t } = useTranslation();
  const [status, setStatus] = useState<"loading" | "needed" | "granted">("loading");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const check = useCallback(async () => {
    try {
      const ok = await hasAcceptedPrivacyConsent();
      setStatus(ok ? "granted" : "needed");
    } catch {
      setStatus("needed"); // fail closed — show the notice
    }
  }, []);

  useEffect(() => {
    check();
  }, [check]);

  const onAgree = useCallback(async () => {
    setSubmitting(true);
    setError(null);
    const ok = await recordPrivacyConsent();
    setSubmitting(false);
    if (ok) setStatus("granted");
    else setError(t("consent.saveFailed"));
  }, [t]);

  if (status === "loading") {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={Colors.primary ?? "#5A189A"} />
      </View>
    );
  }

  if (status === "needed") {
    return (
      <View style={styles.screen}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <Text style={styles.title}>{t("consent.title")}</Text>
          <Text style={styles.lead}>{t("consent.lead")}</Text>

          <Text style={styles.h2}>{t("consent.collect.title")}</Text>
          <Text style={styles.body}>{t("consent.collect.body")}</Text>

          <Text style={styles.h2}>{t("consent.sensitive.title")}</Text>
          <Text style={styles.body}>{t("consent.sensitive.body")}</Text>

          <Text style={styles.h2}>{t("consent.ai.title")}</Text>
          <Text style={styles.body}>{t("consent.ai.body")}</Text>

          <Text style={styles.h2}>{t("consent.rights.title")}</Text>
          <Text style={styles.body}>
            <Trans
              i18nKey="consent.rights.body"
              components={{
                privacy: <Text style={styles.link} onPress={() => { /* link to https://mywinkly.de/privacy */ }} />,
              }}
            />
          </Text>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <TouchableOpacity
            style={[styles.agreeBtn, submitting && styles.agreeBtnDisabled]}
            onPress={onAgree}
            disabled={submitting}
            activeOpacity={0.9}
            accessibilityRole="button"
          >
            {submitting ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.agreeText}>{t("consent.agree")}</Text>
            )}
          </TouchableOpacity>
          <Text style={styles.fineprint}>{t("consent.fineprint")}</Text>
        </ScrollView>
      </View>
    );
  }

  return <>{children}</>;
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#F9F7FB" },
  screen: { flex: 1, backgroundColor: "#F9F7FB" },
  scroll: { padding: 24, paddingTop: 64, paddingBottom: 48, gap: 12 },
  title: { ...Typography.h1, color: Colors.textPrimary ?? "#1C1C1E", marginBottom: 4 },
  lead: { ...Typography.body, color: Colors.textSecondary ?? "#555", marginBottom: 8 },
  h2: { ...Typography.h3, color: Colors.textPrimary ?? "#1C1C1E", marginTop: 12 },
  body: { ...Typography.body, color: Colors.textSecondary ?? "#555", lineHeight: 21 },
  link: { color: Colors.primary ?? "#5A189A", fontWeight: "600" },
  error: { color: "#A81F1A", marginTop: 8 },
  agreeBtn: {
    backgroundColor: Colors.primary ?? "#5A189A",
    borderRadius: 14, paddingVertical: 16, alignItems: "center", marginTop: 20,
  },
  agreeBtnDisabled: { opacity: 0.6 },
  agreeText: { color: "#FFFFFF", fontWeight: "700", fontSize: 16 },
  fineprint: { ...Typography.caption, color: Colors.gray500 ?? "#8A8A8E", textAlign: "center", marginTop: 12 },
});

// ── Wiring (do this once, then QA on device) ────────────────────────────────
// Wrap the authenticated area so the gate sits AFTER sign-in but BEFORE any
// profile/onboarding screen. In apps/mobile/app/_layout.tsx, put it just inside
// the authed content, e.g. around the authed <Stack> (inside AuthProvider):
//
//   <PrivacyConsentGate>
//     {/* existing authed stack / RouteGuard / onboarding */}
//   </PrivacyConsentGate>
//
// It only affects signed-in users (hasAcceptedPrivacyConsent returns false when
// signed out, but the gate is meant to render inside the authed tree). Verify on
// device: a fresh account sees the notice before onboarding; after agreeing it
// never reappears; deleting the account and re-registering shows it again.
