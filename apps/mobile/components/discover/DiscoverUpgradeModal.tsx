/**
 * Encourages Free users to upgrade when tapping blurred Liked-you / Recommended cards.
 */

import React from "react";
import { View, Text, Modal, Pressable, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Colors, Typography, Layout } from "@/constants/tokens";

type Props = {
  visible: boolean;
  primaryColor: string;
  onClose: () => void;
};

export function DiscoverUpgradeModal({ visible, primaryColor, onClose }: Props) {
  const router = useRouter();

  const goToPlans = () => {
    onClose();
    router.push("/account/subscription");
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close upgrade dialog" accessibilityRole="button">
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()} accessibilityRole="none">
          <View style={styles.iconWrap}>
            <Ionicons name="sparkles" size={32} color={primaryColor} />
          </View>
          <Text style={styles.title}>See everyone who likes you</Text>
          <Text style={styles.body}>
            Upgrade to Super or Premium to unlock all profiles in this row, view full photos, and
            match with more people every day.
          </Text>

          <Pressable
            style={[styles.primaryBtn, { backgroundColor: primaryColor }]}
            onPress={goToPlans}
            accessibilityRole="button"
            accessibilityLabel="Choose Super or Premium subscription"
          >
            <Text style={styles.primaryBtnText}>Choose Super or Premium</Text>
          </Pressable>

          <Pressable
            style={styles.secondaryBtn}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Maybe later"
          >
            <Text style={styles.secondaryBtnText}>Maybe later</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: Colors.backgroundLight,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    paddingBottom: 40,
    alignItems: "center",
  },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.card,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  title: {
    ...Typography.h3,
    color: Colors.textPrimary,
    textAlign: "center",
    marginBottom: 10,
  },
  body: {
    ...Typography.body,
    color: Colors.gray700,
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 24,
  },
  primaryBtn: {
    width: "100%",
    borderRadius: Layout.radii.control,
    paddingVertical: 14,
    alignItems: "center",
    marginBottom: 12,
  },
  primaryBtnText: { ...Typography.button, color: Colors.white },
  secondaryBtn: { paddingVertical: 10 },
  secondaryBtnText: { ...Typography.body, color: Colors.gray600 },
});
