// ────────────────────────────────────────────────
// Send feedback — always-available general app feedback (rating + free text),
// reached from General Settings → Support & legal.
// ────────────────────────────────────────────────

import React, { useState } from "react";
import { View, Text, TextInput, ScrollView, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { SafeScreenView } from "@/components/SafeScreenView";
import { Card, Header, PrimaryButton, TextButton } from "@/components/ds";
import { useAppTheme, type AppTheme } from "@/constants/design-system";
import { useModeContext } from "@/providers";
import { submitAppFeedback } from "@/lib/feedback/appFeedback";
import { StarRating } from "@/components/planner/StarRating";

export default function SendFeedbackScreen() {
  const router = useRouter();
  const theme = useAppTheme();
  const styles = createStyles(theme);
  const { context } = useModeContext();
  const [rating, setRating] = useState(0);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const canSubmit = (rating > 0 || note.trim().length > 0) && !submitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setSubmitting(true);
    try {
      const ok = await submitAppFeedback({
        rating: rating > 0 ? rating : null,
        note,
        screen: "settings/send-feedback",
        mode: context.active_mode ?? undefined,
      });
      if (ok) setSubmitted(true);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeScreenView style={styles.screen}>
      <Header
        title="Send feedback"
        onBack={() => {
          Haptics.selectionAsync();
          if (router.canGoBack()) router.back();
        }}
      />

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {submitted ? (
          <Card style={styles.card}>
            <Ionicons name="checkmark-circle" size={40} color={theme.colors.success} style={styles.thanksIcon} />
            <Text style={styles.thanksTitle}>Thanks for the feedback!</Text>
            <Text style={styles.thanksBody}>We read every note — it directly shapes what we build next.</Text>
            <TextButton
              title="Send more feedback"
              onPress={() => {
                setSubmitted(false);
                setRating(0);
                setNote("");
              }}
              style={styles.ghostBtn}
            />
          </Card>
        ) : (
          <Card style={styles.card}>
            <Text style={styles.intro}>How's Winkly working for you so far? Anything is helpful — a quick rating, a few words, or both.</Text>

            <View style={styles.starsRow}>
              <StarRating value={rating} onChange={setRating} size={34} />
            </View>

            <TextInput
              style={styles.noteInput}
              placeholder="What's working, what's not, what should we add? (optional)"
              placeholderTextColor={theme.colors.textMuted}
              value={note}
              onChangeText={setNote}
              multiline
              maxLength={1000}
            />

            <PrimaryButton title="Send feedback" onPress={() => void handleSubmit()} disabled={!canSubmit} loading={submitting} />
          </Card>
        )}
      </ScrollView>
    </SafeScreenView>
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.colors.backgroundMuted },
    scrollContent: { padding: theme.spacing.xl, paddingBottom: theme.spacing.huge },
    card: {},
    intro: { ...theme.type.body, fontFamily: theme.type.body.fontFamily, color: theme.colors.textSecondary, marginBottom: theme.spacing.xl },
    starsRow: { flexDirection: "row", justifyContent: "center", gap: theme.spacing.sm, marginBottom: theme.spacing.xl },
    noteInput: {
      ...theme.type.body,
      fontFamily: theme.type.body.fontFamily,
      color: theme.colors.textPrimary,
      backgroundColor: theme.colors.backgroundMuted,
      borderRadius: theme.radii.md,
      borderWidth: 1,
      borderColor: theme.colors.border,
      paddingHorizontal: theme.spacing.md,
      paddingVertical: theme.spacing.sm,
      minHeight: 100,
      textAlignVertical: "top",
      marginBottom: theme.spacing.xl,
    },
    thanksIcon: { alignSelf: "center", marginBottom: theme.spacing.md },
    thanksTitle: { ...theme.type.h3, fontFamily: theme.type.h3.fontFamily, color: theme.colors.textPrimary, textAlign: "center", marginBottom: theme.spacing.sm },
    thanksBody: { ...theme.type.body, fontFamily: theme.type.body.fontFamily, color: theme.colors.textSecondary, textAlign: "center", marginBottom: theme.spacing.lg },
    ghostBtn: { alignSelf: "center" },
  });
}
