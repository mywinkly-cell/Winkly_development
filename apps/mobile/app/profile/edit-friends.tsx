// apps/mobile/app/profile/edit-friends.tsx
// Winkly – Profile: Edit Friends. Persists to profiles_mode (mode = friends).

import React, { useState, useEffect } from "react";
import { View, Text, ScrollView, StyleSheet, Alert, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/providers";
import { getOwnProfileMode, upsertOwnProfileMode } from "@/lib/access/profiles";
import { Card, Header, Input, TextButton } from "@/components/ds";
import { useAppTheme, type AppTheme } from "@/constants/design-system";

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
  const { t } = useTranslation();
  const router = useRouter();
  const { user } = useAuth();
  const theme = useAppTheme();
  const styles = createStyles(theme);

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

  return (
    <View style={styles.screen}>
      <Header
        title={t("profile.edit.friends.title")}
        onBack={() => router.back()}
        trailing={<TextButton title={saving ? t("profile.edit.saving") : t("common.save")} onPress={save} disabled={saving} style={styles.saveBtn} />}
      />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Card style={styles.card}>
          <Text style={styles.title}>{t("modes.friends")}</Text>
          <Text style={styles.subtitle}>{t("profile.edit.friends.subtitle")}</Text>

          <Input
            label={t("profile.edit.friends.interests")}
            value={interests}
            onChangeText={setInterests}
            placeholder={t("profile.edit.friends.interestsPlaceholder")}
            style={{ minHeight: 90, textAlignVertical: "top" }}
            multiline
            editable={!saving}
          />
          <Input
            label={t("profile.edit.friends.meetupStyle")}
            value={meetupStyle}
            onChangeText={setMeetupStyle}
            placeholder={t("profile.edit.friends.meetupStylePlaceholder")}
            style={{ minHeight: 90, textAlignVertical: "top" }}
            multiline
            editable={!saving}
          />
          <Input
            label={t("profile.edit.friends.availability")}
            value={availability}
            onChangeText={setAvailability}
            placeholder={t("profile.edit.friends.availabilityPlaceholder")}
            editable={!saving}
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
  });
}
