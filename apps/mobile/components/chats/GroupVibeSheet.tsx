import { Ionicons } from "@expo/vector-icons";
import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { View, Text, Modal, Pressable, TextInput, StyleSheet, TouchableOpacity } from "react-native";
import { Colors, Typography, Layout } from "@/constants/tokens";
import type { GroupVibeMood } from "@/lib/groups/groupsApi";

type VibePick = { mood: GroupVibeMood; energy?: number | null; note?: string | null };

const MOODS: { key: GroupVibeMood; emoji: string }[] = [
  { key: "chill", emoji: "🧘" },
  { key: "active", emoji: "🏃" },
  { key: "foodie", emoji: "🍜" },
  { key: "social", emoji: "🎉" },
  { key: "budget", emoji: "💸" },
  { key: "fancy", emoji: "✨" },
];

/**
 * One-tap mood picker shown before AI group planning. Each member sets their own
 * vibe; non-responders are simply skipped (no blocking). Optional short note.
 */
export function GroupVibeSheet({
  visible,
  onClose,
  onSubmit,
  onSkip,
}: {
  visible: boolean;
  onClose: () => void;
  onSubmit: (pick: VibePick) => void;
  onSkip: () => void;
}) {
  const { t } = useTranslation();
  const [mood, setMood] = useState<GroupVibeMood | null>(null);
  const [note, setNote] = useState("");

  const reset = () => {
    setMood(null);
    setNote("");
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={styles.sheet}>
        <View style={styles.handle} />
        <Text style={styles.title}>{t("groups.vibe.title")}</Text>
        <Text style={styles.subtitle}>
          {t("groups.vibe.subtitle")}
        </Text>

        <View style={styles.moodGrid}>
          {MOODS.map((m) => {
            const active = mood === m.key;
            return (
              <TouchableOpacity
                key={m.key}
                onPress={() => setMood(m.key)}
                style={[styles.moodChip, active && styles.moodChipActive]}
                activeOpacity={0.85}
              >
                <Text style={styles.moodEmoji}>{m.emoji}</Text>
                <Text style={[styles.moodLabel, active && styles.moodLabelActive]}>{t(`groups.vibe.mood.${m.key}`)}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <TextInput
          value={note}
          onChangeText={setNote}
          placeholder={t("groups.vibe.notePlaceholder")}
          placeholderTextColor={Colors.gray500}
          style={styles.note}
          maxLength={140}
        />

        <TouchableOpacity
          onPress={() => {
            if (!mood) return;
            const picked: VibePick = { mood, note: note.trim() || null };
            reset();
            onSubmit(picked);
          }}
          style={[styles.primaryBtn, !mood && styles.primaryBtnDisabled]}
          disabled={!mood}
          activeOpacity={0.9}
        >
          <Ionicons name="sparkles-outline" size={18} color="#FFF" />
          <Text style={styles.primaryText}>{t("groups.vibe.submit")}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => {
            reset();
            onSkip();
          }}
          style={styles.skipBtn}
          activeOpacity={0.9}
        >
          <Text style={styles.skipText}>{t("groups.vibe.skip")}</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.35)" },
  sheet: {
    backgroundColor: "#FFF",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingBottom: 32,
  },
  handle: { alignSelf: "center", width: 40, height: 4, borderRadius: 2, backgroundColor: Colors.gray300, marginBottom: 14 },
  title: { ...Typography.h2, color: Colors.textPrimary },
  subtitle: { ...Typography.caption, color: Colors.gray600, marginTop: 4, marginBottom: 16 },

  moodGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  moodChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Colors.gray300,
    backgroundColor: Colors.gray100,
  },
  moodChipActive: { borderColor: Colors.primaryViolet, backgroundColor: Colors.primaryViolet + "18" },
  moodEmoji: { fontSize: 18 },
  moodLabel: { ...Typography.body, color: Colors.gray700 },
  moodLabelActive: { color: Colors.primaryViolet, fontWeight: "600" },

  note: {
    marginTop: 16,
    borderWidth: 1,
    borderColor: Colors.gray300,
    borderRadius: Layout.radii.control,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: Colors.textPrimary,
  },

  primaryBtn: {
    flexDirection: "row",
    gap: 8,
    backgroundColor: Colors.primaryViolet,
    borderRadius: Layout.radii.control,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 16,
  },
  primaryBtnDisabled: { opacity: 0.5 },
  primaryText: { ...Typography.button, color: "#FFF" },

  skipBtn: { alignItems: "center", paddingVertical: 12, marginTop: 4 },
  skipText: { ...Typography.button, color: Colors.gray600 },
});
