// apps/mobile/app/profile/edit-romance.tsx
// Winkly – Profile: Edit Romance. Persists to profiles_mode (mode = romance).

import React, { useState, useEffect } from "react";
import { View, Text, ScrollView, TouchableOpacity, TextInput, StyleSheet, Alert, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useAuth } from "@/providers";
import { getOwnProfileMode, upsertOwnProfileMode } from "@/lib/access/profiles";
import { Colors, Typography, Layout } from "@/constants/tokens";

export default function EditRomance() {
  const router = useRouter();
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [goal, setGoal] = useState("");
  const [aboutLove, setAboutLove] = useState("");
  const [dealbreakers, setDealbreakers] = useState("");

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    (async () => {
      const profile = await getOwnProfileMode(user.id, "romance");
      if (cancelled) return;
      const meta = (profile?.meta as Record<string, unknown>) ?? {};
      setGoal((meta.relationship_goal as string) ?? "");
      setAboutLove((meta.what_you_value as string) ?? "");
      setDealbreakers((meta.dealbreakers as string) ?? "");
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [user?.id]);

  const save = async () => {
    if (!user?.id) return;
    setSaving(true);
    const { error } = await upsertOwnProfileMode(user.id, "romance", {
      meta: {
        relationship_goal: goal.trim() || null,
        what_you_value: aboutLove.trim() || null,
        dealbreakers: dealbreakers.trim() || null,
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
        <Header title="Edit romance" onBack={() => router.back()} onSave={save} saving={saving} />

        <View style={styles.card}>
          <Text style={styles.title}>Romance</Text>
          <Text style={styles.subtitle}>Your dating intentions and preferences.</Text>

          <Label text="Relationship goal" />
          <TextInput
            value={goal}
            onChangeText={setGoal}
            placeholder="e.g. serious relationship, long-term, etc."
            placeholderTextColor={Colors.gray500}
            style={styles.input}
          />

          <Label text="What you value" />
          <TextInput
            value={aboutLove}
            onChangeText={setAboutLove}
            placeholder="e.g. honesty, growth, emotional maturity…"
            placeholderTextColor={Colors.gray500}
            style={[styles.input, { minHeight: 110, textAlignVertical: "top" }]}
            multiline
          />

          <Label text="Dealbreakers (optional)" />
          <TextInput
            value={dealbreakers}
            onChangeText={setDealbreakers}
            placeholder="e.g. smoking, disrespect, etc."
            placeholderTextColor={Colors.gray500}
            style={[styles.input, { minHeight: 90, textAlignVertical: "top" }]}
            multiline
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
  saveText: { ...Typography.caption, color: Colors.accentYellow },

  card: { backgroundColor: "#FFF", borderRadius: Layout.radii.card, borderWidth: 1, borderColor: Colors.gray200, padding: 16 },
  title: { ...Typography.h2, color: Colors.textPrimary, marginBottom: 6 },
  subtitle: { ...Typography.body, color: Colors.gray700, marginBottom: 14 },

  label: { ...Typography.caption, color: Colors.gray600, marginBottom: 6 },
  centered: { justifyContent: "center", alignItems: "center" },
  saveBtnDisabled: { opacity: 0.7 },
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
