// apps/mobile/app/profile/edit-friends.tsx
// Winkly – Profile: Edit Friends. Persists to profiles_mode (mode = friends).

import React, { useState, useEffect } from "react";
import { View, Text, ScrollView, TouchableOpacity, TextInput, StyleSheet, Alert, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useAuth } from "@/providers";
import { getOwnProfileMode, upsertOwnProfileMode } from "@/lib/access/profiles";
import { Colors, Typography, Layout } from "@/constants/tokens";

function toInterestsArray(s: string): string[] {
  return s
    .split(/[\n,]+/)
    .map((x) => x.trim())
    .filter(Boolean);
}

function fromInterestsArray(arr: string[] | null | undefined): string {
  return arr?.join(", ") ?? "";
}

export default function EditFriends() {
  const router = useRouter();
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [interests, setInterests] = useState("");
  const [meetupStyle, setMeetupStyle] = useState("");
  const [availability, setAvailability] = useState("");

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    (async () => {
      const profile = await getOwnProfileMode(user.id, "friends");
      if (cancelled) return;
      setInterests(fromInterestsArray(profile?.interests ?? undefined));
      const meta = (profile?.meta as Record<string, unknown>) ?? {};
      setMeetupStyle((meta.meetup_style as string) ?? "");
      setAvailability((meta.availability as string) ?? "");
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [user?.id]);

  const save = async () => {
    if (!user?.id) return;
    setSaving(true);
    const { error } = await upsertOwnProfileMode(user.id, "friends", {
      interests: toInterestsArray(interests).length ? toInterestsArray(interests) : null,
      meta: {
        meetup_style: meetupStyle.trim() || null,
        availability: availability.trim() || null,
      },
    });
    setSaving(false);
    if (error) {
      Alert.alert("Error", "Could not save profile. Please try again.");
      return;
    }
    router.back();
  };

  if (!user) return null;
  if (loading) {
    return (
      <View style={[styles.screen, styles.centered]}>
        <ActivityIndicator size="large" color={Colors.primaryViolet} />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Header title="Edit friends" onBack={() => router.back()} onSave={save} saving={saving} />

        <View style={styles.card}>
          <Text style={styles.title}>Friends</Text>
          <Text style={styles.subtitle}>Your interests and preferred meetup style.</Text>

          <Label text="Interests" />
          <TextInput
            value={interests}
            onChangeText={setInterests}
            placeholder="e.g. gym, hiking, museums, latin dance…"
            placeholderTextColor={Colors.gray500}
            style={[styles.input, { minHeight: 90, textAlignVertical: "top" }]}
            multiline
            editable={!saving}
          />

          <Label text="Meetup style" />
          <TextInput
            value={meetupStyle}
            onChangeText={setMeetupStyle}
            placeholder="e.g. small groups, active weekends, coffee chats…"
            placeholderTextColor={Colors.gray500}
            style={[styles.input, { minHeight: 90, textAlignVertical: "top" }]}
            multiline
            editable={!saving}
          />

          <Label text="Availability (optional)" />
          <TextInput
            value={availability}
            onChangeText={setAvailability}
            placeholder="e.g. Tue/Thu evenings, weekends…"
            placeholderTextColor={Colors.gray500}
            style={styles.input}
            editable={!saving}
          />
        </View>
      </ScrollView>
    </View>
  );
}

function Header({
  title,
  onBack,
  onSave,
  saving,
}: { title: string; onBack: () => void; onSave: () => void; saving?: boolean }) {
  return (
    <View style={styles.headerRow}>
      <TouchableOpacity onPress={onBack} style={styles.backBtn} activeOpacity={0.9} accessibilityLabel="Back" disabled={saving}>
        <Ionicons name="arrow-back" size={24} color={Colors.textPrimary} />
      </TouchableOpacity>
      <Text style={styles.headerTitle}>{title}</Text>
      <TouchableOpacity onPress={onSave} style={[styles.saveBtn, saving && styles.saveBtnDisabled]} activeOpacity={0.9} disabled={saving}>
        <Text style={styles.saveText}>{saving ? "Saving…" : "Save"}</Text>
      </TouchableOpacity>
    </View>
  );
}

function Label({ text }: { text: string }) {
  return <Text style={styles.label}>{text}</Text>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.backgroundLight },
  scroll: { padding: 20, paddingBottom: 40 },

  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.gray100,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#1C1C1E",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
  },
  headerTitle: { ...Typography.h3, color: Colors.textPrimary },
  saveBtn: { width: 70, paddingVertical: 8, borderRadius: 10, backgroundColor: Colors.primaryViolet, alignItems: "center" },
  saveBtnDisabled: { opacity: 0.7 },
  saveText: { ...Typography.caption, color: Colors.accentYellow },
  centered: { justifyContent: "center", alignItems: "center" },

  card: { backgroundColor: "#FFF", borderRadius: Layout.radii.card, borderWidth: 1, borderColor: Colors.gray200, padding: 16 },
  title: { ...Typography.h2, color: Colors.textPrimary, marginBottom: 6 },
  subtitle: { ...Typography.body, color: Colors.gray700, marginBottom: 14 },

  label: { ...Typography.caption, color: Colors.gray600, marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: Colors.gray300,
    borderRadius: Layout.radii.control,
    backgroundColor: "#FFF",
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: Colors.textPrimary,
    marginBottom: 12,
  },
});
