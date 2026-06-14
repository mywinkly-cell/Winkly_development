/**
 * Modal to build a Super like message that includes a concrete invite (activity, place, date & time).
 * Used from Romance discover: paid users can send "Hi [Name]! How about coffee at [Place] on [date] at [time]?"
 * AI suggests place & time via Concierge (both users' context). No planner invite is created until they match.
 *
 * First-date safety: only "safe" activities are shown — public, low-commitment options (e.g. coffee, lunch,
 * dinner, drinks, concert, movie, daytime walk). No day trips or isolated/late-evening settings.
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
import { useModeContext } from "@/providers";
import { canUseAIFeature } from "@/lib/ai/aiFeatureGate";
import { useDefaultLocation } from "@/lib/ai/useDefaultCity";
import { useTranslation } from "react-i18next";
import { formatDefaultLocationDisplay } from "@/lib/location/countryDisplay";
import { callConcierge } from "@/lib/ai/conciergeClient";
import type { ExperienceOption } from "@/lib/ai/conciergeClient";

/** Safe first-meet activities: public, familiar settings. No day trips, isolated spots, or late-evening park. */
const SAFE_FIRST_DATE_ACTIVITIES = [
  "Coffee / Café",
  "Brunch / Lunch",
  "Dinner",
  "Wine / Drinks",
  "Concert",
  "Movie",
  "Walk (e.g. daytime)",
  "Other",
];

function activityToHint(activity: string): string {
  const lower = activity.toLowerCase();
  if (lower.includes("coffee") || lower.includes("café")) return "coffee";
  if (lower.includes("brunch") || lower.includes("lunch")) return "brunch or lunch";
  if (lower.includes("dinner")) return "dinner";
  if (lower.includes("wine") || lower.includes("drinks")) return "wine or drinks";
  if (lower.includes("concert")) return "concert";
  if (lower.includes("movie")) return "movie";
  if (lower.includes("walk")) return "daytime walk";
  return lower.split(/[/,(]/)[0]?.trim() || "activity";
}

function parseSuggestion(option: ExperienceOption, defaultStarts: Date): { place: string; location: string; startsAt: Date } {
  let place = "";
  let location = "";
  const startsAt = new Date(defaultStarts);
  const name = (option.option_name ?? option.narrative ?? "") as string;
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
      const pm = /(\d{1,2})\s*PM/i.exec(timeStr);
      const am = /(\d{1,2})\s*AM/i.exec(timeStr);
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

const defaultDate = () => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(13, 30, 0, 0);
  return d;
};

function formatInviteMessage(partnerName: string, activity: string, place: string, startsAt: Date): string {
  const dateStr = startsAt.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
  const timeStr = startsAt.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  const name = partnerName.trim() || "there";
  if (place.trim()) {
    return `Hi ${name}! How about ${activity.toLowerCase()} together on ${dateStr} at ${timeStr} at ${place.trim()}?`;
  }
  return `Hi ${name}! How about ${activity.toLowerCase()} together on ${dateStr} at ${timeStr}?`;
}

type Props = {
  visible: boolean;
  targetUserId: string;
  targetFirstName: string;
  onClose: () => void;
  onSend: (message: string) => void;
};

export function SuperLikeInviteModal({ visible, targetUserId, targetFirstName, onClose, onSend }: Props) {
  const { context: modeContext } = useModeContext();
  const { i18n } = useTranslation();
  const appLanguage = i18n?.language ?? "en";
  const { city: defaultCity, country: defaultCountry } = useDefaultLocation();
  const tier = modeContext.subscription_tier ?? "free";
  const hasConcierge = canUseAIFeature(tier, "concierge");

  const [activity, setActivity] = useState(SAFE_FIRST_DATE_ACTIVITIES[0]);
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

  const handleGetSuggestion = useCallback(async () => {
    if (!hasConcierge) return;
    setSuggesting(true);
    try {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const dateFrom = tomorrow.toISOString().slice(0, 10);
      const dateTo = new Date(tomorrow.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const res = await callConcierge({
        task: "concierge",
        context: {
          mode: "romance",
          activity_hint: activityToHint(activity),
          partner_user_id: targetUserId,
          date_from: dateFrom,
          date_to: dateTo,
          source_screen: "chats",
          city: defaultCity ?? undefined,
          country: defaultCountry ?? undefined,
          user_prompt: `${activity} with ${targetFirstName}`,
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
  }, [activity, targetUserId, targetFirstName, hasConcierge, defaultCity, defaultCountry]);

  const handleSend = () => {
    const message = formatInviteMessage(targetFirstName, activity, place, startsAt);
    setSending(true);
    onSend(message);
    onClose();
    setSending(false);
    Alert.alert(
      "Super Like sent!",
      `Your invite was sent to ${targetFirstName}. They'll see it if they swipe right on you.`,
    );
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Super like with an invite</Text>
            <Pressable onPress={onClose} hitSlop={12}>
              <Ionicons name="close" size={24} color={Colors.textPrimary} />
            </Pressable>
          </View>
          <Text style={styles.hint}>
            They&apos;ll see your invite when they see your profile. If they match, you can confirm the plan in chat.
          </Text>
          <Text style={styles.safetyHint}>
            Suggestions are public, daytime or busy spots — comfortable for a first meeting.
          </Text>

          <ScrollView style={styles.formScroll} contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
            <Text style={styles.label}>Activity</Text>
            <View style={styles.activityRow}>
              {SAFE_FIRST_DATE_ACTIVITIES.map((a) => (
                <Pressable
                  key={a}
                  onPress={() => setActivity(a)}
                  style={[styles.chip, activity === a && styles.chipSelected]}
                >
                  <Text style={[styles.chipText, activity === a && styles.chipTextSelected]}>{a}</Text>
                </Pressable>
              ))}
            </View>

            {hasConcierge && (
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
            <Text style={styles.label}>Place</Text>
            <TextInput
              value={place}
              onChangeText={setPlace}
              placeholder="e.g. Café Luitpold"
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
              onPress={handleSend}
              disabled={sending}
              style={[styles.submitBtn, sending && styles.submitBtnDisabled]}
            >
              {sending ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <Text style={styles.submitText}>Send Super like with invite</Text>
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
    marginBottom: 8,
  },
  headerTitle: { ...Typography.headerTitle, color: Colors.textPrimary },
  hint: { ...Typography.caption, color: Colors.gray600, marginBottom: 8 },
  safetyHint: { ...Typography.caption, color: Colors.gray500, marginBottom: 16, fontStyle: "italic" },
  formScroll: { maxHeight: "100%" },
  form: { paddingBottom: 8 },
  label: { ...Typography.caption, color: Colors.gray700, marginBottom: 6 },
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
