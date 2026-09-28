// apps/mobile/components/planner/ReschedulePlanSheet.tsx
// Move a plan to another day / time, with an optional reason for the others.
//
//  • Organiser: moves the plan for everyone (plan-update "reschedule") — calendars follow and
//    the others get a push + a card in your chat with the reason.
//  • Anyone else in the plan: suggests the new time to the others (plan-update "notify");
//    the organiser decides.

import React, { useMemo, useState } from "react";
import { Modal, View, Text, Pressable, Platform, StyleSheet, Alert, KeyboardAvoidingView, ScrollView } from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useTranslation } from "react-i18next";
import { Chip, Input, PrimaryButton, TextButton } from "@/components/ds";
import { useAppTheme } from "@/constants/design-system";
import { formatAppDate, formatAppTime, useAppLocaleTag } from "@/lib/i18n/appLocale";
import { updatePlan } from "@/lib/planner/planChanges";

export type ReschedulePlan = {
  id: string;
  title: string;
  startsAt: string;
  endsAt?: string | null;
  isOrganiser: boolean;
  /** Other people are in the plan (a date / meetup) — they'll be told. */
  hasOthers: boolean;
};

const REASON_KEYS = [
  "planChanges.reasonRunningLate",
  "planChanges.reasonSomethingCameUp",
  "planChanges.reasonWeather",
  "planChanges.reasonTraffic",
  "planChanges.reasonNotFeelingWell",
] as const;

type PickerTarget = "date" | "time" | null;

function nextFullHour(from: Date): Date {
  const d = new Date(from);
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + 1);
  return d;
}

export function ReschedulePlanSheet({
  visible,
  plan,
  initialReason,
  onClose,
  onDone,
}: {
  visible: boolean;
  plan: ReschedulePlan | null;
  /** Pre-filled reason, e.g. from a weather alert. */
  initialReason?: string | null;
  onClose: () => void;
  /** After a successful move (organiser) or suggestion (others). */
  onDone: (result: { moved: boolean; startsAt: string; endsAt: string | null }) => void;
}) {
  const theme = useAppTheme();
  const { t } = useTranslation();
  const locale = useAppLocaleTag();
  // Start from the plan's own time (if still ahead) so small moves are one tap. The parent
  // remounts the sheet (key) for each opening, so this initial state is always fresh.
  const [start, setStart] = useState<Date>(() => {
    const old = plan ? new Date(plan.startsAt) : null;
    return !old || Number.isNaN(old.getTime()) || old.getTime() < Date.now() ? nextFullHour(new Date()) : old;
  });
  const [picker, setPicker] = useState<PickerTarget>(null);
  const [reason, setReason] = useState(initialReason ?? "");
  const [quick, setQuick] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const lengthMs = useMemo(() => {
    if (!plan?.endsAt) return null;
    const len = Date.parse(plan.endsAt) - Date.parse(plan.startsAt);
    return Number.isFinite(len) && len > 0 ? len : null;
  }, [plan]);

  if (!plan) return null;
  const suggestOnly = !plan.isOrganiser;
  const unchanged = Math.abs(start.getTime() - Date.parse(plan.startsAt)) < 60_000;
  const whenLabel = `${formatAppDate(start, { weekday: "short", day: "numeric", month: "short" }, locale)}, ${formatAppTime(start, undefined, locale)}`;

  const onPickerChange = (_: unknown, picked?: Date) => {
    if (Platform.OS === "android") setPicker(null);
    if (!picked) return;
    const next = new Date(start);
    if (picker === "date") next.setFullYear(picked.getFullYear(), picked.getMonth(), picked.getDate());
    else next.setHours(picked.getHours(), picked.getMinutes(), 0, 0);
    setStart(next);
  };

  const submit = async () => {
    if (start.getTime() < Date.now()) {
      Alert.alert(t("planChanges.pastTimeTitle"), t("planChanges.pastTimeBody"));
      return;
    }
    const why = reason.trim() || quick || null;
    setSaving(true);
    try {
      if (suggestOnly) {
        const message = why
          ? t("planChanges.suggestMessageWithReason", { when: whenLabel, reason: why })
          : t("planChanges.suggestMessage", { when: whenLabel });
        const res = await updatePlan({ plannerItemId: plan.id, action: "notify", reason: message });
        if (!res.ok) throw new Error(res.error);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        onDone({ moved: false, startsAt: plan.startsAt, endsAt: plan.endsAt ?? null });
        return;
      }
      const endsAt = lengthMs ? new Date(start.getTime() + lengthMs).toISOString() : null;
      const res = await updatePlan({
        plannerItemId: plan.id,
        action: "reschedule",
        startsAt: start.toISOString(),
        endsAt,
        reason: why,
      });
      if (!res.ok) throw new Error(res.error);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onDone({ moved: true, startsAt: res.startsAt, endsAt: res.endsAt });
    } catch {
      Alert.alert(t("planChanges.failedTitle"), t("planChanges.failedBody"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.backdrop}>
        <View style={[styles.sheet, { backgroundColor: theme.colors.surface, borderTopLeftRadius: theme.radii.lg, borderTopRightRadius: theme.radii.lg }]}>
          <ScrollView keyboardShouldPersistTaps="handled">
            <View style={styles.headRow}>
              <Text style={[theme.type.h3, { color: theme.colors.textPrimary, flex: 1 }]}>
                {suggestOnly ? t("planChanges.suggestTitle") : t("planChanges.rescheduleTitle")}
              </Text>
              <TextButton title={t("common.cancel")} onPress={onClose} />
            </View>
            <Text style={[theme.type.caption, { color: theme.colors.textSecondary, marginBottom: theme.spacing.md }]} numberOfLines={2}>
              {plan.title}
            </Text>

            <Text style={[theme.type.caption, { color: theme.colors.textSecondary, marginBottom: theme.spacing.xs }]}>
              {t("planChanges.newTimeLabel")}
            </Text>
            <View style={styles.whenRow}>
              <WhenButton icon="calendar-outline" label={formatAppDate(start, undefined, locale)} onPress={() => setPicker("date")} />
              <WhenButton icon="time-outline" label={formatAppTime(start, undefined, locale)} onPress={() => setPicker("time")} />
            </View>
            {picker ? (
              <View style={{ marginBottom: theme.spacing.md }}>
                {Platform.OS === "ios" ? (
                  <View style={{ alignItems: "flex-end" }}>
                    <TextButton title={t("common.done")} onPress={() => setPicker(null)} />
                  </View>
                ) : null}
                <DateTimePicker
                  value={start}
                  mode={picker}
                  minimumDate={picker === "date" ? new Date() : undefined}
                  display={Platform.OS === "ios" ? "spinner" : "default"}
                  onChange={onPickerChange}
                />
              </View>
            ) : null}

            <Text style={[theme.type.caption, { color: theme.colors.textSecondary, marginBottom: theme.spacing.xs }]}>
              {t("planChanges.reasonLabel")}
            </Text>
            <View style={styles.chipRow}>
              {REASON_KEYS.map((key) => {
                const label = t(key);
                return (
                  <Chip
                    key={key}
                    label={label}
                    selected={quick === label}
                    onPress={() => {
                      setQuick(quick === label ? null : label);
                      setReason("");
                    }}
                  />
                );
              })}
            </View>
            <Input
              value={reason}
              onChangeText={(v) => {
                setReason(v);
                if (v) setQuick(null);
              }}
              placeholder={t("planChanges.reasonPlaceholder")}
              maxLength={300}
              multiline
            />

            {plan.hasOthers ? (
              <View style={styles.noteRow}>
                <Ionicons name="notifications-outline" size={16} color={theme.colors.textSecondary} />
                <Text style={[theme.type.caption, { color: theme.colors.textSecondary, flex: 1 }]}>
                  {suggestOnly ? t("planChanges.suggestNote") : t("planChanges.rescheduleNote")}
                </Text>
              </View>
            ) : (
              <View style={styles.noteRow}>
                <Ionicons name="calendar-outline" size={16} color={theme.colors.textSecondary} />
                <Text style={[theme.type.caption, { color: theme.colors.textSecondary, flex: 1 }]}>
                  {t("planChanges.calendarsNote")}
                </Text>
              </View>
            )}

            <PrimaryButton
              title={suggestOnly ? t("planChanges.suggestCta", { when: whenLabel }) : t("planChanges.rescheduleCta", { when: whenLabel })}
              onPress={submit}
              loading={saving}
              disabled={saving || (!suggestOnly && unchanged) || (suggestOnly && !plan.hasOthers)}
              style={{ marginTop: theme.spacing.md }}
            />
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function WhenButton({
  icon,
  label,
  onPress,
}: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  label: string;
  onPress: () => void;
}) {
  const theme = useAppTheme();
  return (
    <Pressable
      onPress={() => {
        Haptics.selectionAsync();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        paddingHorizontal: theme.spacing.md,
        paddingVertical: theme.spacing.sm,
        borderRadius: theme.radii.pill,
        backgroundColor: theme.colors.backgroundMuted,
      }}
    >
      <Ionicons name={icon} size={16} color={theme.colors.textSecondary} />
      <Text style={[theme.type.body, { color: theme.colors.textPrimary }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.35)" },
  sheet: { padding: 20, paddingBottom: 32, maxHeight: "90%" },
  headRow: { flexDirection: "row", alignItems: "center", marginBottom: 4 },
  whenRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 16 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 8 },
  noteRow: { flexDirection: "row", alignItems: "flex-start", gap: 6, marginTop: 4 },
});
