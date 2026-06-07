import React, { useState } from "react";
import { Modal, View, Text, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { Colors, Typography, Layout, FontFamily } from "@/constants/tokens";
import { createDateCheckin } from "@/lib/safety/dateCheckins";
import {
  markDateSafetyPromptDismissed,
  type DateSafetyPromptParams,
} from "@/lib/safety/dateCheckinPrompt";

type Props = {
  visible: boolean;
  params: DateSafetyPromptParams | null;
  onClose: () => void;
};

export function DateSafetyCheckinPromptModal({ visible, params, onClose }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleNotNow = async () => {
    if (params?.plannerItemId) await markDateSafetyPromptDismissed(params.plannerItemId);
    Haptics.selectionAsync();
    onClose();
  };

  const handleSetCheckin = async () => {
    if (!params) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setLoading(true);
    try {
      const scheduledAt = new Date(params.scheduledAt);
      await createDateCheckin({
        plannerItemId: params.plannerItemId,
        partnerUserId: params.partnerUserId ?? null,
        scheduledAt,
        checkinDueAt: new Date(scheduledAt.getTime() + 30 * 60 * 1000),
      });
      await markDateSafetyPromptDismissed(params.plannerItemId);
      onClose();
      router.push("/(tabs)/planner/dates");
    } catch {
      onClose();
      router.push("/(tabs)/planner/dates");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleNotNow}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>You have a date planned!</Text>
          <Text style={styles.body}>Set a safety check-in so Winkly can nudge you during your date window.</Text>
          <Pressable
            onPress={() => void handleSetCheckin()}
            disabled={loading}
            style={[styles.primaryBtn, loading && styles.primaryBtnDisabled]}
          >
            {loading ? (
              <ActivityIndicator color={Colors.accentYellow} />
            ) : (
              <Text style={styles.primaryText}>Set check-in</Text>
            )}
          </Pressable>
          <Pressable onPress={() => void handleNotNow()} style={styles.ghostBtn}>
            <Text style={styles.ghostText}>Not now</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    padding: Layout.spacing.lg,
  },
  card: {
    backgroundColor: Colors.white,
    borderRadius: Layout.radii.card,
    padding: Layout.spacing.xl,
  },
  title: {
    ...Typography.h3,
    fontFamily: FontFamily.headingBold,
    color: Colors.textPrimary,
    marginBottom: 8,
  },
  body: {
    ...Typography.body,
    color: Colors.textSecondary,
    marginBottom: 20,
    lineHeight: 22,
  },
  primaryBtn: {
    backgroundColor: Colors.primaryViolet,
    borderRadius: Layout.radii.control,
    paddingVertical: 14,
    alignItems: "center",
    marginBottom: 10,
  },
  primaryBtnDisabled: { opacity: 0.7 },
  primaryText: {
    ...Typography.button,
    color: Colors.accentYellow,
    fontFamily: FontFamily.headingBold,
  },
  ghostBtn: {
    paddingVertical: 12,
    alignItems: "center",
  },
  ghostText: {
    ...Typography.button,
    color: Colors.gray600,
    fontWeight: "600",
  },
});
