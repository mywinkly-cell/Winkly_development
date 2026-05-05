// apps/mobile/app/profile/edit-core.tsx
// Winkly – Profile: Edit Core. Persists to public.profiles_core.

import React, { useState, useEffect } from "react";
import { View, Text, ScrollView, TouchableOpacity, TextInput, StyleSheet, Alert, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useAuth } from "@/providers";
import { useFormatLocationDisplay } from "@/lib/location/useLocationDisplay";
import { normalizeLocationDisplayString } from "@/lib/location/countryDisplay";
import { useTranslation } from "react-i18next";
import { supabase } from "@/lib/supabase";
import { getOwnProfileCore, upsertOwnProfileCore } from "@/lib/access/profiles";
import { Colors, Typography, Layout } from "@/constants/tokens";

export default function EditCore() {
  const router = useRouter();
  const { user } = useAuth();
  const { i18n } = useTranslation();
  const fmtLoc = useFormatLocationDisplay();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [city, setCity] = useState("");
  const [bio, setBio] = useState("");
  const [nightOwl, setNightOwl] = useState<boolean | null>(null);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    const lang = i18n?.language ?? "en";
    (async () => {
      const { data: up } = await supabase
        .from("user_profiles")
        .select("city,night_owl")
        .eq("id", user.id)
        .maybeSingle();
      const profile = await getOwnProfileCore(user.id);
      if (cancelled) return;
      const upCity = up?.city != null && String(up.city).trim() ? String(up.city).trim() : "";
      const coreCity = profile?.city ? String(profile.city).trim() : "";
      const cityRaw = upCity || coreCity;
      setCity(cityRaw ? normalizeLocationDisplayString(cityRaw, lang) : "");
      const upNightOwl =
        typeof (up as any)?.night_owl === "boolean" ? ((up as any).night_owl as boolean) : null;
      if (profile) {
        setFirstName(profile.first_name ?? "");
        setLastName(profile.last_name ?? "");
        setBio(profile.bio ?? "");
        const coreNightOwl =
          typeof (profile as any)?.night_owl === "boolean" ? ((profile as any).night_owl as boolean) : null;
        setNightOwl(upNightOwl ?? coreNightOwl);
      } else {
        setNightOwl(upNightOwl);
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [user?.id, i18n?.language]);

  const save = async () => {
    if (!user?.id) return;
    setSaving(true);
    const lang = i18n?.language ?? "en";
    const cityNorm = city.trim() ? normalizeLocationDisplayString(city.trim(), lang) : null;
    const { error } = await upsertOwnProfileCore(user.id, {
      first_name: firstName.trim() || null,
      last_name: lastName.trim() || null,
      city: cityNorm,
      bio: bio.trim() || null,
      night_owl: nightOwl,
    });
    if (!error) {
      const { error: upErr } = await supabase
        .from("user_profiles")
        .update({ city: cityNorm, night_owl: nightOwl })
        .eq("id", user.id);
      if (upErr) console.warn("user_profiles city sync:", upErr);
    }
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
        <Header title="Edit core" onBack={() => router.back()} onSave={save} saving={saving} />

        <View style={styles.card}>
          <Text style={styles.title}>Basics</Text>
          <Text style={styles.subtitle}>This information appears across all modes.</Text>

          <Label text="First name" />
          <TextInput
            value={firstName}
            onChangeText={setFirstName}
            placeholder="Kateryna"
            placeholderTextColor={Colors.gray500}
            style={styles.input}
            editable={!saving}
          />

          <Label text="Last name" />
          <TextInput
            value={lastName}
            onChangeText={setLastName}
            placeholder="Shyshkalova"
            placeholderTextColor={Colors.gray500}
            style={styles.input}
            editable={!saving}
          />

          <Label text="City" />
          <TextInput
            value={city}
            onChangeText={setCity}
            onBlur={() => setCity((c) => (c.trim() ? fmtLoc(c) : c))}
            placeholder="Munich"
            placeholderTextColor={Colors.gray500}
            style={styles.input}
            editable={!saving}
          />

          <Label text="Bio" />
          <TextInput
            value={bio}
            onChangeText={setBio}
            placeholder="Short intro about you…"
            placeholderTextColor={Colors.gray500}
            style={[styles.input, { minHeight: 110, textAlignVertical: "top" }]}
            multiline
            editable={!saving}
          />

          <Label text="Night owl" />
          <View style={styles.segmentRow}>
            {[
              { key: "yes", label: "Yes", value: true },
              { key: "no", label: "No", value: false },
              { key: "skip", label: "Skip", value: null as boolean | null },
            ].map((opt) => {
              const active = nightOwl === opt.value;
              return (
                <TouchableOpacity
                  key={opt.key}
                  onPress={() => setNightOwl(opt.value)}
                  activeOpacity={0.9}
                  disabled={saving}
                  style={[styles.segmentBtn, active && styles.segmentBtnActive]}
                >
                  <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{opt.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
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
}: {
  title: string;
  onBack: () => void;
  onSave: () => void;
  saving?: boolean;
}) {
  return (
    <View style={styles.headerRow}>
      <TouchableOpacity onPress={onBack} style={styles.backBtn} activeOpacity={0.9} accessibilityLabel="Back" disabled={saving}>
        <Ionicons name="arrow-back" size={24} color={Colors.textPrimary} />
      </TouchableOpacity>
      <Text style={styles.headerTitle}>{title}</Text>
      <TouchableOpacity
        onPress={onSave}
        style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
        activeOpacity={0.9}
        disabled={saving}
      >
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
  headerTitle: { ...Typography.headerTitle, color: Colors.textPrimary },
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

  segmentRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 6,
  },
  segmentBtn: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.gray300,
    backgroundColor: "#FFF",
    paddingVertical: 10,
    alignItems: "center",
  },
  segmentBtnActive: {
    borderColor: Colors.primaryViolet,
    backgroundColor: Colors.primaryViolet + "12",
  },
  segmentText: { ...Typography.caption, color: Colors.gray700, fontWeight: "700" },
  segmentTextActive: { color: Colors.primaryViolet },

});
