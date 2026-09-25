import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { Colors, Typography, Layout, FontFamily, Shadow } from "@/constants/tokens";

type BusinessHomeEmptyStateProps = {
  onEditProfile: () => void;
  onExploreDiscover?: () => void;
};

export function BusinessHomeEmptyState({ onEditProfile, onExploreDiscover }: BusinessHomeEmptyStateProps) {
  const { t } = useTranslation();
  const accent = Colors.business.primary;
  const softBg = Colors.business.secondary;

  return (
    <View style={styles.container}>
      <View style={[styles.iconWrap, { backgroundColor: softBg }]}>
        <Ionicons name="business-outline" size={36} color={accent} />
      </View>

      <Text style={styles.title}>{t("emptyStates.businessHome.title")}</Text>
      <Text style={styles.body}>{t("emptyStates.businessHome.body")}</Text>

      <Pressable
        onPress={onEditProfile}
        style={({ pressed }) => [
          styles.primaryBtn,
          { backgroundColor: accent },
          pressed && styles.primaryBtnPressed,
        ]}
        accessibilityLabel={t("emptyStates.businessHome.completeA11y")}
      >
        <Ionicons name="create-outline" size={20} color={Colors.white} />
        <Text style={styles.primaryBtnText}>{t("emptyStates.businessHome.complete")}</Text>
      </Pressable>

      {onExploreDiscover ? (
        <Pressable
          onPress={onExploreDiscover}
          style={({ pressed }) => [styles.secondaryBtn, pressed && styles.secondaryBtnPressed]}
          accessibilityLabel={t("emptyStates.businessHome.explore")}
        >
          <Text style={[styles.secondaryBtnText, { color: accent }]}>{t("emptyStates.businessHome.explore")}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Layout.spacing.xl,
    paddingVertical: Layout.spacing.lg,
    minHeight: 280,
  },
  iconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Layout.spacing.lg,
  },
  title: {
    ...Typography.h3,
    fontFamily: FontFamily.heading,
    color: Colors.textPrimary,
    textAlign: "center",
    marginBottom: Layout.spacing.sm,
    maxWidth: 320,
  },
  body: {
    ...Typography.body,
    color: Colors.gray600,
    textAlign: "center",
    marginBottom: Layout.spacing.xl,
    maxWidth: 300,
    lineHeight: 22,
  },
  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 24,
    minHeight: 48,
    minWidth: 220,
    ...Shadow.card,
    shadowOpacity: 0.08,
  },
  primaryBtnPressed: {
    opacity: 0.88,
  },
  primaryBtnText: {
    ...Typography.button,
    fontFamily: FontFamily.heading,
    color: Colors.white,
    flexShrink: 1,
    textAlign: "center",
  },
  secondaryBtn: {
    marginTop: Layout.spacing.md,
    paddingVertical: 12,
    paddingHorizontal: 20,
    minHeight: 44,
    justifyContent: "center",
  },
  secondaryBtnPressed: { opacity: 0.75 },
  secondaryBtnText: {
    ...Typography.button,
    fontFamily: FontFamily.heading,
    textAlign: "center",
  },
});
