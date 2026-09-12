// components/profile/SaveStatusIndicator.tsx
// Subtle, non-blocking "Saving… / Saved / Couldn't save" pill for autosaving
// profile screens. Renders nothing while idle so it never distracts from
// the form.
import React from "react";
import { View, Text, StyleSheet, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Colors, Typography } from "@/constants/tokens";
import type { AutosaveStatus } from "@/lib/profile/autosaveEngine";

export function SaveStatusIndicator({ status }: { status: AutosaveStatus }) {
  if (status === "idle") return null;

  const config =
    status === "saving"
      ? { label: "Saving…" }
      : status === "saved"
        ? { label: "Saved" }
        : { label: "Couldn't save, retrying…" };

  return (
    <View style={styles.row} accessibilityLiveRegion="polite">
      {status === "saving" ? (
        <ActivityIndicator size="small" color={Colors.gray600} style={styles.icon} />
      ) : status === "saved" ? (
        <Ionicons name="checkmark-circle" size={14} color={Colors.gray600} style={styles.icon} />
      ) : (
        <Ionicons name="cloud-offline-outline" size={14} color={Colors.gray600} style={styles.icon} />
      )}
      <Text style={styles.text}>{config.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
  },
  icon: {
    marginRight: 4,
  },
  text: {
    ...Typography.caption,
    color: Colors.gray600,
  },
});
