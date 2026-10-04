// apps/mobile/components/ForceUpdateGate.tsx
//
// Blocks the app with a "Please update" screen when the installed native build is below the
// minimum in public.app_release_policy (raise it after shipping a breaking backend change).
// Never delays launch: children render immediately while the check runs, and any error or
// missing policy leaves the app open. Re-checks when the app returns to the foreground, which
// is also when a background EAS Update check runs (lib/release/otaUpdates.ts).

import React, { useEffect, useState } from "react";
import { AppState, Linking, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useTranslation } from "react-i18next";
import { Colors, Typography } from "@/constants/tokens";
import { checkForOtaUpdateInBackground } from "@/lib/release/otaUpdates";
import {
  defaultStoreUrl,
  fetchReleasePolicy,
  installedBuildNumber,
  isBuildBelowMinimum,
} from "@/lib/release/releasePolicy";

type Props = { children: React.ReactNode };

export function ForceUpdateGate({ children }: Props) {
  const { t } = useTranslation();
  const [storeUrl, setStoreUrl] = useState<string | null>(null);
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const check = () => {
      checkForOtaUpdateInBackground();
      fetchReleasePolicy().then((policy) => {
        if (cancelled || !policy) return;
        setBlocked(isBuildBelowMinimum(installedBuildNumber(), policy.minBuild));
        setStoreUrl(policy.storeUrl || defaultStoreUrl());
      });
    };
    check();
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") check();
    });
    return () => {
      cancelled = true;
      sub.remove();
    };
  }, []);

  if (!blocked) return <>{children}</>;

  return (
    <View style={styles.screen}>
      <Text style={styles.title} accessibilityRole="header">
        {t("forceUpdate.title")}
      </Text>
      <Text style={styles.body}>{t("forceUpdate.body")}</Text>
      {storeUrl ? (
        <TouchableOpacity
          style={styles.button}
          onPress={() => Linking.openURL(storeUrl).catch(() => {})}
          activeOpacity={0.9}
          accessibilityRole="button"
          accessibilityLabel={t("forceUpdate.cta")}
        >
          <Text style={styles.buttonText}>{t("forceUpdate.cta")}</Text>
        </TouchableOpacity>
      ) : (
        <Text style={styles.hint}>{t("forceUpdate.storeHint")}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, justifyContent: "center", padding: 24, gap: 12, backgroundColor: "#F9F7FB" },
  title: { ...Typography.h1, color: Colors.textPrimary ?? "#1C1C1E", textAlign: "center" },
  body: { ...Typography.body, color: Colors.textSecondary ?? "#555", textAlign: "center", lineHeight: 21 },
  hint: { ...Typography.caption, color: Colors.gray500 ?? "#8A8A8E", textAlign: "center", marginTop: 12 },
  button: {
    backgroundColor: Colors.primary ?? "#5A189A",
    borderRadius: 14, paddingVertical: 16, alignItems: "center", marginTop: 20,
  },
  buttonText: { color: "#FFFFFF", fontWeight: "700", fontSize: 16 },
});
