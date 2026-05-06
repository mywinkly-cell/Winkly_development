/**
 * Trip intent mini-flow: collects scope, vibe, optional destination/radius, activity level, must-haves.
 * Who joins is collected later in ConciergeSocialStep.
 */

import React, { useMemo, useState, useEffect, useCallback } from "react";
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from "react-native";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { Colors, Typography, Layout } from "@/constants/tokens";
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

const SCOPE_OPTIONS: { id: TripScope; label: string; hint: string }[] = [
  { id: "own_city", label: "My city / area", hint: "Stay local" },
  { id: "nearby", label: "Nearby", hint: "Short hop away" },
  { id: "new_destination", label: "New destination", hint: "Further afield" },
];

const VIBE_OPTIONS: { id: TripVibe; label: string }[] = [
  { id: "culture", label: "Culture & history" },
  { id: "food", label: "Food & dining" },
  { id: "outdoors", label: "Outdoors & nature" },
  { id: "entertainment", label: "Shopping & entertainment" },
  { id: "mixed", label: "A bit of everything" },
];

const LEVEL_OPTIONS: { id: ActivityLevel; label: string }[] = [
  { id: "easy", label: "Easy-going" },
  { id: "moderate", label: "Moderate" },
  { id: "intense", label: "Packed / intense" },
];

const RADIUS_OPTIONS: { id: TravelRadius; label: string }[] = [
  { id: "1h", label: "Up to ~1 hour" },
  { id: "2-3h", label: "~2–3 hours" },
  { id: "3-5h", label: "~3–5 hours" },
  { id: "5h+", label: "5+ hours / flights OK" },
];

const MUST_HAVE_CHIPS: string[] = [
  "Great photo spots",
  "Kid-friendly",
  "Budget-conscious",
  "Luxury touches",
  "Walkable center",
  "Nature / parks",
  "Nightlife",
  "Local markets",
  "Museums",
  "Wellness / spa",
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
  const [answers, setAnswers] = useState<Partial<TripPlanningAnswers>>({});
  const visible = useMemo(() => visibleTripCards(answers), [answers]);
  const [stepIndex, setStepIndex] = useState(0);

  useEffect(() => {
    setStepIndex((i) => Math.min(i, Math.max(0, visible.length - 1)));
  }, [visible.length]);

  const cardId = visible[stepIndex];
  const progressLabel = `${stepIndex + 1} / ${visible.length}`;

  const goNext = useCallback(() => {
    Haptics.selectionAsync();
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
            <Text style={styles.cardTitle}>Where is this trip?</Text>
            <Text style={styles.cardSubtitle}>Pick what best describes your plan</Text>
            <View style={styles.optionCol}>
              {SCOPE_OPTIONS.map((o) => (
                <TouchableOpacity
                  key={o.id}
                  style={[styles.optionRow, answers.scope === o.id && styles.optionRowActive]}
                  onPress={() => {
                    Haptics.selectionAsync();
                    setAnswers((prev) => {
                      const next = { ...prev, scope: o.id };
                      if (o.id !== "new_destination") {
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
                    <Text style={[styles.optionTitle, answers.scope === o.id && styles.optionTitleActive]}>{o.label}</Text>
                    <Text style={styles.optionHint}>{o.hint}</Text>
                  </View>
                  {answers.scope === o.id ? (
                    <Ionicons name="checkmark-circle" size={22} color={Colors.primaryViolet} />
                  ) : (
                    <Ionicons name="ellipse-outline" size={22} color={Colors.gray400} />
                  )}
                </TouchableOpacity>
              ))}
            </View>
          </>
        );
      case "vibe":
        return (
          <>
            <Text style={styles.cardTitle}>What vibe are you after?</Text>
            <View style={styles.chipsWrap}>
              {VIBE_OPTIONS.map((o) => (
                <TouchableOpacity
                  key={o.id}
                  style={[styles.chip, answers.vibe === o.id && styles.chipActive]}
                  onPress={() => {
                    Haptics.selectionAsync();
                    setAnswers((prev) => ({ ...prev, vibe: o.id }));
                  }}
                  activeOpacity={0.85}
                >
                  <Text style={[styles.chipText, answers.vibe === o.id && styles.chipTextActive]}>{o.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        );
      case "destination_decided":
        return (
          <>
            <Text style={styles.cardTitle}>Do you already know where you’re going?</Text>
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
                <Text style={[styles.binaryText, answers.destinationDecided === true && styles.binaryTextActive]}>Yes</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.binaryBtn, answers.destinationDecided === false && styles.binaryBtnActive]}
                onPress={() => {
                  Haptics.selectionAsync();
                  setAnswers((prev) => ({ ...prev, destinationDecided: false }));
                }}
              >
                <Text style={[styles.binaryText, answers.destinationDecided === false && styles.binaryTextActive]}>Not yet</Text>
              </TouchableOpacity>
            </View>
          </>
        );
      case "activity_level":
        return (
          <>
            <Text style={styles.cardTitle}>How intense should days be?</Text>
            <View style={styles.chipsWrap}>
              {LEVEL_OPTIONS.map((o) => (
                <TouchableOpacity
                  key={o.id}
                  style={[styles.chip, answers.activityLevel === o.id && styles.chipActive]}
                  onPress={() => {
                    Haptics.selectionAsync();
                    setAnswers((prev) => ({ ...prev, activityLevel: o.id }));
                  }}
                  activeOpacity={0.85}
                >
                  <Text style={[styles.chipText, answers.activityLevel === o.id && styles.chipTextActive]}>{o.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        );
      case "must_haves":
        return (
          <>
            <Text style={styles.cardTitle}>Any must-haves?</Text>
            <Text style={styles.cardSubtitle}>Select any that apply — optional</Text>
            <View style={styles.chipsWrap}>
              {MUST_HAVE_CHIPS.map((label) => {
                const selected = answers.mustHaves?.includes(label);
                return (
                  <TouchableOpacity
                    key={label}
                    style={[styles.chip, selected && styles.chipActive]}
                    onPress={() => {
                      Haptics.selectionAsync();
                      setAnswers((prev) => {
                        const cur = prev.mustHaves ?? [];
                        const next = selected ? cur.filter((x) => x !== label) : [...cur, label];
                        return { ...prev, mustHaves: next };
                      });
                    }}
                    activeOpacity={0.85}
                  >
                    <Text style={[styles.chipText, selected && styles.chipTextActive]}>{label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </>
        );
      case "travel_radius":
        return (
          <>
            <Text style={styles.cardTitle}>How far are you willing to travel?</Text>
            <View style={styles.optionCol}>
              {RADIUS_OPTIONS.map((o) => (
                <TouchableOpacity
                  key={o.id}
                  style={[styles.optionRow, answers.travelRadius === o.id && styles.optionRowActive]}
                  onPress={() => {
                    Haptics.selectionAsync();
                    setAnswers((prev) => ({ ...prev, travelRadius: o.id }));
                  }}
                  activeOpacity={0.85}
                >
                  <Text style={[styles.optionTitle, answers.travelRadius === o.id && styles.optionTitleActive]}>{o.label}</Text>
                  {answers.travelRadius === o.id ? (
                    <Ionicons name="checkmark-circle" size={22} color={Colors.primaryViolet} />
                  ) : (
                    <Ionicons name="ellipse-outline" size={22} color={Colors.gray400} />
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
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <TouchableOpacity onPress={onBack} style={styles.backRow} activeOpacity={0.8}>
        <Ionicons name="arrow-back" size={22} color={Colors.primaryViolet} />
        <Text style={styles.backText}>Back</Text>
      </TouchableOpacity>

      <Text style={styles.title}>Plan your trip</Text>
      <Text style={styles.progress}>{progressLabel}</Text>

      <View style={styles.card}>{renderCard()}</View>

      <TouchableOpacity
        style={[styles.nextBtn, !canAdvance && styles.nextBtnDisabled]}
        onPress={goNext}
        disabled={!canAdvance}
        activeOpacity={0.9}
      >
        <Text style={styles.nextBtnText}>{stepIndex >= visible.length - 1 ? "Continue to details" : "Next"}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { paddingHorizontal: Layout.spacing.xl, paddingBottom: Layout.spacing.xxl },
  backRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 12,
  },
  backText: { ...Typography.caption, color: Colors.primaryViolet, fontWeight: "600" },
  title: { ...Typography.h3, color: Colors.textPrimary, marginBottom: 4 },
  progress: { ...Typography.caption, color: Colors.gray500, marginBottom: 16 },
  card: {
    backgroundColor: Colors.white,
    borderRadius: 20,
    padding: 20,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: Colors.gray200,
  },
  cardTitle: { ...Typography.body, fontWeight: "600", color: Colors.textPrimary, marginBottom: 8 },
  cardSubtitle: { ...Typography.caption, color: Colors.gray600, marginBottom: 16 },
  optionCol: { gap: 10 },
  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.gray200,
    backgroundColor: Colors.gray100,
  },
  optionRowActive: {
    borderColor: Colors.primaryViolet,
    backgroundColor: Colors.white,
  },
  optionTitle: { ...Typography.body, color: Colors.textPrimary, fontWeight: "600" },
  optionTitleActive: { color: Colors.primaryViolet },
  optionHint: { ...Typography.caption, color: Colors.gray600, marginTop: 2 },
  chipsWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: Colors.gray100,
    borderWidth: 1,
    borderColor: Colors.gray200,
  },
  chipActive: { backgroundColor: Colors.primaryViolet, borderColor: Colors.primaryViolet },
  chipText: { ...Typography.caption, color: Colors.gray700, fontWeight: "500" },
  chipTextActive: { color: Colors.white },
  binaryRow: { flexDirection: "row", gap: 12 },
  binaryBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: Colors.gray100,
    alignItems: "center",
    borderWidth: 1,
    borderColor: Colors.gray200,
  },
  binaryBtnActive: { borderColor: Colors.primaryViolet, backgroundColor: Colors.white },
  binaryText: { ...Typography.body, color: Colors.gray700, fontWeight: "600" },
  binaryTextActive: { color: Colors.primaryViolet },
  nextBtn: {
    backgroundColor: Colors.primaryViolet,
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: "center",
  },
  nextBtnDisabled: { opacity: 0.45 },
  nextBtnText: { ...Typography.button, color: Colors.white },
});
