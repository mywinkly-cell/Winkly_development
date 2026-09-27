// components/i18n/LanguageList.tsx
// Shared language option list for settings and onboarding.

import React, { useCallback, useEffect, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useTranslation } from "react-i18next";
import { Colors, Typography, Layout } from "@/constants/tokens";
import {
  SUPPORTED_LANGUAGES,
  followDeviceLanguage,
  getDeviceLanguage,
  hasExplicitLanguageChoice,
  normalizeLanguageCode,
  setUserLanguage,
  type SupportedLanguageCode,
} from "@/lib/i18n";

const DEVICE = "device";

type LanguageListProps = {
  onLanguageChanged?: (code: SupportedLanguageCode) => void;
};

export function LanguageList({ onLanguageChanged }: LanguageListProps) {
  const { t, i18n } = useTranslation();
  const currentCode = normalizeLanguageCode(i18n.language);
  const deviceCode = getDeviceLanguage();
  const deviceName = SUPPORTED_LANGUAGES.find((l) => l.code === deviceCode)?.name ?? deviceCode;
  // null until loaded: no checkmark flicker between "Device default" and the language row.
  const [followsDevice, setFollowsDevice] = useState<boolean | null>(null);
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void hasExplicitLanguageChoice().then((explicit) => {
      if (!cancelled) setFollowsDevice(!explicit);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const onSelect = useCallback(
    async (code: string) => {
      const selected = followsDevice ? DEVICE : currentCode;
      if (code === selected) return;
      Haptics.selectionAsync();
      setSaving(code);
      try {
        if (code === DEVICE) {
          await followDeviceLanguage();
          setFollowsDevice(true);
          onLanguageChanged?.(deviceCode);
        } else {
          await setUserLanguage(code);
          setFollowsDevice(false);
          onLanguageChanged?.(code as SupportedLanguageCode);
        }
      } finally {
        setSaving(null);
      }
    },
    [currentCode, deviceCode, followsDevice, onLanguageChanged]
  );

  const rows = [
    { code: DEVICE, name: t("language.deviceDefault"), detail: deviceName },
    ...SUPPORTED_LANGUAGES.map(({ code, name }) => ({ code, name, detail: null as string | null })),
  ];

  return (
    <View style={styles.card}>
      {rows.map(({ code, name, detail }, idx) => {
        const isSelected =
          followsDevice !== null && (code === DEVICE ? followsDevice : !followsDevice && currentCode === code);
        const isSaving = saving === code;
        return (
          <TouchableOpacity
            key={code}
            onPress={() => void onSelect(code)}
            style={[styles.row, idx < rows.length - 1 && styles.rowBorder]}
            activeOpacity={0.7}
            disabled={!!saving}
            accessibilityRole="button"
            accessibilityState={{ selected: isSelected }}
          >
            <View style={styles.rowLabel}>
              <Text style={styles.rowText}>{name}</Text>
              {detail ? <Text style={styles.rowDetail}>{detail}</Text> : null}
            </View>
            {isSelected && !isSaving ? (
              <Ionicons name="checkmark-circle" size={24} color={Colors.primaryViolet} />
            ) : null}
            {isSaving ? <ActivityIndicator size="small" color={Colors.primaryViolet} /> : null}
            {!isSelected && !isSaving ? <View style={styles.checkPlaceholder} /> : null}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.white,
    borderRadius: Layout.radii.card,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  rowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray200,
  },
  rowLabel: { flex: 1 },
  rowText: { ...Typography.body, color: Colors.textPrimary },
  rowDetail: { ...Typography.caption, color: Colors.textSecondary, marginTop: 2 },
  checkPlaceholder: { width: 24, height: 24 },
});
