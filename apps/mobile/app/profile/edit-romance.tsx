// apps/mobile/app/profile/edit-romance.tsx
// Winkly – Profile: Edit Romance. Persists to profiles_mode (mode = romance).

import React, { useState, useEffect, useRef } from "react";
import { View, Text, ScrollView, StyleSheet, Alert, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { AudioModule, RecordingPresets, setAudioModeAsync, useAudioRecorder, useAudioRecorderState } from "expo-audio";
import { useAuth } from "@/providers";
import { getOwnProfileMode, upsertOwnProfileMode } from "@/lib/access/profiles";
import { Card, Header, Input, SecondaryButton, TextButton } from "@/components/ds";
import { useAppTheme, type AppTheme } from "@/constants/design-system";
import { supabase } from "@/lib/supabase";
import { pickAndUploadVideo } from "@/lib/uploadMedia";

export default function EditRomance() {
  const { t } = useTranslation();
  const router = useRouter();
  const { user } = useAuth();
  const theme = useAppTheme();
  const styles = createStyles(theme);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [goal, setGoal] = useState("");
  const [aboutLove, setAboutLove] = useState("");
  const [dealbreakers, setDealbreakers] = useState("");
  const [lifestyleTags, setLifestyleTags] = useState("");
  const [voiceUrl, setVoiceUrl] = useState<string | null>(null);
  const [voiceSeconds, setVoiceSeconds] = useState<number | null>(null);
  const [videoBioUrl, setVideoBioUrl] = useState<string | null>(null);
  const audioRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(audioRecorder);
  const lastRecordedUriRef = useRef<string | null>(null);

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
      const tags = (profile as { lifestyle_tags?: string[] | null })?.lifestyle_tags;
      setLifestyleTags(Array.isArray(tags) ? tags.join(", ") : "");
      setVoiceUrl((profile as { voice_prompt_url?: string | null })?.voice_prompt_url ?? null);
      setVoiceSeconds((profile as { voice_prompt_seconds?: number | null })?.voice_prompt_seconds ?? null);
      setVideoBioUrl((profile as { video_bio_url?: string | null })?.video_bio_url ?? null);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [user?.id]);

  useEffect(() => {
    (async () => {
      try {
        const status = await AudioModule.requestRecordingPermissionsAsync();
        if (!status.granted) return;
        await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true });
      } catch {
        // Ignore: user can still use the rest of the screen.
      }
    })();
  }, []);

  const save = async () => {
    if (!user?.id) return;
    setSaving(true);
    const tags = lifestyleTags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean)
      .slice(0, 12);
    const { error } = await upsertOwnProfileMode(user.id, "romance", {
      lifestyle_tags: tags.length ? tags : null,
      voice_prompt_url: voiceUrl,
      voice_prompt_seconds: voiceSeconds,
      video_bio_url: videoBioUrl,
      meta: {
        relationship_goal: goal.trim() || null,
        what_you_value: aboutLove.trim() || null,
        dealbreakers: dealbreakers.trim() || null,
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

  const handleVoicePress = async () => {
    if (!user?.id) return;
    if (recorderState.isRecording) {
      try {
        await audioRecorder.stop();
        const uri = audioRecorder.uri ?? lastRecordedUriRef.current;
        const durSec =
          recorderState.durationMillis != null ? Math.round(recorderState.durationMillis / 1000) : null;
        lastRecordedUriRef.current = uri ?? null;
        if (!uri) return;
        const resp = await fetch(uri);
        const blob = await resp.blob();
        const path = `${user.id}/romance/voice_${Date.now()}.m4a`;
        const { error: upErr } = await supabase.storage.from("user-videos").upload(path, blob, {
          contentType: "audio/mp4",
          upsert: true,
        });
        if (upErr) throw upErr;
        const { data } = supabase.storage.from("user-videos").getPublicUrl(path);
        setVoiceUrl(data.publicUrl);
        setVoiceSeconds(durSec);
      } catch (e) {
        if (__DEV__) console.warn("[edit-romance] voice upload failed:", e);
        Alert.alert(t("profile.edit.romance.voicePrompt"), t("errors.upload.voice"));
      }
      return;
    }
    const perm = await AudioModule.requestRecordingPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(t("profile.edit.romance.microphone"), t("profile.edit.romance.microphonePermission"));
      return;
    }
    await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true });
    await audioRecorder.prepareToRecordAsync();
    audioRecorder.record();
  };

  return (
    <View style={styles.screen}>
      <Header
        title={t("profile.edit.romance.title")}
        onBack={() => router.back()}
        trailing={<TextButton title={saving ? t("profile.edit.saving") : t("common.save")} onPress={save} disabled={saving} style={styles.saveBtn} />}
      />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Card style={styles.card}>
          <Text style={styles.title}>{t("modes.romance")}</Text>
          <Text style={styles.subtitle}>{t("profile.edit.romance.subtitle")}</Text>

          <Input
            label={t("profile.edit.romance.goal")}
            value={goal}
            onChangeText={setGoal}
            placeholder={t("profile.edit.romance.goalPlaceholder")}
          />
          <Input
            label={t("profile.edit.romance.values")}
            value={aboutLove}
            onChangeText={setAboutLove}
            placeholder={t("profile.edit.romance.valuesPlaceholder")}
            style={{ minHeight: 110, textAlignVertical: "top" }}
            multiline
          />
          <Input
            label={t("profile.edit.romance.dealbreakers")}
            value={dealbreakers}
            onChangeText={setDealbreakers}
            placeholder={t("profile.edit.romance.dealbreakersPlaceholder")}
            style={{ minHeight: 90, textAlignVertical: "top" }}
            multiline
            editable={!saving}
          />
        </Card>

        <Card style={styles.card2}>
          <Text style={styles.title}>{t("profile.edit.romance.richProfile")}</Text>
          <Text style={styles.subtitle}>{t("profile.edit.romance.richProfileSub")}</Text>

          <Input
            label={t("profile.edit.romance.lifestyleTags")}
            value={lifestyleTags}
            onChangeText={setLifestyleTags}
            placeholder={t("profile.edit.romance.lifestyleTagsPlaceholder")}
            editable={!saving}
          />

          <Text style={styles.label}>{t("profile.edit.romance.voicePrompt")}</Text>
          <View style={styles.voiceRow}>
            <SecondaryButton
              title={recorderState.isRecording ? t("profile.edit.romance.stopUpload") : t("profile.edit.romance.recordVoice")}
              onPress={handleVoicePress}
              disabled={saving}
              style={recorderState.isRecording ? { backgroundColor: theme.colors.errorBg } : undefined}
            />
            {voiceUrl ? (
              <Text style={styles.hint} numberOfLines={2}>
                {t("profile.edit.romance.voiceSaved")}
              </Text>
            ) : null}
          </View>

          <Text style={styles.label}>{t("profile.edit.romance.videoBio")}</Text>
          <SecondaryButton
            title={videoBioUrl ? t("profile.edit.romance.replaceVideo") : t("profile.edit.romance.pickVideo")}
            onPress={async () => {
              if (!user?.id) return;
              const url = await pickAndUploadVideo(user.id, "romance");
              if (url) setVideoBioUrl(url);
            }}
            disabled={saving}
          />
          {videoBioUrl ? (
            <Text style={{ ...styles.hint, marginTop: theme.spacing.sm }} numberOfLines={1}>
              {t("profile.edit.romance.videoAdded")}
            </Text>
          ) : null}
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
    card2: { marginTop: theme.spacing.lg },
    title: { ...theme.type.h2, fontFamily: theme.type.h2.fontFamily, color: theme.colors.textPrimary, marginBottom: theme.spacing.xxs },
    subtitle: { ...theme.type.body, fontFamily: theme.type.body.fontFamily, color: theme.colors.textSecondary, marginBottom: theme.spacing.md },
    label: {
      ...theme.type.caption,
      fontFamily: theme.type.caption.fontFamily,
      color: theme.colors.textSecondary,
      marginBottom: theme.spacing.xs,
    },
    voiceRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: theme.spacing.sm, marginBottom: theme.spacing.md },
    hint: { ...theme.type.caption, fontFamily: theme.type.caption.fontFamily, color: theme.colors.textSecondary, flex: 1 },
  });
}
