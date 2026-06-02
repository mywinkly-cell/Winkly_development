import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Modal } from "@/components/ui/Modal";
import { Colors, Typography, Layout } from "@/constants/tokens";
import type { AppMode } from "@/lib/chats/types";
import { getModeLocationCopy } from "@/lib/location/modeLocationPrompt";

const MODE_ACCENT: Record<AppMode, string> = {
  romance: Colors.romance.primary,
  friends: Colors.friends.primary,
  business: Colors.business.primary,
  events: Colors.events.primary,
};

type Props = {
  visible: boolean;
  mode: AppMode;
  loading?: boolean;
  onAllow: () => void;
  onSkip: () => void;
};

export function ModeLocationRationaleModal({
  visible,
  mode,
  loading = false,
  onAllow,
  onSkip,
}: Props) {
  const copy = getModeLocationCopy(mode);
  const accent = MODE_ACCENT[mode];

  return (
    <Modal visible={visible} onClose={onSkip} closeOnBackdropPress={!loading}>
      <View style={styles.iconWrap}>
        <View style={[styles.iconCircle, { backgroundColor: `${accent}18` }]}>
          <Ionicons name="location-outline" size={32} color={accent} />
        </View>
      </View>
      <Text style={styles.title}>{copy.title}</Text>
      <Text style={styles.body}>{copy.body}</Text>
      <TouchableOpacity
        style={[styles.primaryBtn, { backgroundColor: accent }]}
        onPress={onAllow}
        disabled={loading}
        accessibilityRole="button"
        accessibilityLabel={copy.allowLabel}
      >
        {loading ? (
          <ActivityIndicator color={Colors.white} />
        ) : (
          <Text style={styles.primaryBtnText}>{copy.allowLabel}</Text>
        )}
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.secondaryBtn}
        onPress={onSkip}
        disabled={loading}
        accessibilityRole="button"
        accessibilityLabel={copy.skipLabel}
      >
        <Text style={styles.secondaryBtnText}>{copy.skipLabel}</Text>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  iconWrap: {
    alignItems: "center",
    marginBottom: Layout.spacing.md,
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    ...Typography.h3,
    color: Colors.gray800,
    textAlign: "center",
    marginBottom: Layout.spacing.sm,
  },
  body: {
    ...Typography.body,
    color: Colors.gray600,
    textAlign: "center",
    marginBottom: Layout.spacing.lg,
    lineHeight: 22,
  },
  primaryBtn: {
    borderRadius: Layout.radii.control,
    paddingVertical: Layout.spacing.md,
    alignItems: "center",
    marginBottom: Layout.spacing.sm,
  },
  primaryBtnText: {
    ...Typography.button,
    color: Colors.white,
  },
  secondaryBtn: {
    paddingVertical: Layout.spacing.sm,
    alignItems: "center",
  },
  secondaryBtnText: {
    ...Typography.body,
    color: Colors.gray600,
  },
});
