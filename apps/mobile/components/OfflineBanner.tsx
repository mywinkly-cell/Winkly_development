// apps/mobile/components/OfflineBanner.tsx
// Persistent, unobtrusive banner shown while the device is offline.

import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { Colors, FontFamily } from "@/constants/tokens";

export function OfflineBanner() {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();

  return (
    <View style={[styles.container, { paddingBottom: Math.max(insets.bottom, 8) }]} pointerEvents="none">
      <Text style={styles.text}>
        {t("offline.banner", "No internet connection. Some features are unavailable.")}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: Colors.softBlack,
    paddingTop: 10,
    paddingHorizontal: 16,
  },
  text: {
    color: Colors.white,
    fontFamily: FontFamily.body,
    fontSize: 13,
    lineHeight: 18,
    textAlign: "center",
  },
});
