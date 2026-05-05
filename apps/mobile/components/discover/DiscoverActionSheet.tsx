/**
 * Bottom sheet for Discover card actions: Like Back / Send Like, View Profile, Block, Report, Close.
 * Mode-specific primary label (Romance: Like Back, Friends: Connect).
 */

import React from "react";
import { View, Text, Modal, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Colors, Typography, Layout } from "@/constants/tokens";
import type { Mode } from "@/types";

type DiscoverActionSheetVariant = "liked_you" | "recommendation";

const PRIMARY_LABEL: Record<Mode, Record<DiscoverActionSheetVariant, string>> = {
  romance: { liked_you: "Like Back", recommendation: "Send Like" },
  friends: { liked_you: "Connect", recommendation: "Send Like" },
  business: { liked_you: "Connect", recommendation: "Send Like" },
  events: { liked_you: "Connect", recommendation: "Send Like" },
};

type Props = {
  visible: boolean;
  mode: "romance" | "friends";
  variant: DiscoverActionSheetVariant;
  primaryColor?: string;
  onClose: () => void;
  onPrimary: () => void | Promise<void>;
  onViewProfile: () => void;
  onBlock: () => void | Promise<void>;
  onReport: () => void | Promise<void>;
  primaryLoading?: boolean;
  /** When true, primary button is disabled and optional message shown (e.g. "1 like per day on Free") */
  primaryDisabled?: boolean;
  primaryDisabledMessage?: string;
};

export function DiscoverActionSheet({
  visible,
  mode,
  variant,
  primaryColor,
  onClose,
  onPrimary,
  onViewProfile,
  onBlock,
  onReport,
  primaryLoading = false,
  primaryDisabled = false,
  primaryDisabledMessage,
}: Props) {
  const primaryLabel = PRIMARY_LABEL[mode]?.[variant] ?? "Send Like";
  const btnColor = primaryColor ?? Colors.primaryViolet;

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Actions</Text>
            <Pressable onPress={onClose} hitSlop={12}>
              <Ionicons name="close" size={24} color={Colors.textPrimary} />
            </Pressable>
          </View>

          <View style={styles.actions}>
            <Pressable
              onPress={() => { onPrimary(); onClose(); }}
              disabled={primaryLoading || primaryDisabled}
              style={[styles.primaryBtn, { backgroundColor: btnColor }, (primaryLoading || primaryDisabled) && styles.btnDisabled]}
            >
              {primaryLoading ? (
                <ActivityIndicator color="#FFF" size="small" />
              ) : (
                <Text style={styles.primaryBtnText}>{primaryLabel}</Text>
              )}
            </Pressable>
            {primaryDisabled && primaryDisabledMessage ? (
              <Text style={styles.disabledMessage}>{primaryDisabledMessage}</Text>
            ) : null}

            <Pressable style={styles.rowBtn} onPress={() => { onViewProfile(); onClose(); }}>
              <Ionicons name="person-outline" size={22} color={Colors.textPrimary} />
              <Text style={styles.rowBtnText}>View Profile</Text>
            </Pressable>

            <Pressable style={styles.rowBtn} onPress={() => { onBlock(); onClose(); }}>
              <Ionicons name="remove-circle-outline" size={22} color={Colors.textPrimary} />
              <Text style={styles.rowBtnText}>Block</Text>
            </Pressable>

            <Pressable style={styles.rowBtn} onPress={() => { onReport(); onClose(); }}>
              <Ionicons name="flag-outline" size={22} color={Colors.textPrimary} />
              <Text style={styles.rowBtnText}>Report</Text>
            </Pressable>

            <Pressable style={[styles.rowBtn, styles.closeRow]} onPress={onClose}>
              <Text style={styles.closeText}>Close</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: Colors.backgroundLight,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 40,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 20,
  },
  headerTitle: { ...Typography.headerTitle, color: Colors.textPrimary },
  actions: { gap: 12 },
  primaryBtn: {
    borderRadius: Layout.radii.control,
    paddingVertical: 14,
    alignItems: "center",
    backgroundColor: Colors.primaryViolet,
  },
  primaryBtnText: { ...Typography.button, color: Colors.white },
  btnDisabled: { opacity: 0.7 },
  rowBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 4,
  },
  rowBtnText: { ...Typography.body, color: Colors.textPrimary },
  closeRow: { marginTop: 8, borderTopWidth: 1, borderTopColor: Colors.border },
  closeText: { ...Typography.body, color: Colors.gray600 },
  disabledMessage: { ...Typography.caption, color: Colors.gray600, textAlign: "center", marginTop: 4 },
});
