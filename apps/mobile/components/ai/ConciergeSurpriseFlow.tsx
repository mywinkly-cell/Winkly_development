/**
 * "Surprise me" — one tap, zero input. Asks winkly_plan for three different future plans
 * (cosy / active / social), shows them as PlanCards, and hands the chosen one to
 * ConciergeConfirmStep's locked-plan path (venue + time already decided).
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Linking, ActivityIndicator } from "react-native";
import { useTranslation } from "react-i18next";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { useAppTheme, type AppTheme } from "@/constants/design-system";
import { Header, PrimaryButton, TextButton } from "@/components/ds";
import { PlanCard, PlanCardBadge, PlanCardMeta, PlanCardMapLink } from "@/components/plans/PlanCard";
import { GestureScrollView } from "@/components/ui/GestureScrollView";
import { AIDisclosureNote } from "@/components/ai/AIDisclosureNote";
import { FitReasonLine } from "@/components/ai/FitReasonLine";
import { ConciergeRateLimitCard } from "@/components/ai/ConciergeRateLimitCard";
import { ConciergeConfirmStep } from "@/components/ai/ConciergeConfirmStep";
import { callWinklySurprise, type WinklySurpriseResult } from "@/lib/ai/conciergeClient";
import {
  futureSurpriseOptions,
  surpriseOptionStart,
  surpriseToPlannerPlan,
  type SurprisePlanOption,
} from "@/lib/ai/surprisePlan";
import { formatAppDateTime } from "@/lib/i18n/appLocale";
import { formatDefaultLocationDisplay } from "@/lib/location/countryDisplay";
import type { Mode } from "@/types";

type Phase = "loading" | "results" | "limit" | "error" | "confirm";
type SurpriseLimit = Extract<WinklySurpriseResult, { ok: false }>["limit"];

export type ConciergeSurpriseFlowProps = {
  mode: Mode;
  defaultCity?: string;
  defaultCountry?: string;
  /** Called when done — with the new planner_item id after a successful "Add to planner". */
  onClose: (plannerItemId?: string) => void;
  onBack: () => void;
};

export function ConciergeSurpriseFlow({ mode, defaultCity, defaultCountry, onClose, onBack }: ConciergeSurpriseFlowProps) {
  const theme = useAppTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { t, i18n } = useTranslation();
  const accent = theme.modeAccent(mode).primary;

  const [phase, setPhase] = useState<Phase>("loading");
  const [options, setOptions] = useState<SurprisePlanOption[]>([]);
  const [limit, setLimit] = useState<SurpriseLimit>(undefined);
  const [requestId, setRequestId] = useState<string | undefined>(undefined);
  const [chosen, setChosen] = useState<SurprisePlanOption | null>(null);
  const runIdRef = useRef(0);

  const run = useCallback(async () => {
    const runId = ++runIdRef.current;
    setPhase("loading");
    setLimit(undefined);
    setChosen(null);
    // No city yet (profile still loading) is fine — the server falls back to the profile city.
    const res = await callWinklySurprise({ mode, city: defaultCity, country: defaultCountry });
    if (runId !== runIdRef.current) return;
    if (!res.ok) {
      setLimit(res.limit);
      setPhase(res.limit ? "limit" : "error");
      return;
    }
    const future = futureSurpriseOptions(res.options);
    if (!future.length) {
      setPhase("error");
      return;
    }
    setOptions(future);
    setRequestId(res.requestId);
    setPhase("results");
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, [mode, defaultCity, defaultCountry]);

  // One tap = one request: fire once on open (not again when the default city arrives);
  // later runs only from an explicit tap.
  const startedRef = useRef(false);
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    void run();
  }, [run]);
  useEffect(
    () => () => {
      runIdRef.current += 1; // ignore a response that lands after unmount
    },
    [],
  );

  const handleBack = useCallback(() => {
    if (phase === "confirm") {
      setChosen(null);
      setPhase("results");
      return;
    }
    onBack();
  }, [phase, onBack]);

  const locationLine = formatDefaultLocationDisplay(defaultCity, defaultCountry, i18n?.language ?? "en");
  const chosenStart = chosen ? surpriseOptionStart(chosen) : null;

  return (
    <View style={styles.container}>
      <Header
        title={t("surprise.title")}
        onBack={handleBack}
        trailing={
          <TouchableOpacity
            onPress={() => {
              void Haptics.selectionAsync();
              onClose();
            }}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            accessibilityLabel={t("common.close")}
            accessibilityRole="button"
          >
            <Ionicons name="close" size={22} color={theme.colors.textSecondary} />
          </TouchableOpacity>
        }
      />

      {phase === "loading" ? (
        <View style={styles.center} accessibilityLiveRegion="polite">
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={styles.loadingText}>{t("surprise.loading")}</Text>
        </View>
      ) : null}

      {phase === "limit" && limit?.error_code ? (
        <GestureScrollView>
          <ConciergeRateLimitCard
            variant="surprise"
            errorCode={limit.error_code}
            limitType={limit.limit_type}
            retryAfter={limit.retry_after}
            upgradeTo={limit.upgrade_to}
            onRetry={() => void run()}
          />
        </GestureScrollView>
      ) : null}

      {phase === "error" ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>{t("surprise.error")}</Text>
          <PrimaryButton title={t("surprise.retry")} onPress={() => void run()} />
        </View>
      ) : null}

      {phase === "results" ? (
        <GestureScrollView contentContainerStyle={styles.results}>
          <AIDisclosureNote />
          <Text style={styles.intro}>{t("surprise.intro")}</Text>
          {options.map((opt) => {
            const start = surpriseOptionStart(opt);
            const venueLine = [opt.venue.name, opt.venue.estimated_cost].filter(Boolean).join(" • ");
            return (
              <PlanCard
                key={opt.vibe}
                accentColor={accent}
                title={opt.title}
                badges={<PlanCardBadge label={t(`surprise.vibe.${opt.vibe}`)} variant="solid" color={accent} />}
                meta={
                  <>
                    {start ? <PlanCardMeta icon="time-outline">{formatAppDateTime(start)}</PlanCardMeta> : null}
                    {venueLine ? (
                      <PlanCardMeta icon="location-outline" numberOfLines={2}>
                        {venueLine}
                      </PlanCardMeta>
                    ) : null}
                  </>
                }
                mapAction={
                  opt.venue.google_maps_link ? (
                    <PlanCardMapLink
                      label={t("surprise.openInMaps")}
                      onPress={() => void Linking.openURL(opt.venue.google_maps_link)}
                    />
                  ) : undefined
                }
                primaryAction={{
                  label: t("surprise.addToPlanner"),
                  tone: accent,
                  onPress: () => {
                    setChosen(opt);
                    setPhase("confirm");
                  },
                }}
              >
                <FitReasonLine reason={opt.fit_reason || opt.why_this_fits} accentColor={accent} />
                {opt.weather_note ? (
                  <Text numberOfLines={2} style={styles.weather}>
                    {opt.weather_note}
                  </Text>
                ) : null}
              </PlanCard>
            );
          })}
          <TextButton title={t("surprise.again")} onPress={() => void run()} />
        </GestureScrollView>
      ) : null}

      {phase === "confirm" && chosen && chosenStart ? (
        <ConciergeConfirmStep
          structuredPlan={surpriseToPlannerPlan(chosen)}
          partner={null}
          dateForPlan={chosenStart}
          exactTimeHm={chosen.start_time}
          locationLineDisplay={locationLine || undefined}
          mode={mode}
          aiRequestId={requestId}
          onDone={onClose}
          onBack={handleBack}
          showInlineBack={false}
        />
      ) : null}
    </View>
  );
}

function makeStyles(theme: AppTheme) {
  return StyleSheet.create({
    container: { flex: 1 },
    center: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      padding: theme.spacing.xl,
      gap: theme.spacing.md,
    },
    loadingText: { ...theme.type.body, color: theme.colors.textSecondary, textAlign: "center" },
    errorText: { ...theme.type.body, color: theme.colors.textSecondary, textAlign: "center" },
    results: {
      paddingHorizontal: theme.spacing.xl,
      paddingBottom: theme.spacing.xl,
      gap: theme.spacing.md,
    },
    intro: { ...theme.type.body, color: theme.colors.textPrimary },
    weather: {
      ...theme.type.caption,
      color: theme.colors.textSecondary,
      marginTop: theme.spacing.xs,
    },
  });
}
