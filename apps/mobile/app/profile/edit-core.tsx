// apps/mobile/app/profile/edit-core.tsx
// Winkly – Profile: Edit Core. Persists to public.profiles_core.

import React, { useState, useEffect } from "react";
import { View, Text, ScrollView, StyleSheet, Alert, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "@/providers";
import { useFormatLocationDisplay } from "@/lib/location/useLocationDisplay";
import { normalizeLocationDisplayString } from "@/lib/location/countryDisplay";
import { useTranslation } from "react-i18next";
import { supabase } from "@/lib/supabase";
import { getOwnProfileCore, upsertOwnProfileCore } from "@/lib/access/profiles";
import { Card, Chip, Header, Input, TextButton } from "@/components/ds";
import { useAppTheme, type AppTheme } from "@/constants/design-system";

export default function EditCore() {
  const router = useRouter();
  const { user } = useAuth();
  const { t, i18n } = useTranslation();
  const fmtLoc = useFormatLocationDisplay();
  const theme = useAppTheme();
  const styles = createStyles(theme);

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
      Alert.alert(t("common.error"), t("profile.edit.saveFailed"));
      return;
    }
    router.back();
  };

  if (!user) return null;
  if (loading) {
    return (
      <View style={{ ...styles.screen, ...styles.centered }}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  const nightOwlOptions: { key: string; label: string; value: boolean | null }[] = [
    { key: "yes", label: t("common.yes"), value: true },
    { key: "no", label: t("common.no"), value: false },
    { key: "skip", label: t("profile.edit.skip"), value: null },
  ];

  return (
    <View style={styles.screen}>
      <Header
        title={t("profile.edit.core.title")}
        onBack={() => router.back()}
        trailing={<TextButton title={saving ? t("profile.edit.saving") : t("common.save")} onPress={save} disabled={saving} style={styles.saveBtn} />}
      />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Card style={styles.card}>
          <Text style={styles.title}>{t("profile.edit.core.basics")}</Text>
          <Text style={styles.subtitle}>{t("profile.edit.core.basicsSub")}</Text>

          <Input label={t("profile.firstName")} value={firstName} onChangeText={setFirstName} placeholder={t("profile.edit.core.firstNamePlaceholder")} editable={!saving} />
          <Input label={t("profile.lastName")} value={lastName} onChangeText={setLastName} placeholder={t("profile.edit.core.lastNamePlaceholder")} editable={!saving} />
          <Input
            label={t("profile.city")}
            value={city}
            onChangeText={setCity}
            onBlur={() => setCity((c) => (c.trim() ? fmtLoc(c) : c))}
            placeholder={t("profile.edit.core.cityPlaceholder")}
            editable={!saving}
          />
          <Input
            label={t("profile.bio")}
            value={bio}
            onChangeText={setBio}
            placeholder={t("profile.edit.core.bioPlaceholder")}
            style={{ minHeight: 110, textAlignVertical: "top" }}
            multiline
            editable={!saving}
          />

          <Text style={styles.segmentLabel}>{t("profile.edit.core.nightOwl")}</Text>
          <View style={styles.segmentRow}>
            {nightOwlOptions.map((opt) => (
              <Chip
                key={opt.key}
                label={opt.label}
                selected={nightOwl === opt.value}
                onPress={() => setNightOwl(opt.value)}
                disabled={saving}
                style={styles.segmentChip}
              />
            ))}
          </View>
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
    segmentLabel: {
      ...theme.type.caption,
      fontFamily: theme.type.caption.fontFamily,
      color: theme.colors.textSecondary,
      marginBottom: theme.spacing.xs,
    },
    segmentRow: {
      flexDirection: "row",
      gap: theme.spacing.sm,
      marginBottom: theme.spacing.xxs,
    },
    segmentChip: { flex: 1, alignItems: "center" },
  });
}
