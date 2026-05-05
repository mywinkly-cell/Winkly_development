/**
 * Modal to invite the chat partner to a date/meet-up/meeting.
 * Activity, location, place, date & time. Used from 1:1 chat.
 * "Let's do something": activity chips + optional AI "Get suggestion" (Concierge) to pre-fill place & time.
 */

import React, { useState, useCallback, useEffect } from "react";
import {
  View,
  Text,
  Modal,
  Pressable,
  TextInput,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SparklesIcon } from "@/components/ui/WinklyAISpark";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Colors, Typography, Layout } from "@/constants/tokens";
import type { Mode } from "@/types";
import { useModeContext } from "@/providers";
import { canUseAIFeature } from "@/lib/ai/aiFeatureGate";
import { useDefaultLocation } from "@/lib/ai/useDefaultCity";
import { useTranslation } from "react-i18next";
import { formatDefaultLocationDisplay } from "@/lib/location/countryDisplay";
import { callConcierge } from "@/lib/ai/conciergeClient";
import type { ExperienceOption } from "@/lib/ai/conciergeClient";

/** "Let's do something" activity set: Coffee, Wine, Tennis, Day trip, Concert, Dinner, Walk + mode-specific. */
const ACTIVITIES: Record<Mode, string[]> = {
  romance: ["Coffee / Café", "Wine / Drinks", "Tennis", "Day trip", "Concert", "Dinner", "Walk", "Movie", "Other"],
  friends: ["Coffee / Café", "Wine / Drinks", "Brunch", "Tennis", "Day trip", "Concert", "Hiking", "Dinner", "Walk", "Other"],
  business: ["Coffee", "Lunch", "Meeting", "Golf", "Other"],
  events: ["Meet up", "Concert", "Other"],
};

const INVITE_LABEL: Record<Mode, string> = {
  romance: "Invite on date",
  friends: "Invite to meet-up",
  business: "Suggest meeting",
  events: "Invite to meet",
};

export type InviteFormValues = {
  activity: string;
  location: string;
  place: string;
  starts_at: Date;
  ends_at: Date | null;
};

type Props = {
  visible: boolean;
  mode: Mode;
  onClose: () => void;
  onSubmit: (values: InviteFormValues) => Promise<void>;
  /** When set, "Get suggestion" is shown (if user has Concierge access) and Concierge gets partner context. */
  partnerUserId?: string;
  partnerDisplayName?: string;
};

const defaultDate = () => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(19, 30, 0, 0);
  return d;
};

/** Map activity label to short hint for Concierge (e.g. "Coffee / Café" → "coffee"). */
function activityToHint(activity: string): string {
  const lower = activity.toLowerCase();
  if (lower.includes("coffee") || lower.includes("café")) return "coffee";
  if (lower.includes("wine") || lower.includes("drinks")) return "wine or drinks";
  if (lower.includes("tennis")) return "tennis";
  if (lower.includes("day trip")) return "day trip";
  if (lower.includes("concert")) return "concert";
  if (lower.includes("dinner")) return "dinner";
  if (lower.includes("walk")) return "walk";
  if (lower.includes("movie")) return "movie";
  if (lower.includes("brunch")) return "brunch";
  if (lower.includes("hiking")) return "hiking";
  if (lower.includes("lunch")) return "lunch";
  if (lower.includes("meeting")) return "meeting";
  if (lower.includes("golf")) return "golf";
  return lower.split(/[/,]/)[0]?.trim() || "activity";
}

/** Parse first Concierge option into place and time for pre-fill. */
function parseSuggestion(option: ExperienceOption, defaultStarts: Date): { place: string; location: string; startsAt: Date } {
  let place = "";
  let location = "";
  const startsAt = new Date(defaultStarts);

  const name = (option.option_name ?? option.narrative ?? "") as string;
  // e.g. "Coffee at Café Luitpold" or "Dinner at Restaurant X"
  const atMatch = name.match(/\bat\s+(.+?)(?:\s*[–—-]|$)/i) || name.match(/\bat\s+(.+)/i);
  if (atMatch) place = atMatch[1].trim();

  const narrative = (option.narrative ?? "") as string;
  if (!place && narrative) {
    const nAt = narrative.match(/\bat\s+([^,.]+)/i);
    if (nAt) place = nAt[1].trim();
  }
  if (!place && name && !name.startsWith("Option")) place = name.trim();

  const firstStep = option.itinerary?.[0] ?? option.schedule?.[0];
  const timeStr = typeof firstStep === "object" && firstStep && "time" in firstStep
    ? (firstStep as { time?: string }).time
    : typeof firstStep === "string" ? firstStep : "";
  if (timeStr) {
    const hm = timeStr.match(/(\d{1,2}):(\d{2})/);
    if (hm) {
      startsAt.setHours(parseInt(hm[1], 10), parseInt(hm[2], 10), 0, 0);
    } else {
      const pm = /(\d{1,2})\s*PM/i.exec(timeStr); const am = /(\d{1,2})\s*AM/i.exec(timeStr);
      const hMatch = timeStr.match(/(\d{1,2})/);
      if (hMatch) {
        let h = parseInt(hMatch[1], 10);
        if (pm && h < 12) h += 12;
        if (am && h === 12) h = 0;
        startsAt.setHours(h, 0, 0, 0);
      }
    }
  }

  return { place, location, startsAt };
}

export function InviteToPlanModal({ visible, mode, onClose, onSubmit, partnerUserId, partnerDisplayName }: Props) {
  const { context: modeContext } = useModeContext();
  const { i18n } = useTranslation();
  const appLanguage = i18n?.language ?? "en";
  const { city: defaultCity, country: defaultCountry } = useDefaultLocation();
  const tier = modeContext.subscription_tier ?? "free";
  const hasConcierge = canUseAIFeature(tier, "concierge");

  const [activity, setActivity] = useState(ACTIVITIES[mode][0]);
  const [location, setLocation] = useState("");
  const [place, setPlace] = useState("");
  const [startsAt, setStartsAt] = useState(defaultDate());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [sending, setSending] = useState(false);
  const [suggesting, setSuggesting] = useState(false);

  useEffect(() => {
    if (!visible) return;
    const line = formatDefaultLocationDisplay(defaultCity, defaultCountry, appLanguage);
    if (!line.trim()) return;
    setLocation((prev) => (prev.trim() ? prev : line));
  }, [visible, defaultCity, defaultCountry, appLanguage]);

  const _title =
    place.trim() ? `${activity} at ${place.trim()}` : activity;

  const handleGetSuggestion = useCallback(async () => {
    if (!partnerUserId || !hasConcierge) return;
    setSuggesting(true);
    try {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const dateFrom = tomorrow.toISOString().slice(0, 10);
      const dateTo = new Date(tomorrow.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

      const res = await callConcierge({
        task: "concierge",
        context: {
          mode,
          activity_hint: activityToHint(activity),
          partner_user_id: partnerUserId,
          date_from: dateFrom,
          date_to: dateTo,
          source_screen: "chats",
          city: defaultCity ?? undefined,
          country: defaultCountry ?? undefined,
          user_prompt: `${activity} with ${partnerDisplayName ?? "them"}`,
        },
      });

      if (res.error) {
        Alert.alert("Suggestion unavailable", res.error);
        return;
      }
      const first = res.suggestions?.[0];
      if (!first) {
        Alert.alert("No suggestion", "Try a different activity or pick place and time yourself.");
        return;
      }
      const { place: p, location: loc, startsAt: t } = parseSuggestion(first, defaultDate());
      if (p) setPlace(p);
      if (loc) setLocation(loc);
      setStartsAt(t);
    } catch (e) {
      Alert.alert("Error", (e as Error).message ?? "Could not get suggestion.");
    } finally {
      setSuggesting(false);
    }
  }, [activity, mode, partnerUserId, partnerDisplayName, hasConcierge, defaultCity, defaultCountry]);

  const handleSubmit = async () => {
    setSending(true);
    try {
      await onSubmit({
        activity,
        location: location.trim(),
        place: place.trim(),
        starts_at: startsAt,
        ends_at: null,
      });
      onClose();
    } catch (e) {
      Alert.alert("Error", (e as Error).message ?? "Could not send invite.");
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.header}>
            <Text style={styles.headerTitle}>{INVITE_LABEL[mode]}</Text>
            <Pressable onPress={onClose} hitSlop={12}>
              <Ionicons name="close" size={24} color={Colors.textPrimary} />
            </Pressable>
          </View>

          <ScrollView style={styles.formScroll} contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
            <Text style={styles.label}>Activity</Text>
            <View style={styles.activityRow}>
              {ACTIVITIES[mode].map((a) => (
                <Pressable
                  key={a}
                  onPress={() => setActivity(a)}
                  style={[styles.chip, activity === a && styles.chipSelected]}
                >
                  <Text style={[styles.chipText, activity === a && styles.chipTextSelected]}>{a}</Text>
                </Pressable>
              ))}
            </View>

            {partnerUserId && hasConcierge && (
              <Pressable
                onPress={handleGetSuggestion}
                disabled={suggesting}
                style={[styles.suggestBtn, suggesting && styles.suggestBtnDisabled]}
              >
                {suggesting ? (
                  <ActivityIndicator size="small" color={Colors.primaryViolet} />
                ) : (
                  <>
                    <SparklesIcon size={18} color={Colors.primaryViolet} />
                    <Text style={styles.suggestBtnText}>Get suggestion (place & time)</Text>
                  </>
                )}
              </Pressable>
            )}

            <Text style={styles.label}>City / area (optional)</Text>
            <TextInput
              value={location}
              onChangeText={setLocation}
              placeholder="e.g. Downtown"
              style={styles.input}
              placeholderTextColor={Colors.gray500}
            />

            <Text style={styles.label}>Place (optional)</Text>
            <TextInput
              value={place}
              onChangeText={setPlace}
              placeholder="e.g. Café Luna"
              style={styles.input}
              placeholderTextColor={Colors.gray500}
            />

            <Text style={styles.label}>Date & time</Text>
            <View style={styles.dateTimeRow}>
              <Pressable style={styles.dateTimeBtn} onPress={() => setShowDatePicker(true)}>
                <Text style={styles.dateTimeText}>
                  {startsAt.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
                </Text>
              </Pressable>
              <Pressable style={styles.dateTimeBtn} onPress={() => setShowTimePicker(true)}>
                <Text style={styles.dateTimeText}>
                  {startsAt.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
                </Text>
              </Pressable>
            </View>

            {showDatePicker && (
              <DateTimePicker
                value={startsAt}
                mode="date"
                minimumDate={new Date()}
                display={Platform.OS === "ios" ? "spinner" : "default"}
                onChange={(_, d) => {
                  setShowDatePicker(Platform.OS === "ios");
                  if (d) setStartsAt((prev) => new Date(prev.setFullYear(d.getFullYear(), d.getMonth(), d.getDate())));
                }}
              />
            )}
            {showTimePicker && (
              <DateTimePicker
                value={startsAt}
                mode="time"
                display={Platform.OS === "ios" ? "spinner" : "default"}
                onChange={(_, d) => {
                  setShowTimePicker(Platform.OS === "ios");
                  if (d) setStartsAt((prev) => new Date(prev.setHours(d.getHours(), d.getMinutes(), 0, 0)));
                }}
              />
            )}

            <Pressable
              onPress={handleSubmit}
              disabled={sending}
              style={[styles.submitBtn, sending && styles.submitBtnDisabled]}
            >
              {sending ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <Text style={styles.submitText}>Send invite</Text>
              )}
            </Pressable>
          </ScrollView>
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
    maxHeight: "90%",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 20,
  },
  headerTitle: { ...Typography.headerTitle, color: Colors.textPrimary },
  formScroll: { maxHeight: "100%" },
  form: { paddingBottom: 8 },
  label: { ...Typography.caption, color: Colors.gray700, marginBottom: 6 },
  suggestBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: Colors.primaryViolet,
    borderRadius: Layout.radii.control,
    paddingVertical: 10,
    marginBottom: 16,
  },
  suggestBtnDisabled: { opacity: 0.6 },
  suggestBtnText: { ...Typography.body, color: Colors.primaryViolet, fontWeight: "600" },
  activityRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 16 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: Layout.radii.control,
    backgroundColor: Colors.gray100,
  },
  chipSelected: { backgroundColor: Colors.primaryViolet },
  chipText: { ...Typography.body, color: Colors.textPrimary },
  chipTextSelected: { ...Typography.body, color: Colors.accentYellow },
  input: {
    borderWidth: 1,
    borderColor: Colors.gray200,
    borderRadius: Layout.radii.control,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    marginBottom: 16,
  },
  dateTimeRow: { flexDirection: "row", gap: 12, marginBottom: 20 },
  dateTimeBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: Colors.gray200,
    borderRadius: Layout.radii.control,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  dateTimeText: { ...Typography.body, color: Colors.textPrimary },
  submitBtn: {
    backgroundColor: Colors.primaryViolet,
    borderRadius: Layout.radii.control,
    paddingVertical: 14,
    alignItems: "center",
  },
  submitBtnDisabled: { opacity: 0.7 },
  submitText: { ...Typography.button, color: Colors.accentYellow },
});
