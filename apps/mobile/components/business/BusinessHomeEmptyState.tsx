import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Colors, Typography, Layout, FontFamily, Shadow } from "@/constants/tokens";

type BusinessHomeEmptyStateProps = {
  onEditProfile: () => void;
};

export function BusinessHomeEmptyState({ onEditProfile }: BusinessHomeEmptyStateProps) {
  const accent = Colors.business.primary;
  const softBg = Colors.business.secondary;

  return (
    <View style={styles.container}>
      <View style={[styles.iconWrap, { backgroundColor: softBg }]}>
        <Ionicons name="business-outline" size={36} color={accent} />
      </View>

      <Text style={styles.title}>Grow your professional network</Text>
      <Text style={styles.body}>Complete your Business profile to start connecting</Text>

      <Pressable
        onPress={onEditProfile}
        style={({ pressed }) => [
          styles.primaryBtn,
          { backgroundColor: accent },
          pressed && styles.primaryBtnPressed,
        ]}
        accessibilityLabel="Complete Business profile"
      >
        <Ionicons name="create-outline" size={20} color={Colors.white} />
        <Text style={styles.primaryBtnText}>Complete profile</Text>
      </Pressable>
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
  },
});
