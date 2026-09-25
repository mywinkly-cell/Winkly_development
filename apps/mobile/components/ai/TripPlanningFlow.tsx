/**
 * Trip intent mini-flow: collects scope, vibe, optional destination/radius, activity level, must-haves.
 * Who joins is collected later in ConciergeSocialStep.
 */

import React, { useMemo, useState, useEffect, useCallback } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";
import { GestureScrollView } from "@/components/ui/GestureScrollView";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { useAppTheme, type AppTheme } from "@/constants/design-system";
import { Card, Chip, PrimaryButton, TextButton } from "@/components/ds";
import {
  type ActivityDetails,
  type TripPlanningAnswers,
  type TripScope,
  type TripVibe,
  type ActivityLevel,
  type TravelRadius,
  tripAnswersToActivityDetails,
} from "@/lib/ai/conciergePlanningFlow";

export type TripPlanningFlowProps = {
  existingDetails: Partial<ActivityDetails>;
  onComplete: (merged: Partial<ActivityDetails>) => void;
  onBack: () => void;
};

type TripCardId =
  | "scope"
  | "vibe"
  | "destination_decided"
  | "activity_level"
  | "must_haves"
  | "travel_radius";

// Labels: concierge.trip.scope.<id> (+ .hint), concierge.trip.vibe.<id>, concierge.trip.level.<id>,
// concierge.trip.radius.<id>, concierge.trip.mustHave.<id>.
const SCOPE_OPTIONS: TripScope[] = ["own_city", "nearby", "new_destination"];
const VIBE_OPTIONS: TripVibe[] = ["culture", "food", "outdoors", "entertainment", "mixed"];
const LEVEL_OPTIONS: ActivityLevel[] = ["easy", "moderate", "intense"];
const RADIUS_OPTIONS: TravelRadius[] = ["1h", "2-3h", "3-5h", "5h+"];
const MUST_HAVE_IDS: string[] = [
  "photo_spots",
  "kid_friendly",
  "budget",
  "luxury",
  "walkable",
  "nature",
  "nightlife",
  "markets",
  "museums",
  "wellness",
];

function visibleTripCards(a: Partial<TripPlanningAnswers>): TripCardId[] {
  const out: TripCardId[] = ["scope", "vibe"];
  if (a.scope === "new_destination") out.push("destination_decided");
  out.push("activity_level");
  if (a.scope === "new_destination" && a.destinationDecided === false) {
    out.push("must_haves", "travel_radius");
  }
  return out;
}

function buildCompleteAnswers(a: Partial<TripPlanningAnswers>): TripPlanningAnswers | null {
  if (!a.scope || !a.vibe || !a.activityLevel) return null;
  if (a.scope === "new_destination" && a.destinationDecided === undefined) return null;
  if (a.scope === "new_destination" && a.destinationDecided === false) {
    if (!a.travelRadius) return null;
  }
  return {
    scope: a.scope,
    vibe: a.vibe,
    activityLevel: a.activityLevel,
    mustHaves: a.mustHaves ?? [],
    destinationDecided: a.scope !== "new_destination" ? true : !!a.destinationDecided,
    travelRadius:
      a.scope === "new_destination" && a.destinationDecided === false ? a.travelRadius : undefined,
  };
}

export function TripPlanningFlow({ existingDetails, onComplete, onBack }: TripPlanningFlowProps) {
  const { t } = useTranslation();
  const theme = useAppTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [answers, setAnswers] = useState<Partial<TripPlanningAnswers>>({});
  const visible = useMemo(() => visibleTripCards(answers), [answers]);
  const [stepIndex, setStepIndex] = useState(0);

  useEffect(() => {
    setStepIndex((i) => Math.min(i, Math.max(0, visible.length - 1)));
  }, [visible.length]);

  const cardId = visible[stepIndex];
  const progressLabel = t("concierge.trip.progress", { step: stepIndex + 1, total: visible.length });

  const goNext = useCallback(() => {
    if (stepIndex >= visible.length - 1) {
      const done = buildCompleteAnswers(answers);
      if (!done) return;
      onComplete(tripAnswersToActivityDetails(done, existingDetails));
      return;
    }
    setStepIndex((i) => i + 1);
  }, [answers, existingDetails, onComplete, stepIndex, visible.length]);

  const canAdvance = useMemo(() => {
    switch (cardId) {
      case "scope":
        return !!answers.scope;
      case "vibe":
        return !!answers.vibe;
      case "destination_decided":
        return answers.destinationDecided !== undefined;
      case "activity_level":
        return !!answers.activityLevel;
      case "must_haves":
        return true;
      case "travel_radius":
        return !!answers.travelRadius;
      default:
        return false;
    }
  }, [answers, cardId]);

  const renderCard = () => {
    switch (cardId) {
      case "scope":
        return (
          <>
            <Text style={styles.cardTitle}>{t("concierge.trip.scopeTitle")}</Text>
            <Text style={styles.cardSubtitle}>{t("concierge.trip.scopeSubtitle")}</Text>
            <View style={styles.optionCol}>
              {SCOPE_OPTIONS.map((id) => (
                <TouchableOpacity
                  key={id}
                  style={[styles.optionRow, answers.scope === id && styles.optionRowActive]}
                  onPress={() => {
                    Haptics.selectionAsync();
                    setAnswers((prev) => {
                      const next = { ...prev, scope: id };
                      if (id !== "new_destination") {
                        delete next.destinationDecided;
                        delete next.travelRadius;
                        next.mustHaves = [];
                      }
                      return next;
                    });
                  }}
                  activeOpacity={0.85}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.optionTitle, answers.scope === id && styles.optionTitleActive]}>{t(`concierge.trip.scope.${id}`)}</Text>
                    <Text style={styles.optionHint}>{t(`concierge.trip.scope.${id}.hint`)}</Text>
                  </View>
                  {answers.scope === id ? (
                    <Ionicons name="checkmark-circle" size={22} color={theme.colors.primary} />
                  ) : (
                    <Ionicons name="ellipse-outline" size={22} color={theme.colors.textMuted} />
                  )}
                </TouchableOpacity>
              ))}
            </View>
          </>
        );
      case "vibe":
        return (
          <>
            <Text style={styles.cardTitle}>{t("concierge.trip.vibeTitle")}</Text>
            <View style={styles.chipsWrap}>
              {VIBE_OPTIONS.map((id) => (
                <Chip
                  key={id}
                  label={t(`concierge.trip.vibe.${id}`)}
                  selected={answers.vibe === id}
                  onPress={() => setAnswers((prev) => ({ ...prev, vibe: id }))}
                />
              ))}
            </View>
          </>
        );
      case "destination_decided":
        return (
          <>
            <Text style={styles.cardTitle}>{t("concierge.trip.destinationTitle")}</Text>
            <View style={styles.binaryRow}>
              <TouchableOpacity
                style={[styles.binaryBtn, answers.destinationDecided === true && styles.binaryBtnActive]}
                onPress={() => {
                  Haptics.selectionAsync();
                  setAnswers((prev) => ({
                    ...prev,
                    destinationDecided: true,
                    travelRadius: undefined,
                    mustHaves: [],
                  }));
                }}
              >
                <Text style={[styles.binaryText, answers.destinationDecided === true && styles.binaryTextActive]}>{t("common.yes")}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.binaryBtn, answers.destinationDecided === false && styles.binaryBtnActive]}
                onPress={() => {
                  Haptics.selectionAsync();
                  setAnswers((prev) => ({ ...prev, destinationDecided: false }));
                }}
              >
                <Text style={[styles.binaryText, answers.destinationDecided === false && styles.binaryTextActive]}>{t("concierge.trip.notYet")}</Text>
              </TouchableOpacity>
            </View>
          </>
        );
      case "activity_level":
        return (
          <>
            <Text style={styles.cardTitle}>{t("concierge.trip.levelTitle")}</Text>
            <View style={styles.chipsWrap}>
              {LEVEL_OPTIONS.map((id) => (
                <Chip
                  key={id}
                  label={t(`concierge.trip.level.${id}`)}
                  selected={answers.activityLevel === id}
                  onPress={() => setAnswers((prev) => ({ ...prev, activityLevel: id }))}
                />
              ))}
            </View>
          </>
        );
      case "must_haves":
        return (
          <>
            <Text style={styles.cardTitle}>{t("concierge.trip.mustHavesTitle")}</Text>
            <Text style={styles.cardSubtitle}>{t("concierge.trip.mustHavesSubtitle")}</Text>
            <View style={styles.chipsWrap}>
              {MUST_HAVE_IDS.map((id) => {
                const selected = answers.mustHaves?.includes(id);
                return (
                  <Chip
                    key={id}
                    label={t(`concierge.trip.mustHave.${id}`)}
                    selected={selected}
                    onPress={() => {
                      setAnswers((prev) => {
                        const cur = prev.mustHaves ?? [];
                        const next = selected ? cur.filter((x) => x !== id) : [...cur, id];
                        return { ...prev, mustHaves: next };
                      });
                    }}
                  />
                );
              })}
            </View>
          </>
        );
      case "travel_radius":
        return (
          <>
            <Text style={styles.cardTitle}>{t("concierge.trip.radiusTitle")}</Text>
            <View style={styles.optionCol}>
              {RADIUS_OPTIONS.map((id) => (
                <TouchableOpacity
                  key={id}
                  style={[styles.optionRow, answers.travelRadius === id && styles.optionRowActive]}
                  onPress={() => {
                    Haptics.selectionAsync();
                    setAnswers((prev) => ({ ...prev, travelRadius: id }));
                  }}
                  activeOpacity={0.85}
                >
                  <Text style={[styles.optionTitle, { flex: 1 }, answers.travelRadius === id && styles.optionTitleActive]}>{t(`concierge.trip.radius.${id}`)}</Text>
                  {answers.travelRadius === id ? (
                    <Ionicons name="checkmark-circle" size={22} color={theme.colors.primary} />
                  ) : (
                    <Ionicons name="ellipse-outline" size={22} color={theme.colors.textMuted} />
                  )}
                </TouchableOpacity>
              ))}
            </View>
          </>
        );
      default:
        return null;
    }
  };

  return (
    <GestureScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      <TextButton
        title={t("common.back")}
        icon={<Ionicons name="arrow-back" size={20} color={theme.colors.primary} />}
        onPress={onBack}
        style={styles.backRow}
      />

      <Text style={styles.title}>{t("concierge.trip.title")}</Text>
      <Text style={styles.progress}>{progressLabel}</Text>

      <Card style={styles.card} elevation={1}>{renderCard()}</Card>

      <PrimaryButton
        title={stepIndex >= visible.length - 1 ? t("concierge.trip.continueToDetails") : t("common.next")}
        onPress={goNext}
        disabled={!canAdvance}
      />
    </GestureScrollView>
  );
}

function makeStyles(theme: AppTheme) {
  return StyleSheet.create({
    scroll: { flex: 1 },
    content: { paddingHorizontal: theme.spacing.xl, paddingBottom: theme.spacing.xxl },
    backRow: { alignSelf: "flex-start", marginBottom: theme.spacing.sm, paddingLeft: 0 },
    title: { ...theme.type.h3, color: theme.colors.textPrimary, marginBottom: theme.spacing.xs },
    progress: { ...theme.type.caption, color: theme.colors.textMuted, marginBottom: theme.spacing.lg },
    card: {
      marginBottom: theme.spacing.lg,
    },
    cardTitle: { ...theme.type.body, fontWeight: "600", color: theme.colors.textPrimary, marginBottom: theme.spacing.sm },
    cardSubtitle: { ...theme.type.caption, color: theme.colors.textSecondary, marginBottom: theme.spacing.lg },
    optionCol: { gap: theme.spacing.sm },
    optionRow: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: theme.spacing.lg,
      paddingHorizontal: theme.spacing.lg,
      borderRadius: theme.radii.md,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.backgroundMuted,
    },
    optionRowActive: {
      borderColor: theme.colors.primary,
      backgroundColor: theme.colors.surface,
    },
    optionTitle: { ...theme.type.body, color: theme.colors.textPrimary, fontWeight: "600" },
    optionTitleActive: { color: theme.colors.primary },
    optionHint: { ...theme.type.caption, color: theme.colors.textSecondary, marginTop: 2 },
    chipsWrap: { flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.sm },
    binaryRow: { flexDirection: "row", gap: theme.spacing.md },
    binaryBtn: {
      flex: 1,
      paddingVertical: theme.spacing.lg,
      borderRadius: theme.radii.md,
      backgroundColor: theme.colors.backgroundMuted,
      alignItems: "center",
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    binaryBtnActive: { borderColor: theme.colors.primary, backgroundColor: theme.colors.surface },
    binaryText: { ...theme.type.body, color: theme.colors.textSecondary, fontWeight: "600" },
    binaryTextActive: { color: theme.colors.primary },
  });
}
