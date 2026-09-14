/**
 * Trip intent mini-flow: collects scope, vibe, optional destination/radius, activity level, must-haves.
 * Who joins is collected later in ConciergeSocialStep.
 */

import React, { useMemo, useState, useEffect, useCallback } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { GestureScrollView } from "@/components/ui/GestureScrollView";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { Card, Chip, PrimaryButton } from "@/components/ds";
import { useAppTheme } from "@/constants/design-system";
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
  const theme = useAppTheme();
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

  const cardTitleStyle = [theme.type.body, { color: theme.colors.textPrimary, fontFamily: theme.type.body.fontFamily, fontWeight: "600" as const, marginBottom: theme.spacing.sm }];
  const cardSubtitleStyle = [theme.type.caption, { color: theme.colors.textSecondary, fontFamily: theme.type.caption.fontFamily, marginBottom: theme.spacing.lg }];

  const optionRow = (opt: { id: string; label: string; hint?: string }, active: boolean, onPress: () => void) => (
    <TouchableOpacity
      key={opt.id}
      style={{
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: theme.spacing.md,
        paddingHorizontal: theme.spacing.md,
        borderRadius: theme.radii.md,
        borderWidth: 1,
        borderColor: active ? theme.colors.primary : theme.colors.border,
        backgroundColor: active ? theme.colors.surface : theme.colors.backgroundMuted,
      }}
      onPress={onPress}
      activeOpacity={0.85}
    >
      <View style={{ flex: 1 }}>
        <Text style={[theme.type.body, { color: active ? theme.colors.primary : theme.colors.textPrimary, fontFamily: theme.type.body.fontFamily, fontWeight: "600" }]}>
          {opt.label}
        </Text>
        {opt.hint ? (
          <Text style={[theme.type.caption, { color: theme.colors.textSecondary, fontFamily: theme.type.caption.fontFamily, marginTop: 2 }]}>
            {opt.hint}
          </Text>
        ) : null}
      </View>
      <Ionicons
        name={active ? "checkmark-circle" : "ellipse-outline"}
        size={22}
        color={active ? theme.colors.primary : theme.colors.textMuted}
      />
    </TouchableOpacity>
  );

  const renderCard = () => {
    switch (cardId) {
      case "scope":
        return (
          <>
            <Text style={cardTitleStyle}>Where is this trip?</Text>
            <Text style={cardSubtitleStyle}>Pick what best describes your plan</Text>
            <View style={{ gap: theme.spacing.sm }}>
              {SCOPE_OPTIONS.map((o) =>
                optionRow(o, answers.scope === o.id, () => {
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
                })
              )}
            </View>
          </>
        );
      case "vibe":
        return (
          <>
            <Text style={cardTitleStyle}>What vibe are you after?</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.sm }}>
              {VIBE_OPTIONS.map((o) => (
                <Chip
                  key={o.id}
                  label={o.label}
                  selected={answers.vibe === o.id}
                  onPress={() => {
                    Haptics.selectionAsync();
                    setAnswers((prev) => ({ ...prev, vibe: o.id }));
                  }}
                />
              ))}
            </View>
          </>
        );
      case "destination_decided":
        return (
          <>
            <Text style={cardTitleStyle}>Do you already know where you’re going?</Text>
            <View style={{ flexDirection: "row", gap: theme.spacing.md }}>
              {([
                { value: true, label: "Yes" },
                { value: false, label: "Not yet" },
              ] as const).map((opt) => {
                const active = answers.destinationDecided === opt.value;
                return (
                  <TouchableOpacity
                    key={opt.label}
                    style={{
                      flex: 1,
                      paddingVertical: theme.spacing.md,
                      borderRadius: theme.radii.md,
                      backgroundColor: active ? theme.colors.surface : theme.colors.backgroundMuted,
                      alignItems: "center",
                      borderWidth: 1,
                      borderColor: active ? theme.colors.primary : theme.colors.border,
                    }}
                    onPress={() => {
                      Haptics.selectionAsync();
                      setAnswers((prev) =>
                        opt.value
                          ? { ...prev, destinationDecided: true, travelRadius: undefined, mustHaves: [] }
                          : { ...prev, destinationDecided: false }
                      );
                    }}
                  >
                    <Text style={[theme.type.body, { color: active ? theme.colors.primary : theme.colors.textSecondary, fontFamily: theme.type.body.fontFamily, fontWeight: "600" }]}>
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </>
        );
      case "activity_level":
        return (
          <>
            <Text style={cardTitleStyle}>How intense should days be?</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.sm }}>
              {LEVEL_OPTIONS.map((o) => (
                <Chip
                  key={o.id}
                  label={o.label}
                  selected={answers.activityLevel === o.id}
                  onPress={() => {
                    Haptics.selectionAsync();
                    setAnswers((prev) => ({ ...prev, activityLevel: o.id }));
                  }}
                />
              ))}
            </View>
          </>
        );
      case "must_haves":
        return (
          <>
            <Text style={cardTitleStyle}>Any must-haves?</Text>
            <Text style={cardSubtitleStyle}>Select any that apply — optional</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.sm }}>
              {MUST_HAVE_CHIPS.map((label) => {
                const selected = answers.mustHaves?.includes(label);
                return (
                  <Chip
                    key={label}
                    label={label}
                    selected={selected}
                    onPress={() => {
                      Haptics.selectionAsync();
                      setAnswers((prev) => {
                        const cur = prev.mustHaves ?? [];
                        const next = selected ? cur.filter((x) => x !== label) : [...cur, label];
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
            <Text style={cardTitleStyle}>How far are you willing to travel?</Text>
            <View style={{ gap: theme.spacing.sm }}>
              {RADIUS_OPTIONS.map((o) =>
                optionRow(o, answers.travelRadius === o.id, () => {
                  Haptics.selectionAsync();
                  setAnswers((prev) => ({ ...prev, travelRadius: o.id }));
                })
              )}
            </View>
          </>
        );
      default:
        return null;
    }
  };

  return (
    <GestureScrollView style={styles.scroll} contentContainerStyle={{ paddingHorizontal: theme.spacing.xl, paddingBottom: theme.spacing.xxl }}>
      <TouchableOpacity onPress={onBack} style={styles.backRow} activeOpacity={0.8}>
        <Ionicons name="arrow-back" size={22} color={theme.colors.primary} />
        <Text style={[theme.type.caption, { color: theme.colors.primary, fontFamily: theme.type.caption.fontFamily, fontWeight: "600" }]}>
          Back
        </Text>
      </TouchableOpacity>

      <Text style={[theme.type.h3, { color: theme.colors.textPrimary, fontFamily: theme.type.h3.fontFamily, marginBottom: theme.spacing.xxs }]}>
        Plan your trip
      </Text>
      <Text style={[theme.type.caption, { color: theme.colors.textMuted, fontFamily: theme.type.caption.fontFamily, marginBottom: theme.spacing.lg }]}>
        {progressLabel}
      </Text>

      <Card elevation={0} padding="lg" style={{ marginBottom: theme.spacing.xl }}>
        {renderCard()}
      </Card>

      <PrimaryButton
        title={stepIndex >= visible.length - 1 ? "Continue to details" : "Next"}
        onPress={goNext}
        disabled={!canAdvance}
      />
    </GestureScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  backRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 12 },
});
