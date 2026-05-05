// components/planner/EventReminderModal.tsx
// Set notifications/reminders for a planner item, event, or invitation (push, email, when).

import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  Switch,
  ScrollView,
  StyleSheet,
  Pressable,
} from "react-native";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { Colors, Typography, Layout, FontFamily } from "@/constants/tokens";
import {
  getReminderPrefs,
  setReminderPrefs,
  REMINDER_WHEN_OPTIONS,
  type ReminderPrefs,
  type ReminderWhen,
} from "@/lib/plannerReminders";

type EventReminderModalProps = {
  visible: boolean;
  onClose: () => void;
  /** Planner item id, event id, or invitation id */
  itemId: string;
  /** Optional title for the modal (e.g. event name). */
  title?: string;
  /** Optional: e.g. "Remind me to respond" for invitations */
  subtitle?: string;
};

export function EventReminderModal({
  visible,
  onClose,
  itemId,
  title,
  subtitle,
}: EventReminderModalProps) {
  const [prefs, setPrefs] = useState<ReminderPrefs>({
    push: true,
    email: false,
    when: "15m",
  });
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!itemId) return;
    setLoading(true);
    const p = await getReminderPrefs(itemId);
    setPrefs(p);
    setLoading(false);
  }, [itemId]);

  useEffect(() => {
    if (visible && itemId) load();
  }, [visible, itemId, load]);

  const update = useCallback(
    async (partial: Partial<ReminderPrefs>) => {
      const next = { ...prefs, ...partial };
      setPrefs(next);
      await setReminderPrefs(itemId, next);
      Haptics.selectionAsync();
    },
    [itemId, prefs]
  );

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <View style={styles.headerIconWrap}>
              <Ionicons name="notifications-outline" size={24} color={Colors.primaryViolet} />
            </View>
            <Text style={styles.headerTitle}>
              {title ? `Reminders: ${title}` : "Reminders"}
            </Text>
            {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
            <TouchableOpacity
              onPress={() => {
                Haptics.selectionAsync();
                onClose();
              }}
              style={styles.closeBtn}
              hitSlop={12}
              accessibilityLabel="Close"
            >
              <Ionicons name="close" size={24} color={Colors.textPrimary} />
            </TouchableOpacity>
          </View>

          {loading ? (
            <Text style={styles.loading}>Loading…</Text>
          ) : (
            <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Notification channel</Text>
                <View style={styles.toggleRow}>
                  <Ionicons name="phone-portrait-outline" size={20} color={Colors.gray600} />
                  <Text style={styles.toggleLabel}>Push notification</Text>
                  <Switch
                    value={prefs.push}
                    onValueChange={(v) => update({ push: v })}
                    trackColor={{ false: Colors.gray300, true: Colors.primaryViolet + "60" }}
                    thumbColor={prefs.push ? Colors.primaryViolet : Colors.gray400}
                  />
                </View>
                <View style={styles.toggleRow}>
                  <Ionicons name="mail-outline" size={20} color={Colors.gray600} />
                  <Text style={styles.toggleLabel}>Email reminder</Text>
                  <Switch
                    value={prefs.email}
                    onValueChange={(v) => update({ email: v })}
                    trackColor={{ false: Colors.gray300, true: Colors.primaryViolet + "60" }}
                    thumbColor={prefs.email ? Colors.primaryViolet : Colors.gray400}
                  />
                </View>
                <Text style={styles.toggleHint}>
                  Get a reminder so you don&apos;t miss it. You can turn off reminders in Planner settings.
                </Text>
              </View>

              <View style={styles.section}>
                <Text style={styles.sectionTitle}>When to remind</Text>
                {REMINDER_WHEN_OPTIONS.map((opt) => (
                  <TouchableOpacity
                    key={opt.value}
                    onPress={() => update({ when: opt.value as ReminderWhen })}
                    style={[styles.optionRow, prefs.when === opt.value && styles.optionRowActive]}
                    activeOpacity={0.8}
                  >
                    <Text
                      style={[
                        styles.optionLabel,
                        prefs.when === opt.value && styles.optionLabelActive,
                      ]}
                    >
                      {opt.label}
                    </Text>
                    {prefs.when === opt.value && (
                      <Ionicons name="checkmark-circle" size={22} color={Colors.primaryViolet} />
                    )}
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
          )}

          <TouchableOpacity
            onPress={() => {
              Haptics.selectionAsync();
              onClose();
            }}
            style={styles.doneBtn}
            activeOpacity={0.9}
          >
            <Text style={styles.doneBtnText}>Done</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingBottom: 32,
    maxHeight: "85%",
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.gray300,
    alignSelf: "center",
    marginTop: 10,
    marginBottom: 8,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 16,
  },
  headerIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: Colors.primaryViolet + "18",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  headerTitle: {
    flex: 1,
    ...Typography.headerTitle,
    fontFamily: FontFamily.heading,
    color: Colors.textPrimary,
    paddingRight: 40,
  },
  subtitle: {
    ...Typography.caption,
    color: Colors.gray600,
    marginTop: 4,
  },
  closeBtn: {
    position: "absolute",
    top: 0,
    right: 0,
    padding: 4,
  },
  loading: {
    ...Typography.body,
    color: Colors.gray600,
    textAlign: "center",
    paddingVertical: 24,
  },
  scroll: {
    maxHeight: 320,
    marginBottom: 16,
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    ...Typography.caption,
    fontWeight: "600",
    color: Colors.gray600,
    marginBottom: 10,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    gap: 12,
  },
  toggleLabel: {
    flex: 1,
    ...Typography.body,
    color: Colors.textPrimary,
    fontWeight: "500",
  },
  toggleHint: {
    ...Typography.caption,
    color: Colors.gray600,
    marginTop: 4,
    paddingLeft: 32,
  },
  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: Layout.radii.control,
    backgroundColor: Colors.gray100,
    marginBottom: 6,
  },
  optionRowActive: {
    backgroundColor: Colors.primaryViolet + "15",
    borderWidth: 1,
    borderColor: Colors.primaryViolet + "40",
  },
  optionLabel: {
    ...Typography.body,
    color: Colors.textPrimary,
  },
  optionLabelActive: {
    color: Colors.primaryViolet,
    fontWeight: "600",
  },
  doneBtn: {
    backgroundColor: Colors.primaryViolet,
    borderRadius: Layout.radii.control,
    paddingVertical: 14,
    alignItems: "center",
  },
  doneBtnText: {
    ...Typography.button,
    color: Colors.accentYellow,
    fontWeight: "600",
  },
});
