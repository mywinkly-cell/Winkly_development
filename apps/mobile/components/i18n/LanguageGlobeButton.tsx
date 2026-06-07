// components/i18n/LanguageGlobeButton.tsx
// Globe icon — opens language picker (onboarding + anywhere pre-settings).

import React, { useState } from "react";
import { TouchableOpacity, Text, View, ScrollView, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useTranslation } from "react-i18next";
import { Modal } from "@/components/ui/Modal";
import { Colors, Typography, Layout, FontFamily, HEADER } from "@/constants/tokens";
import { LanguageList } from "@/components/i18n/LanguageList";

type LanguageGlobeButtonProps = {
  /** Called after the user picks a new language. */
  onLanguageChanged?: () => void;
};

export function LanguageGlobeButton({ onLanguageChanged }: LanguageGlobeButtonProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  return (
    <>
      <TouchableOpacity
        onPress={() => {
          Haptics.selectionAsync();
          setOpen(true);
        }}
        style={styles.globeBtn}
        activeOpacity={0.85}
        accessibilityLabel={t("language.changeLanguage")}
        accessibilityRole="button"
      >
        <Ionicons name="globe-outline" size={HEADER.iconSize} color={Colors.primaryViolet} />
      </TouchableOpacity>

      <Modal visible={open} onClose={() => setOpen(false)} closeOnBackdropPress>
        <View style={styles.sheet}>
          <Text style={styles.sheetTitle}>{t("language.title")}</Text>
          <Text style={styles.sheetSubtitle}>{t("language.subtitle")}</Text>
          <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
            <LanguageList
              onLanguageChanged={() => {
                onLanguageChanged?.();
                setOpen(false);
              }}
            />
          </ScrollView>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  globeBtn: {
    width: HEADER.buttonSize,
    height: HEADER.buttonSize,
    borderRadius: HEADER.buttonRadius,
    backgroundColor: Colors.white,
    borderWidth: 2,
    borderColor: Colors.gray200,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
  },
  sheet: {
    maxHeight: 420,
    paddingBottom: 8,
  },
  sheetTitle: {
    ...Typography.h3,
    fontFamily: FontFamily.headingBold,
    color: Colors.textPrimary,
    marginBottom: 6,
  },
  sheetSubtitle: {
    ...Typography.caption,
    color: Colors.gray600,
    marginBottom: 12,
    lineHeight: 18,
  },
  scroll: { maxHeight: 320 },
});
