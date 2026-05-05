// apps/mobile/app/profile/edit-media.tsx
// Winkly – Profile: Edit Media. Persists core_photos (profiles_core). Real upload: expo-image-picker + Supabase Storage later.

import React, { useState, useEffect } from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Image, Alert, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useAuth } from "@/providers";
import { getOwnProfileCore, upsertOwnProfileCore } from "@/lib/access/profiles";
import { Colors, Typography, Layout } from "@/constants/tokens";

const SLOT_LABELS = ["Main photo", "Photo 2", "Photo 3", "Photo 4"];

export default function EditMedia() {
  const router = useRouter();
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [corePhotos, setCorePhotos] = useState<string[]>([]);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    (async () => {
      const profile = await getOwnProfileCore(user.id);
      if (cancelled) return;
      setCorePhotos(profile?.core_photos ?? []);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [user?.id]);

  const save = async () => {
    if (!user?.id) return;
    setSaving(true);
    const { error } = await upsertOwnProfileCore(user.id, { core_photos: corePhotos.length ? corePhotos : null });
    setSaving(false);
    if (error) {
      Alert.alert("Error", "Could not save photos. Please try again.");
      return;
    }
    router.back();
  };

  const addReal = () => {
    Alert.alert(
      "Add photos (next)",
      "To enable real uploads: install expo-image-picker, then upload to Supabase Storage and append URLs to core_photos."
    );
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
        <Header title="Edit media" onBack={() => router.back()} onSave={save} saving={saving} />

        <View style={styles.card}>
          <Text style={styles.title}>Photos</Text>
          <Text style={styles.subtitle}>High-quality photos improve trust and match quality.</Text>

          <View style={styles.grid}>
            {SLOT_LABELS.map((label, i) => {
              const filled = !!corePhotos[i];
              return (
                <TouchableOpacity key={String(i)} style={styles.slot} activeOpacity={0.9}>
                  <View style={styles.slotInner}>
                    {filled ? (
                      <Image
                        source={{ uri: corePhotos[i] }}
                        style={{ width: 64, height: 64, borderRadius: 8 }}
                        resizeMode="cover"
                      />
                    ) : (
                      <Text style={styles.plus}>+</Text>
                    )}
                    <Text style={styles.slotLabel}>{label}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>

          <TouchableOpacity onPress={addReal} style={styles.secondaryBtn} activeOpacity={0.9}>
            <Text style={styles.secondaryText}>Enable real photo upload</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.note}>Photo URLs are stored in your profile. Add image picker + Storage upload to add new photos.</Text>
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

  grid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: 12 },
  slot: {
    width: "48%",
    borderRadius: Layout.radii.card,
    backgroundColor: Colors.gray100,
    borderWidth: 1,
    borderColor: Colors.gray200,
    padding: 14,
    minHeight: 120,
  },
  slotInner: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8 },
  plus: { fontSize: 28, color: Colors.gray600 },
  slotLabel: { ...Typography.caption, color: Colors.textPrimary },

  secondaryBtn: {
    marginTop: 14,
    backgroundColor: Colors.gray100,
    borderRadius: Layout.radii.control,
    paddingVertical: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: Colors.gray200,
  },
  secondaryText: { ...Typography.button, color: Colors.textPrimary },

  note: { ...Typography.caption, color: Colors.gray600, textAlign: "center", marginTop: 12 },
});
