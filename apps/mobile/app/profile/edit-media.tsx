// apps/mobile/app/profile/edit-media.tsx
// Winkly – Profile: Edit Media. Persists core_photos (profiles_core). Real upload: expo-image-picker + Supabase Storage later.

import React, { useState, useEffect } from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Image, Alert, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/providers";
import { getOwnProfileCore, upsertOwnProfileCore } from "@/lib/access/profiles";
import { pickAndUploadPhoto } from "@/lib/uploadMedia";
import { Card, Header, SecondaryButton, TextButton } from "@/components/ds";
import { useAppTheme, type AppTheme } from "@/constants/design-system";

const SLOT_COUNT = 4;

export default function EditMedia() {
  const { t } = useTranslation();
  const router = useRouter();
  const { user } = useAuth();
  const theme = useAppTheme();
  const styles = createStyles(theme);

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
      Alert.alert(t("common.error"), t("profile.edit.media.saveFailed"));
      return;
    }
    router.back();
  };

  const [adding, setAdding] = useState(false);
  const canAdd = corePhotos.length < SLOT_COUNT;

  /** Pick → quarantine upload → moderation. Held photos are added server-side once approved. */
  const addPhoto = async () => {
    if (!user?.id || !canAdd || adding) return;
    setAdding(true);
    try {
      const url = await pickAndUploadPhoto(user.id, "core");
      if (url) setCorePhotos((prev) => [...prev, url].slice(0, SLOT_COUNT));
    } finally {
      setAdding(false);
    }
  };

  if (!user) return null;
  if (loading) {
    return (
      <View style={{ ...styles.screen, ...styles.centered }}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <Header
        title={t("profile.edit.media.title")}
        onBack={() => router.back()}
        trailing={<TextButton title={saving ? t("profile.edit.saving") : t("common.save")} onPress={save} disabled={saving} style={styles.saveBtn} />}
      />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Card style={styles.card}>
          <Text style={styles.title}>{t("profile.photos")}</Text>
          <Text style={styles.subtitle}>{t("profile.edit.media.subtitle")}</Text>

          <View style={styles.grid}>
            {Array.from({ length: SLOT_COUNT }, (_, i) => {
              const label = i === 0 ? t("profile.edit.media.mainPhoto") : t("profile.edit.media.photoN", { n: i + 1 });
              const filled = !!corePhotos[i];
              return (
                <TouchableOpacity key={String(i)} style={styles.slot} activeOpacity={0.9}>
                  <View style={styles.slotInner}>
                    {filled ? (
                      <Image
                        source={{ uri: corePhotos[i] }}
                        style={{ width: 64, height: 64, borderRadius: theme.radii.xs }}
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

          <SecondaryButton
            title={t("profile.edit.media.addPhoto")}
            onPress={() => void addPhoto()}
            loading={adding}
            disabled={!canAdd || adding || saving}
            style={styles.secondaryBtn}
          />
        </Card>

      </ScrollView>
    </View>
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.colors.background },
    centered: { justifyContent: "center", alignItems: "center" },
    scroll: { padding: theme.spacing.xl, paddingBottom: theme.spacing.huge },
    saveBtn: { paddingHorizontal: 0 },
    card: {},
    title: { ...theme.type.h2, fontFamily: theme.type.h2.fontFamily, color: theme.colors.textPrimary, marginBottom: theme.spacing.xxs },
    subtitle: { ...theme.type.body, fontFamily: theme.type.body.fontFamily, color: theme.colors.textSecondary, marginBottom: theme.spacing.md },
    grid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: theme.spacing.md },
    slot: {
      width: "48%",
      borderRadius: theme.radii.lg,
      backgroundColor: theme.colors.backgroundMuted,
      borderWidth: 1,
      borderColor: theme.colors.border,
      padding: theme.spacing.md,
      minHeight: 120,
    },
    slotInner: { flex: 1, alignItems: "center", justifyContent: "center", gap: theme.spacing.sm },
    plus: { fontSize: 28, color: theme.colors.textSecondary },
    slotLabel: { ...theme.type.caption, fontFamily: theme.type.caption.fontFamily, color: theme.colors.textPrimary },
    secondaryBtn: { marginTop: theme.spacing.md },
  });
}
