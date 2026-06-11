// components/i18n/LanguageList.tsx
// Shared language option list for settings and onboarding.

import React, { useCallback, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useTranslation } from "react-i18next";
import { Colors, Typography, Layout } from "@/constants/tokens";
import {
  SUPPORTED_LANGUAGES,
  normalizeLanguageCode,
  setUserLanguage,
  type SupportedLanguageCode,
} from "@/lib/i18n";

type LanguageListProps = {
  onLanguageChanged?: (code: SupportedLanguageCode) => void;
};

export function LanguageList({ onLanguageChanged }: LanguageListProps) {
  const { i18n } = useTranslation();
  const currentCode = normalizeLanguageCode(i18n.language);
  const [saving, setSaving] = useState<string | null>(null);

  const onSelect = useCallback(
    async (code: string) => {
      if (code === currentCode) return;
      Haptics.selectionAsync();
      setSaving(code);
      try {
        await setUserLanguage(code);
        onLanguageChanged?.(code as SupportedLanguageCode);
      } finally {
        setSaving(null);
      }
    },
    [currentCode, onLanguageChanged]
  );

  return (
    <View style={styles.card}>
      {SUPPORTED_LANGUAGES.map(({ code, name }, idx) => {
        const isSelected = currentCode === code;
        const isSaving = saving === code;
        return (
          <TouchableOpacity
            key={code}
            onPress={() => void onSelect(code)}
            style={[styles.row, idx < SUPPORTED_LANGUAGES.length - 1 && styles.rowBorder]}
            activeOpacity={0.7}
            disabled={!!saving}
          >
            <Text style={styles.rowText}>{name}</Text>
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
  rowText: { ...Typography.body, flex: 1, color: Colors.textPrimary },
  checkPlaceholder: { width: 24, height: 24 },
});
