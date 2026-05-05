// apps/mobile/app/account/language.tsx
// Winkly — App language selection
// Entry: Notifications & Preferences → Language

import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { SafeScreenView } from "@/components/SafeScreenView";
import { Colors, Typography, Layout, FontFamily } from "@/constants/tokens";
import {
  SUPPORTED_LANGUAGES,
  changeLanguage,
  type SupportedLanguageCode,
} from "@/lib/i18n";

export default function LanguageScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const currentCode = (i18n.language ?? "en") as SupportedLanguageCode;
  const [saving, setSaving] = useState<string | null>(null);

  const onSelect = useCallback(
    async (code: string) => {
      if (code === currentCode) return;
      Haptics.selectionAsync();
      setSaving(code);
      try {
        await changeLanguage(code);
      } finally {
        setSaving(null);
      }
    },
    [currentCode]
  );

  return (
    <SafeScreenView style={styles.screen}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => {
            Haptics.selectionAsync();
            router.back();
          }}
          style={styles.backBtn}
          activeOpacity={0.8}
          accessibilityLabel={t("common.back")}
        >
          <Ionicons name="arrow-back" size={24} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t("language.title")}</Text>
        <View style={styles.placeholder} />
      </View>

      <Text style={styles.subtitle}>{t("language.subtitle")}</Text>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.card}>
          {SUPPORTED_LANGUAGES.map(({ code, name }, idx) => {
            const isSelected = currentCode === code;
            const isSaving = saving === code;
            return (
              <TouchableOpacity
                key={code}
                onPress={() => onSelect(code)}
                style={[styles.row, idx < SUPPORTED_LANGUAGES.length - 1 && styles.rowBorder]}
                activeOpacity={0.7}
                disabled={!!saving}
              >
                <Text style={styles.rowText}>{name}</Text>
                {isSelected && !isSaving && (
                  <Ionicons name="checkmark-circle" size={24} color={Colors.primaryViolet} />
                )}
                {isSaving && (
                  <ActivityIndicator size="small" color={Colors.primaryViolet} />
                )}
                {!isSelected && !isSaving && <View style={styles.checkPlaceholder} />}
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>
    </SafeScreenView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.backgroundMuted },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    ...Layout.topHeaderBar,
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray200,
  },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.gray100,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#1C1C1E",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
  },
  headerTitle: { ...Typography.headerTitle, fontFamily: FontFamily.heading, color: Colors.textPrimary },
  placeholder: { width: 40 },
  subtitle: {
    ...Typography.body,
    color: Colors.gray600,
    paddingHorizontal: Layout.screenPadding,
    paddingTop: 12,
    paddingBottom: 8,
  },
  scroll: { flex: 1 },
  scrollContent: { padding: Layout.screenPadding, paddingBottom: 40 },
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
