/**
 * Winkly AI Concierge — planning flow container.
 * Step 1 Intent → 2 Activity Details (incl. who’s joining) → 3 Summary → 4 Suggestions/Invite → 5 Add to Planner
 */

import React, { useState, useCallback, useRef, useEffect, useMemo } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Linking,
  Share,
  ActivityIndicator,
  Modal,
  Pressable,
  Animated,
} from "react-native";
import { GestureDetector, Gesture } from "react-native-gesture-handler";
import { useTranslation } from "react-i18next";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import {
  buildOriginContext,
  type ConciergeContext,
  type ExperienceOption,
} from "@/lib/ai/conciergeClient";
import { getWeatherForCityAndDate, getWeatherForCityAndDateRange } from "@/lib/weatherClient";
import { formatDefaultLocationDisplay, normalizeLocationDisplayString } from "@/lib/location/countryDisplay";
import { ConciergeIntentStep } from "@/components/ai/ConciergeIntentStep";
import { ConciergeSubActivityStep } from "@/components/ai/ConciergeSubActivityStep";
import { ConciergeActivityDetailsStep } from "@/components/ai/ConciergeActivityDetailsStep";
import { ConciergeSummaryStep } from "@/components/ai/ConciergeSummaryStep";
import { ConciergeInviteStep } from "@/components/ai/ConciergeInviteStep";
import { ConciergeConfirmStep } from "@/components/ai/ConciergeConfirmStep";
import { TripPlanningFlow } from "@/components/ai/TripPlanningFlow";
import { getPlannerThemePlans, type PlannerThemePlanOption } from "@/lib/ai/strategicHost";
import {
  type ConciergeFlowStep,
  type WhoJoining,
  type ActivityDetails,
  type DatePreset,
  type TimeOfDay,
  type ActivityCategory,
  getSmartDefaultsForActivity,
  getActivityCategoryByKey,
  getIntentCards,
  type IntentSection,
  type RankInput,
  FOOD_AND_DRINKS_FORMAT_PROMPTS,
} from "@/lib/ai/conciergePlanningFlow";
import { buildPlanRequestText, inclusivePlanDayCount } from "@/lib/ai/buildPlanRequestText";
import { loadPlanningProfileContext, formatSanitizedPersonaForConciergePrompt } from "@/lib/ai/customPlanPresets";
import { supabase } from "@/lib/supabase";
import { saveConciergeFeedback, type ConciergeFeedbackType } from "@/lib/ai/conciergeStorage";
import { getPartnersForConcierge, searchWinklyUsersForInvite, type ConciergePartner } from "@/lib/ai/conciergePartners";
import { getMergedDeviceWhiteSpaceSlots, formatCalendarWhiteSpaceForGateway } from "@/lib/integrations/calendarWhiteSpace";
import { buildBookingContextForAi } from "@/lib/integrations/bookingLinks";
import { Avatar } from "@/components/ui/Avatar";
import { Colors, Typography, HEADER, HEADER_BAR_HEIGHT, Layout } from "@/constants/tokens";
import type { Mode } from "@/types";

function dayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** When `details.city` is missing, derive from "City, Country" — normalize ISO country segment first. */
function cityCountryFromLocation(loc: string | undefined, language: string): { city?: string; country?: string } {
  const s = loc?.trim() ?? "";
  if (!s) return {};
  const norm = normalizeLocationDisplayString(s, language);
  const lastComma = norm.lastIndexOf(",");
  if (lastComma < 0) return { city: norm };
  const city = norm.slice(0, lastComma).trim();
  const country = norm.slice(lastComma + 1).trim();
  return { city: city || undefined, country: country || undefined };
}

export type ConciergePlanningFlowProps = {
  mode: Mode;
  /**
   * Planner can open the concierge in an "all" scope (show the full cross-mode catalog).
   * When omitted, defaults to the passed `mode`.
   */
  plannerScope?: "all" | Mode;
  source_screen: "planner" | "chats";
  source_planner_tab?: "all" | "dates" | "meetups" | "business" | "events";
  defaultCity?: string;
  defaultCountry?: string;
  /** Optional match / connection for profile-aware ranking + gateway partner context. */
  partnerUserId?: string;
  partnerDisplayNameHint?: string;
  /** When opening from proactive "View plan" / "Invite someone": start at this step with pre-fill */
  initialStep?: "activity" | "social";
  proactiveActivityLabel?: string;
  proactiveDatePreset?: DatePreset;
  proactiveTimeOfDay?: TimeOfDay;
  onClose: () => void;
  onBack: () => void;
};

export function ConciergePlanningFlow({
  mode,
  plannerScope,
  source_screen,
  source_planner_tab,
  defaultCity,
  defaultCountry,
  partnerUserId,
  partnerDisplayNameHint,
  initialStep,
  proactiveActivityLabel,
  proactiveDatePreset,
  proactiveTimeOfDay,
  onClose,
  onBack,
}: ConciergePlanningFlowProps) {
  const { i18n } = useTranslation();
  const appLanguage = i18n?.language ?? "en";
  /** Planner "All" scope: grouped catalogue; chosen category sets planning mode for the rest of the flow. */
  const genericCategoryCatalog = source_screen === "planner" && plannerScope === "all";
  const [effectiveMode, setEffectiveMode] = useState<Mode>(mode);
  const [intentSections, setIntentSections] = useState<IntentSection[]>(() =>
    getIntentCards(genericCategoryCatalog ? "all" : mode)
  );
  const [selectedCategory, setSelectedCategory] = useState<ActivityCategory | null>(null);
  const [subActivityKey, setSubActivityKey] = useState<string | null>(null);
  const [subActivityLabel, setSubActivityLabel] = useState<string | null>(null);
  const [selectedTopic, setSelectedTopic] = useState<{ topic: string; subtopic: string } | null>(null);
  const [flowStep, setFlowStep] = useState<ConciergeFlowStep>("intent");
  const [activityKey, setActivityKey] = useState<string | null>(null);
  const [activityLabel, setActivityLabel] = useState<string | null>(null);
  const [details, setDetails] = useState<Partial<ActivityDetails>>({
    location: formatDefaultLocationDisplay(defaultCity, defaultCountry, appLanguage),
    datePreset: "today",
    date: new Date(),
    singleDay: true,
    timeOfDay: "any",
    budgetAmount: "",
    budgetCurrency: "EUR",
  });
  // Default to decide_later so the selection actually affects Summary/Invite even if user never taps it.
  const [whoJoining, setWhoJoining] = useState<WhoJoining>("decide_later");
  const [partnerId, setPartnerId] = useState<string | null>(() => partnerUserId ?? null);
  const [partnerDisplayName, setPartnerDisplayName] = useState<string | null>(() => partnerDisplayNameHint ?? null);
  const [partners, setPartners] = useState<ConciergePartner[]>([]);
  const [suggestions, setSuggestions] = useState<ExperienceOption[] | null>(null);
  const [structuredPlans, setStructuredPlans] = useState<PlannerThemePlanOption[] | null>(null);
  const [chosenIndex, setChosenIndex] = useState<number | null>(null);
  const [chosenStructuredIndex, setChosenStructuredIndex] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [noOptionsReason, setNoOptionsReason] = useState<string | null>(null);
  const lastContextRef = useRef<ConciergeContext | null>(null);
  const [showFeedbackFor, setShowFeedbackFor] = useState<ExperienceOption | null>(null);
  const [invitePickerChoice, setInvitePickerChoice] = useState<"matches" | "friends" | "contacts" | null>(null);
  const [invitePickerFromStep, setInvitePickerFromStep] = useState<"social" | "invite">("invite");
  const [contactsQuery, setContactsQuery] = useState("");
  const [contactsResults, setContactsResults] = useState<ConciergePartner[]>([]);
  const [contactsLoading, setContactsLoading] = useState(false);
  const lastDateRef = useRef<string>(dayKey(new Date()));
  const autoGenerateRef = useRef(false);
  const genAttemptRef = useRef(0);
  const swipeStartX = useRef(0);

  const [loadingPhaseIdx, setLoadingPhaseIdx] = useState(0);
  const loadingFade = useRef(new Animated.Value(0)).current;

  /** Single line for UI (cards, share, maps) — always expand ISO in "City, XX". */
  const locationLineDisplay = useMemo(
    () => (details.location?.trim() ? normalizeLocationDisplayString(details.location, appLanguage) : ""),
    [details.location, appLanguage]
  );

  useEffect(() => {
    if (genericCategoryCatalog) return;
    setEffectiveMode(mode);
  }, [mode, genericCategoryCatalog]);

  useEffect(() => {
    if (effectiveMode === "events") return;
    getPartnersForConcierge(effectiveMode).then(setPartners);
  }, [effectiveMode]);

  useEffect(() => {
    if (genericCategoryCatalog) {
      setIntentSections(getIntentCards("all"));
      return;
    }
    let cancelled = false;
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) {
        if (!cancelled) {
          setIntentSections(getIntentCards(mode));
        }
        return;
      }
      const { data: selfRow } = await supabase
        .from("profiles_mode")
        .select("interests, meta")
        .eq("user_id", uid)
        .eq("mode", mode)
        .maybeSingle();

      let partnerInterests: string[] | undefined;
      if (partnerUserId) {
        const { data: partnerRow } = await supabase
          .from("profiles_mode")
          .select("interests, meta")
          .eq("user_id", partnerUserId)
          .eq("mode", mode)
          .maybeSingle();
        partnerInterests = Array.isArray(partnerRow?.interests)
          ? partnerRow.interests.filter((x): x is string => typeof x === "string")
          : [];
      }

      const selfInterests = Array.isArray(selfRow?.interests)
        ? selfRow.interests.filter((x): x is string => typeof x === "string")
        : [];

      const rankInput: RankInput = {
        selfInterests,
        ...(partnerInterests?.length ? { partnerInterests } : {}),
      };
      if (!cancelled) setIntentSections(getIntentCards(mode, rankInput));
    })();
    return () => {
      cancelled = true;
    };
  }, [mode, partnerUserId, genericCategoryCatalog]);

  useEffect(() => {
    if (invitePickerChoice !== "contacts") return;
    let cancelled = false;
    const run = async () => {
      setContactsLoading(true);
      const res = await searchWinklyUsersForInvite(contactsQuery, 40);
      if (!cancelled) setContactsResults(res);
      if (!cancelled) setContactsLoading(false);
    };
    const t = setTimeout(run, 220);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [invitePickerChoice, contactsQuery]);

  // Sync default location when it becomes available (useDefaultLocation loads async from profile)
  useEffect(() => {
    const loc = formatDefaultLocationDisplay(defaultCity, defaultCountry, appLanguage);
    if (!loc) return;
    setDetails((prev) => {
      if (prev.location?.trim()) return prev;
      return { ...prev, location: loc };
    });
  }, [defaultCity, defaultCountry, appLanguage]);

  /** Keep stored location line + city/country in sync when the string still has ISO (e.g. profile "Olching, DE"). */
  useEffect(() => {
    const raw = details.location?.trim();
    if (!raw) return;
    const norm = normalizeLocationDisplayString(raw, appLanguage);
    if (norm === raw) return;
    setDetails((prev) => {
      if ((prev.location ?? "").trim() !== raw) return prev;
      const p = cityCountryFromLocation(norm, appLanguage);
      return { ...prev, location: norm, city: p.city ?? prev.city, country: p.country ?? prev.country };
    });
  }, [details.location, appLanguage]);

  const proactiveInitDone = useRef(false);
  useEffect(() => {
    if (proactiveInitDone.current || !initialStep || !proactiveActivityLabel) return;
    proactiveInitDone.current = true;
    setActivityKey("proactive");
    setActivityLabel(proactiveActivityLabel);
    const date = new Date();
    setDetails((prev) => ({
      ...prev,
      datePreset: proactiveDatePreset ?? "today",
      date,
      singleDay: true,
      timeOfDay: proactiveTimeOfDay ?? prev.timeOfDay ?? "any",
    }));
    setFlowStep(initialStep);
  }, [initialStep, proactiveActivityLabel, proactiveDatePreset, proactiveTimeOfDay]);

  const buildContext = useCallback(async (): Promise<ConciergeContext> => {
    let city = details.city;
    let country = details.country;
    if (details.location?.trim()) {
      const parsed = cityCountryFromLocation(details.location, appLanguage);
      city = parsed.city ?? city;
      country = parsed.country ?? country;
    }
    const dateStr = details.date ? dayKey(details.date) : lastDateRef.current;
    const dateEndStr = details.singleDay ? dateStr : details.dateEnd ? dayKey(details.dateEnd) : dateStr;
    const amount = details.budgetAmount?.trim() ? parseFloat(details.budgetAmount.replace(/,/g, ".")) : undefined;
    const budgetTier =
      amount != null && !Number.isNaN(amount)
        ? amount < 50
          ? ("low" as const)
          : amount < 150
            ? ("mid" as const)
            : ("high" as const)
        : undefined;
    let weather_snapshot;
    if (city) {
      const w =
        details.singleDay === false && dateEndStr && dateEndStr !== dateStr
          ? await getWeatherForCityAndDateRange(city, dateStr, dateEndStr, country)
          : await getWeatherForCityAndDate(city, dateStr, country);
      weather_snapshot = w
        ? {
            summary: w.summary,
            temp_min: w.temp_min,
            temp_max: w.temp_max,
            precipitation: w.precipitation,
            date: w.date,
            period_summary: w.period_summary,
            rainy_days: w.rainy_days,
            total_days: w.total_days,
            avg_temp_min: w.avg_temp_min,
            avg_temp_max: w.avg_temp_max,
          }
        : undefined;
    }
    const baseTopic = activityLabel ?? "Plan";
    const extra =
      (activityKey === "custom" ? details.customPromptExtra : details.additionalInfo)?.trim() ?? "";
    const mergeExtra = !!extra;
    const activityOrTopic = mergeExtra ? `${baseTopic} — ${extra}` : baseTopic;
    const userPromptMerged = mergeExtra ? `${baseTopic} — ${extra}` : activityLabel ?? undefined;

    let sanitizedPersona = "";
    const { data: auth } = await supabase.auth.getUser();
    if (auth.user?.id) {
      const pctx = await loadPlanningProfileContext(auth.user.id, effectiveMode);
      sanitizedPersona = formatSanitizedPersonaForConciergePrompt(pctx);
    }

    const nd =
      details.singleDay === false && dateEndStr && dateEndStr !== dateStr
        ? inclusivePlanDayCount(dateStr, dateEndStr)
        : 1;
    const extraNotes = [
      details.intentNotes?.trim(),
      details.mustHaves?.trim(),
      details.additionalInfo?.trim(),
      nd > 1 ? `Trip length: ${nd} day(s).` : "",
    ]
      .filter(Boolean)
      .join("\n\n");

    const plan_request_text = buildPlanRequestText({
      mode: effectiveMode,
      planningEntrySurface: "planner",
      activityOrTopic,
      city,
      country,
      originLocationLabel: details.originLocationLabel,
      exactTimeHm: details.singleDay !== false ? details.exactTimeHm : undefined,
      dateFrom: dateStr,
      dateTo: dateEndStr,
      singleDay: details.singleDay !== false,
      timePreference:
        details.singleDay && details.timeOfDay && details.timeOfDay !== "any"
          ? details.timeOfDay
          : undefined,
      budgetAmount: amount != null && !Number.isNaN(amount) ? amount : undefined,
      budgetCurrency: details.budgetCurrency || undefined,
      budgetTier,
      weatherSnapshot: weather_snapshot,
      partnerDisplayName: partnerDisplayName ?? undefined,
      sanitizedRequesterPersona: sanitizedPersona,
        categoryExtras: details.categoryExtras,
      extraNotes: extraNotes || undefined,
    });
    const [slots] = await Promise.all([getMergedDeviceWhiteSpaceSlots()]);
    const calStr = formatCalendarWhiteSpaceForGateway(slots);
    const booking = buildBookingContextForAi({
      venueQuery: effectiveMode === "business" ? "professional lunch or quiet cafe" : "casual restaurant or cafe",
      city: city ? city.split(",")[0]?.trim() : undefined,
      dateIso: dateStr,
    });

    return {
      mode: effectiveMode,
      source_screen,
      source_planner_tab,
      /** Short label for analytics; full verbatim request is plan_request_text. */
      user_prompt: userPromptMerged,
      activity_hint: userPromptMerged,
      plan_request_text,
      city,
      country,
      date_from: dateStr,
      date_to: dateEndStr,
      budget_tier: budgetTier,
      budget_amount: amount != null && !Number.isNaN(amount) ? amount : undefined,
      budget_currency: details.budgetCurrency || undefined,
      partner_user_id: partnerId ?? undefined,
      time_preference: details.singleDay && details.timeOfDay && details.timeOfDay !== "any" ? details.timeOfDay : undefined,
      weather_snapshot,
      origin_context: buildOriginContext({
        source_screen,
        mode: effectiveMode,
        source_planner_tab,
        hasPartner: !!partnerId,
      }),
      presentation: "decisive",
      planning_entry_surface: "planner",
      origin_location_label: details.originLocationLabel,
      exact_time_hm: details.singleDay !== false ? details.exactTimeHm : undefined,
      sanitized_requester_persona: sanitizedPersona || undefined,
      ...(calStr ? { calendar_white_space: calStr } : {}),
      booking_context: booking,
      ...(nd > 1 ? { num_days: nd } : {}),
    };
  }, [effectiveMode, source_screen, source_planner_tab, details, activityLabel, activityKey, partnerId, partnerDisplayName, appLanguage]);

  const trace = useCallback((event: string, data?: Record<string, unknown>) => {
    if (!__DEV__) return;
    // Terminal-first debugging: avoid rendering trace inside the app UI.
    // Keep logs high-signal and avoid dumping full prompts / PII.
    try {
      console.log(`[ConciergePlan] ${event}`, data ?? {});
    } catch {
      // no-op
    }
  }, []);

  const handleGenerate = useCallback(async (opts?: { refinementFeedback?: string; previousOptions?: ExperienceOption[] | null }) => {
    const genId = ++genAttemptRef.current;
    setError(null);
    setNoOptionsReason(null);
    setMessage("");
    setSuggestions(null);
    setStructuredPlans(null);
    setChosenIndex(null);
    setChosenStructuredIndex(null);
    setLoading(true);
    setFlowStep("suggestions");
    // refinement feedback is passed directly into the request; we don't currently display it.
    trace("generate:start", {
      genId,
      mode: effectiveMode,
      source_screen,
      source_planner_tab,
      activityKey,
      activityLabel,
      hasPartner: !!partnerId,
    });
    try {
      // Structured output (plan_options[]) per template. Theme = current intent/activity.
      const fullCtx = await buildContext();
      const refinement_feedback = opts?.refinementFeedback?.trim() || undefined;
      lastContextRef.current = fullCtx;
      let city = details.city;
      let country = details.country;
      if (details.location?.trim()) {
        const parsed = cityCountryFromLocation(details.location, appLanguage);
        city = parsed.city ?? city;
        country = parsed.country ?? country;
      }
      const date = details.date ?? new Date();
      const dt = new Date(date);
      // If user set exact HH:mm, keep that; else default to 18:00 local for planning.
      if (details.singleDay !== false && typeof details.exactTimeHm === "string" && /^\d{2}:\d{2}$/.test(details.exactTimeHm)) {
        dt.setHours(parseInt(details.exactTimeHm.slice(0, 2), 10), parseInt(details.exactTimeHm.slice(3, 5), 10), 0, 0);
      } else {
        dt.setHours(18, 0, 0, 0);
      }
      const theme = String(activityLabel ?? activityKey ?? "Custom").trim();
      trace("generate:request", {
        theme,
        city: city ?? null,
        country: country ?? null,
        dateTimeIso: dt.toISOString(),
        refinement_feedback: refinement_feedback ?? null,
      });
      const plans = await getPlannerThemePlans({
        mode: effectiveMode,
        theme,
        partnerUserId: partnerId ?? undefined,
        city: city ?? undefined,
        country: country ?? undefined,
        dateTimeIso: dt.toISOString(),
        weatherForecastText: undefined,
        fullContext: {
          ...fullCtx,
          theme,
          city: city ?? fullCtx.city,
          country: country ?? fullCtx.country,
          date_from: dt.toISOString(),
          selected_date_time: dt.toISOString(),
          ...(refinement_feedback ? { refinement_feedback } : {}),
        },
      });
      if (genId !== genAttemptRef.current) return;
      trace("generate:response", {
        count: plans.length,
        venues: plans.slice(0, 2).map((p) => p?.venue?.name).filter(Boolean),
        providerFallback: plans.some((p) => p?.venue?.name === "No suitable venue found"),
      });
      setLoading(false);
      setStructuredPlans(plans.slice(0, 2));
      if (!plans.length) {
        setMessage("No plan options returned. Try changing the theme, date/time, or location and retry.");
      } else {
        setMessage(null);
      }
      // reset refinement (not currently displayed)
    } catch (e) {
      if (genId !== genAttemptRef.current) return;
      setLoading(false);
      const msg = (e as Error).message ?? "Something went wrong.";
      trace("generate:error", { message: msg });
      setError(msg);
    }
  }, [trace, effectiveMode, buildContext, source_screen, source_planner_tab, activityKey, activityLabel, partnerId, details, appLanguage]);

  const handleCorrectDetails = useCallback(
    (refinementHint: string) => {
      const prev = suggestions;
      handleGenerate({ refinementFeedback: refinementHint, previousOptions: prev ?? null });
    },
    [handleGenerate, suggestions]
  );

  useEffect(() => {
    if (!loading || flowStep !== "suggestions") return;
    setLoadingPhaseIdx(0);
    loadingFade.setValue(0);
    Animated.timing(loadingFade, { toValue: 1, duration: 220, useNativeDriver: true }).start();
    let idx = 0;
    const t = setInterval(() => {
      idx = (idx + 1) % 3;
      setLoadingPhaseIdx(idx);
    }, 1150);
    return () => clearInterval(t);
  }, [loading, flowStep, loadingFade]);

  useEffect(() => {
    if (flowStep === "summary" && autoGenerateRef.current) {
      autoGenerateRef.current = false;
      handleGenerate();
    }
  }, [flowStep, handleGenerate]);

  const chosenOption = chosenIndex != null && suggestions?.length ? suggestions[chosenIndex] : null;
  const showInviteStepBeforePlanner =
    (whoJoining === "decide_later" || whoJoining === "share") && structuredPlans?.length;

  const handleFlowBack = useCallback(() => {
    Haptics.selectionAsync();
    if (flowStep === "intent") {
      onBack();
      return;
    }
    if (flowStep === "trip_planning") {
      setFlowStep("intent");
      return;
    }
    if (flowStep === "activity") {
      setFlowStep(activityKey === "trip" ? "trip_planning" : "intent");
      return;
    }
    if (flowStep === "summary") {
      setFlowStep("activity");
      return;
    }
    if (flowStep === "suggestions") {
      genAttemptRef.current += 1;
      setLoading(false);
      setFlowStep("summary");
      return;
    }
    if (flowStep === "invite") {
      setChosenIndex(null);
      setFlowStep("suggestions");
      return;
    }
    if (flowStep === "add_to_planner") {
      setChosenIndex(null);
      setFlowStep(showInviteStepBeforePlanner ? "invite" : "suggestions");
    }
  }, [flowStep, onBack, showInviteStepBeforePlanner, activityKey]);

  const panGesture = useMemo(
    () =>
      Gesture.Simultaneous(
        Gesture.Pan()
          .onStart((e) => {
            swipeStartX.current = e.x;
          })
          // Allow a little vertical jitter while swiping horizontally (important inside ScrollViews).
          .failOffsetY([-15, 15])
          // Require a more deliberate horizontal swipe so vertical scroll stays smooth.
          .activeOffsetX([-44, 44])
          .minDistance(72)
          .onEnd((e) => {
            // Swipe left to go back. Never allow a swipe gesture to exit the flow.
            if (flowStep === "intent") return;
            // Consistent + reliable: allow a deliberate left swipe without requiring extreme velocity.
            // (ScrollViews often reduce reported velocity.)
            if (e.translationX < -80) handleFlowBack();
            // Optional: iOS-style edge swipe right
            else if (swipeStartX.current < 50 && e.translationX > 70) handleFlowBack();
          }),
        Gesture.Native()
      ),
    [handleFlowBack, flowStep]
  );

  const stepIndexMap: Record<ConciergeFlowStep, number> = {
    intent: 1,
    sub_activity: 2,
    trip_planning: 2,
    activity: 2,
    // Kept for type completeness; UI flow no longer routes to this step.
    social: 3,
    summary: 3,
    suggestions: 4,
    invite: 4,
    add_to_planner: 5,
  };
  const currentStepIndex = stepIndexMap[flowStep];

  const headerTitle =
    flowStep === "intent" ||
    flowStep === "sub_activity" ||
    flowStep === "trip_planning" ||
    flowStep === "activity"
      ? "Winkly AI Planner"
      : flowStep === "summary"
        ? "Summary"
        : flowStep === "suggestions"
          ? "Your plans"
          : flowStep === "invite"
            ? "Invite"
            : "Add to planner";

  return (
    <GestureDetector gesture={panGesture}>
      <View style={styles.container}>
      <View style={styles.flowHeader}>
        <TouchableOpacity
          onPress={handleFlowBack}
          style={styles.flowHeaderBtn}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          accessibilityLabel={flowStep === "intent" ? "Go back" : "Previous step"}
        >
          <Ionicons name="arrow-back" size={HEADER.iconSize} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.flowHeaderTitle} numberOfLines={1}>
          {headerTitle}
        </Text>
        <TouchableOpacity
          onPress={() => {
            Haptics.selectionAsync();
            onClose();
          }}
          style={styles.flowHeaderBtn}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          accessibilityLabel="Close"
        >
          <Ionicons name="close" size={22} color={Colors.gray600} />
        </TouchableOpacity>
      </View>

      {/* Step indicator: 5 dots */}
      <View style={styles.stepRow}>
        {[1, 2, 3, 4, 5].map((i) => (
          <View
            key={i}
            style={[
              styles.stepDot,
              i === currentStepIndex && styles.stepDotActive,
              i < currentStepIndex && styles.stepDotDone,
            ]}
          />
        ))}
      </View>

      {flowStep === "intent" && (
        <ConciergeIntentStep
          mode={mode}
          sections={intentSections}
          onContinue={({ key, label, sectionLabel, flowMode }) => {
            const normalizeKey = (k: string): string => {
              const map: Record<string, string> = {
                // Generic groups
                arts_culture: "art_culture",
                outdoors_nature: "outdoors",
                work_meeting: "coffee_meeting",
                social_hangout: "games_fun",
                surprise_me: "custom",
                // Romance
                food_drinks_r: "dinner_drinks",
                arts_culture_r: "art_culture",
                dance_music_r: "dance_music",
                sport_activity_r: "sport_activity",
                experience_r: "experience",
                wellness_r: "wellness",
                trip_r: "trip",
                // Friends
                food_drinks_f: "food_drinks",
                outdoors_f: "outdoors",
                games_fun_f: "games_fun",
                sport_f: "sport",
                music_nightlife_f: "music_nightlife",
                trip_f: "trip",
                // Business
                coffee_b: "coffee_meeting",
                lunch_b: "lunch_meeting",
                golf_b: "golf",
                industry_event_b: "industry_event",
                walk_talk_b: "walk_talk",
                business_dinner_b: "business_dinner",
                workshop_b: "workshop_offsite",
              };
              return map[k] ?? k;
            };
            const resolvedKey = normalizeKey(key);
            const clearWishlist =
              activityKey != null && activityKey !== resolvedKey;
            setEffectiveMode(flowMode);
            setActivityKey(resolvedKey);
            setActivityLabel(label);
            setSelectedTopic({ topic: sectionLabel, subtopic: label });
            setSelectedCategory(getActivityCategoryByKey(resolvedKey) ?? null);
            setSubActivityKey(null);
            setSubActivityLabel(null);
            const smart = getSmartDefaultsForActivity(resolvedKey, label, details.budgetCurrency || "EUR");
            setDetails((prev) => ({
              ...prev,
              ...(clearWishlist ? { customPromptExtra: undefined } : {}),
              intentNotes: undefined,
              categoryExtras: undefined,
              timeOfDay: smart.timeOfDay,
              budgetAmount: smart.budgetAmount || prev.budgetAmount,
              budgetCurrency: smart.budgetCurrency,
              cuisine: smart.cuisine ?? prev.cuisine,
              datePreset: smart.datePreset,
              date: prev.date ?? new Date(),
              singleDay: true,
            }));
            const cat = getActivityCategoryByKey(resolvedKey);
            const isTrip = resolvedKey === "trip" || cat?.detailsVariant === "trip";
            const hasSub = (cat?.subActivities?.length ?? 0) > 0;
            if (isTrip) {
              setFlowStep("trip_planning");
            } else if (key !== "custom" && hasSub) {
              setFlowStep("sub_activity");
            } else {
              setFlowStep("activity");
            }
          }}
        />
      )}

      {flowStep === "sub_activity" && selectedCategory && (
        <ConciergeSubActivityStep
          category={selectedCategory}
          onContinue={({ subKey, subLabel }) => {
            setSubActivityKey(subKey);
            setSubActivityLabel(subLabel);
            setDetails((prev) => {
              if (selectedCategory.key === "food_drinks") {
                const prompt = FOOD_AND_DRINKS_FORMAT_PROMPTS[subLabel];
                const intentNotes = prompt
                  ? `Food & drinks format: ${subLabel}. ${prompt}`
                  : `Food & drinks format: ${subLabel}.`;
                return { ...prev, intentNotes };
              }
              return {
                ...prev,
                intentNotes:
                  subKey !== "any"
                    ? `${activityLabel ?? selectedCategory.label}: ${subLabel}`
                    : activityLabel ?? undefined,
              };
            });
            setFlowStep("activity");
          }}
          onBack={() => setFlowStep("intent")}
          showInlineBack={false}
        />
      )}

      {flowStep === "trip_planning" && (
        <TripPlanningFlow
          existingDetails={details}
          onComplete={(patch) => {
            setDetails((prev) => ({ ...prev, ...patch }));
            setFlowStep("activity");
          }}
          onBack={() => setFlowStep("intent")}
        />
      )}

      {flowStep === "activity" && (
        <ConciergeActivityDetailsStep
          activityKey={activityKey}
          activityLabel={activityLabel}
          activityCategory={selectedCategory ?? (activityKey ? getActivityCategoryByKey(activityKey) : undefined)}
          initialDetails={details}
          intentNotes={details.intentNotes}
          mode={effectiveMode}
          detailsVariant={selectedCategory?.detailsVariant ?? "standard"}
          subActivityKey={subActivityKey}
          subActivityLabel={subActivityLabel}
          topicLabel={selectedTopic?.topic ?? null}
          subTopicLabel={selectedTopic?.subtopic ?? null}
          profilePromptVariant={activityKey === "custom" ? "custom" : undefined}
          whoJoining={whoJoining}
          onWhoJoiningChange={(w) => setWhoJoining(w)}
          onNext={(d) => {
            setDetails((prev) => ({ ...prev, ...d }));
            setFlowStep("summary");
          }}
          onBack={() => setFlowStep((selectedCategory?.subActivities?.length ?? 0) > 0 ? "sub_activity" : "intent")}
          showInlineBack={false}
        />
      )}

      {flowStep === "summary" && (
        <ConciergeSummaryStep
          activityLabel={activityLabel}
          details={details}
          whoLabel={
            whoJoining === "just_me"
              ? "Just me"
              : whoJoining === "decide_later"
                ? "Decide later"
                : partnerDisplayName
                  ? partnerDisplayName
                  : undefined
          }
          onGenerate={handleGenerate}
          onBack={() => setFlowStep("activity")}
          loading={loading}
          showInlineBack={false}
        />
      )}

      {flowStep === "suggestions" && (
        <View style={styles.suggestionsWrap}>
          {error ? (
            <ScrollView contentContainerStyle={styles.errorContent}>
              <Text style={styles.errorText}>{error}</Text>
              <TouchableOpacity style={styles.retryBtn} onPress={() => handleGenerate()} activeOpacity={0.9}>
                <Text style={styles.retryBtnText}>Retry</Text>
              </TouchableOpacity>
            </ScrollView>
          ) : message && !suggestions?.length && !structuredPlans?.length ? (
            <ScrollView contentContainerStyle={styles.emptyContent}>
              <Text style={styles.messageText}>{message}</Text>
              {noOptionsReason && <Text style={styles.noOptionsReason}>{noOptionsReason}</Text>}
              <TouchableOpacity style={styles.tryAgainBtn} onPress={() => setFlowStep("summary")} activeOpacity={0.9}>
                <Text style={styles.tryAgainBtnText}>Change details</Text>
              </TouchableOpacity>
            </ScrollView>
          ) : !suggestions?.length && !structuredPlans?.length ? (
            <ScrollView contentContainerStyle={styles.emptyContent}>
              <Text style={styles.messageText}>
                {noOptionsReason || "No plans generated. Check your details or try again."}
              </Text>
              <View style={styles.emptyActionsRow}>
                <TouchableOpacity style={styles.tryAgainBtn} onPress={() => setFlowStep("summary")} activeOpacity={0.9}>
                  <Text style={styles.tryAgainBtnText}>Change details</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.retryBtn} onPress={() => handleGenerate()} activeOpacity={0.9}>
                  <Text style={styles.retryBtnText}>Retry</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          ) : structuredPlans && structuredPlans.length > 0 ? (
            <ScrollView style={styles.optionsScroll} contentContainerStyle={styles.optionsContent} showsVerticalScrollIndicator={false}>
              <View style={styles.optionsHeaderRow}>
                <Text style={styles.optionsIntro}>Two options</Text>
                <TouchableOpacity
                  style={styles.tryDifferentBtn}
                  onPress={() => handleGenerate({ refinementFeedback: "Different vibe" })}
                  activeOpacity={0.9}
                >
                  <Text style={styles.tryDifferentBtnText}>Try different options</Text>
                </TouchableOpacity>
              </View>
              {structuredPlans
                .map((raw) => {
                  // Backward-compatible guard: old cached schema had { topic, location, weather_guard, details }.
                  const anyP = raw as any;
                  if (anyP?.venue?.name && anyP?.title) return raw;
                  if (anyP?.location?.name && anyP?.topic) {
                    const mapped = {
                      option_id: "A",
                      character_label: "",
                      title: String(anyP.topic),
                      why_this_fits: typeof anyP.details === "string" ? anyP.details : "",
                      itinerary: [],
                      venue: {
                        name: String(anyP.location.name ?? ""),
                        address: String(anyP.location.address ?? ""),
                        google_maps_link: String(anyP.location.maps_link ?? ""),
                        estimated_cost: "",
                      },
                      weather_note: typeof anyP.weather_guard === "string" ? anyP.weather_guard : "",
                      duration_minutes: 120,
                      ...(Array.isArray(anyP.trip_days) ? { trip_days: anyP.trip_days } : {}),
                    };
                    return mapped as any;
                  }
                  return null;
                })
                .filter(Boolean)
                .slice(0, 2)
                .map((p: any, idx) => {
                const isOptionA = p.option_id === "A" || idx === 0;
                const modeAccent = (Colors as any)[effectiveMode]?.primary ?? Colors.primaryViolet;
                const characterLabel = p.character_label || (isOptionA ? "Bolder pick" : "Classic choice");
                return (
                  <View
                    key={idx}
                    style={[
                      styles.planCard,
                      isOptionA && { borderLeftWidth: 6, borderLeftColor: modeAccent, paddingLeft: 14, elevation: 5, shadowOpacity: 0.1 },
                    ]}
                  >
                    <TouchableOpacity
                      style={styles.planCardTouch}
                      onPress={() => { Haptics.selectionAsync(); setChosenStructuredIndex(idx); }}
                      activeOpacity={0.9}
                    >
                      <View style={styles.optionTopRow}>
                        <View style={[styles.optionChip, isOptionA ? { backgroundColor: modeAccent } : null]}>
                          <Text style={[styles.optionChipText, isOptionA ? { color: Colors.white } : null]}>
                            {isOptionA ? "Option A" : "Option B"}
                          </Text>
                        </View>
                        <View style={styles.characterChip}>
                          <Text style={styles.characterChipText}>{characterLabel}</Text>
                        </View>
                      </View>
                      {p.why_this_fits ? (
                        <Text style={styles.planPlace} numberOfLines={2}>{p.why_this_fits}</Text>
                      ) : null}
                      <Text style={styles.planTitle} numberOfLines={1}>{p.title}</Text>
                      <Text style={styles.planPlace} numberOfLines={2}>
                        {[p.venue?.name, p.venue?.address, p.venue?.estimated_cost].filter(Boolean).join(" • ")}
                      </Text>
                      <View style={styles.planItinerary}>
                        {p.trip_days?.length ? (
                          p.trip_days.map((d: { day: number; date: string; morning: { summary: string }; afternoon: { summary: string }; evening?: { summary: string } }) => (
                            <View key={`${idx}-d${d.day}`} style={styles.planItineraryRow}>
                              <Text style={styles.planItineraryTime}>D{d.day}</Text>
                              <Text style={styles.planItineraryActivity} numberOfLines={5}>
                                {d.date}: {d.morning.summary} · {d.afternoon.summary}
                                {d.evening ? ` · ${d.evening.summary}` : ""}
                              </Text>
                            </View>
                          ))
                        ) : (
                          <View style={styles.planItineraryRow}>
                            <Text style={styles.planItineraryActivity} numberOfLines={4}>
                              {(p.itinerary ?? []).slice(0, 3).map((s: { time: string; description: string }) => `${s.time} ${s.description}`.trim()).join(" · ")}
                            </Text>
                          </View>
                        )}
                      </View>
                      <View style={styles.planMeta}>
                        <Text style={styles.planMetaText} numberOfLines={2}>{p.weather_note}</Text>
                      </View>
                    </TouchableOpacity>
                    <View style={styles.planActions}>
                      <TouchableOpacity
                        style={styles.planActionBtn}
                        onPress={() => {
                          Haptics.selectionAsync();
                          setChosenStructuredIndex(idx);
                          setFlowStep(showInviteStepBeforePlanner ? "invite" : "add_to_planner");
                        }}
                      >
                        <Text style={styles.planActionText}>Add to planner</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.planActionIcon}
                        onPress={() => {
                          Haptics.selectionAsync();
                          setChosenStructuredIndex(idx);
                          setFlowStep("invite");
                        }}
                      >
                        <Ionicons name="person-add-outline" size={20} color={Colors.primaryViolet} />
                      </TouchableOpacity>
                      {p.venue?.google_maps_link ? (
                        <TouchableOpacity style={styles.planActionIcon} onPress={() => Linking.openURL(p.venue.google_maps_link)}>
                          <Ionicons name="map-outline" size={20} color={Colors.primaryViolet} />
                        </TouchableOpacity>
                      ) : null}
                    </View>
                  </View>
                );
              })}
            </ScrollView>
          ) : suggestions && suggestions.length > 0 ? (
            <ScrollView style={styles.optionsScroll} contentContainerStyle={styles.optionsContent} showsVerticalScrollIndicator={false}>
              {message ? <Text style={styles.optionsIntro}>{message}</Text> : null}
              {suggestions.map((opt, idx) => {
                const price = (opt.price_indicator as string) ?? (opt.logistics as { estimated_cost?: string })?.estimated_cost ?? "";
                const distance = (opt.logistics as { distance?: string })?.distance ?? "";
                const schedule = opt.schedule?.[0] ?? opt.itinerary?.[0];
                const timeStr = schedule && typeof schedule === "object" ? (schedule as { time?: string }).time : String(schedule ?? "");
                const placeName = (opt as { place?: string }).place ?? opt.option_name ?? opt.narrative ?? "";
                const mapQuery = [placeName, locationLineDisplay].filter(Boolean).join(", ");
                const scheduleArr = Array.isArray(opt.schedule)
                  ? (opt.schedule as (string | { time?: string; activity?: string })[])
                  : [];
                const itinerarySteps =
                  opt.itinerary ??
                  scheduleArr.map((s) => (typeof s === "string" ? { time: "", activity: s } : s));
                return (
                  <View key={idx} style={styles.planCard}>
                    <TouchableOpacity
                      style={styles.planCardTouch}
                      onPress={() => { Haptics.selectionAsync(); setChosenIndex(idx); }}
                      activeOpacity={0.9}
                    >
                      {timeStr ? <Text style={styles.planTime}>{timeStr}</Text> : null}
                      <Text style={styles.planTitle} numberOfLines={1}>
                        {String(opt.option_name ?? opt.narrative ?? `Option ${idx + 1}`)}
                      </Text>
                      {placeName ? <Text style={styles.planPlace} numberOfLines={1}>{placeName}</Text> : null}
                      {Array.isArray(itinerarySteps) && itinerarySteps.length > 0 ? (
                        <View style={styles.planItinerary}>
                          {itinerarySteps.slice(0, 3).map((step, i) => {
                            const t = (step as { time?: string }).time ?? "";
                            const a = (step as { activity?: string }).activity ?? String(step);
                            return (
                              <View key={i} style={styles.planItineraryRow}>
                                {t ? <Text style={styles.planItineraryTime}>{t}</Text> : null}
                                <Text style={styles.planItineraryActivity} numberOfLines={1}>{a}</Text>
                              </View>
                            );
                          })}
                        </View>
                      ) : null}
                      <View style={styles.planMeta}>
                        {opt.why_this_fits ? (
                          <View style={styles.planRating}>
                            <Ionicons name="star" size={14} color={Colors.accentYellow} />
                            <Text style={styles.planMetaText}>Picked for you</Text>
                          </View>
                        ) : null}
                        {price ? <Text style={styles.planMetaText}>{price}</Text> : null}
                        {distance ? <Text style={styles.planMetaText}>{distance}</Text> : null}
                      </View>
                    </TouchableOpacity>
                    <View style={styles.planActions}>
                      <TouchableOpacity
                        style={styles.planActionBtn}
                        onPress={() => {
                          Haptics.selectionAsync();
                          setChosenIndex(idx);
                          setFlowStep(showInviteStepBeforePlanner ? "invite" : "add_to_planner");
                        }}
                      >
                        <Text style={styles.planActionText}>Add to planner</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.planActionIcon}
                        onPress={() => {
                          Haptics.selectionAsync();
                          setChosenIndex(idx);
                          setFlowStep("invite");
                        }}
                      >
                        <Ionicons name="person-add-outline" size={20} color={Colors.primaryViolet} />
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.planActionIcon}
                        onPress={() => {
                          Haptics.selectionAsync();
                          const dateStr = details.date ? details.date.toLocaleDateString() : "";
                          Share.share({
                            message: [opt.option_name ?? opt.narrative, locationLineDisplay, dateStr].filter(Boolean).join("\n"),
                            title: String(opt.option_name ?? "Plan"),
                          }).catch(() => {});
                        }}
                      >
                        <Ionicons name="share-outline" size={20} color={Colors.primaryViolet} />
                      </TouchableOpacity>
                      {mapQuery ? (
                        <TouchableOpacity
                          style={styles.planActionIcon}
                          onPress={() => Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapQuery)}`)}
                        >
                          <Ionicons name="map-outline" size={20} color={Colors.primaryViolet} />
                        </TouchableOpacity>
                      ) : null}
                    </View>
                  </View>
                );
              })}
            </ScrollView>
          ) : null}
          {loading ? (
            <Animated.View style={[styles.loadingOverlay, { opacity: loadingFade }]}>
              <View style={styles.loadingOverlayCard}>
                <ActivityIndicator size="large" color={Colors.primaryViolet} />
                <Text style={styles.loadingOverlayTitle}>Winkly is thinking</Text>
                <Text style={styles.loadingOverlaySub}>
                  {loadingPhaseIdx === 0
                    ? "Choosing the vibe…"
                    : loadingPhaseIdx === 1
                      ? "Finding the best spots…"
                      : "Finalizing two options…"}
                </Text>
              </View>
            </Animated.View>
          ) : null}
        </View>
      )}

      {flowStep === "invite" && (
        <ConciergeInviteStep
          mode={effectiveMode}
          planTitle={chosenOption ? String(chosenOption.option_name ?? chosenOption.narrative) : undefined}
          planLocation={locationLineDisplay || undefined}
          planDate={details.date ? details.date.toLocaleDateString() : undefined}
          onSelect={(choice) => {
            if (choice === "skip" || choice === "share_external") {
              setFlowStep("add_to_planner");
            } else {
              setInvitePickerFromStep("invite");
              setInvitePickerChoice(choice);
            }
          }}
          onBack={() => {
            setChosenIndex(null);
            setFlowStep("suggestions");
          }}
          showInlineBack={false}
        />
      )}

      <Modal visible={invitePickerChoice != null} transparent animationType="slide">
        <Pressable style={styles.pickerBackdrop} onPress={() => setInvitePickerChoice(null)}>
          <Pressable style={styles.pickerSheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.pickerHeader}>
              <Text style={styles.pickerTitle}>
                {invitePickerChoice === "matches"
                  ? "Choose a match"
                  : invitePickerChoice === "friends"
                    ? effectiveMode === "business"
                      ? "Choose a business contact"
                      : "Choose a friend"
                    : "Choose a contact"}
              </Text>
              <TouchableOpacity onPress={() => setInvitePickerChoice(null)} hitSlop={12}>
                <Ionicons name="close" size={24} color={Colors.gray600} />
              </TouchableOpacity>
            </View>
            {invitePickerChoice === "contacts" ? (
              <View style={styles.pickerSearchRow}>
                <Ionicons name="search-outline" size={18} color={Colors.gray500} />
                <TextInput
                  style={styles.pickerSearchInput}
                  value={contactsQuery}
                  onChangeText={setContactsQuery}
                  placeholder="Search Winkly users"
                  placeholderTextColor={Colors.gray500}
                  autoCorrect={false}
                  autoCapitalize="none"
                />
              </View>
            ) : null}
            <ScrollView style={styles.pickerScroll} contentContainerStyle={styles.pickerScrollContent}>
              {invitePickerChoice === "contacts" ? (
                contactsLoading ? (
                  <Text style={styles.pickerEmpty}>Searching…</Text>
                ) : contactsResults.length === 0 ? (
                  <Text style={styles.pickerEmpty}>No users found</Text>
                ) : (
                  contactsResults.map((p) => (
                    <TouchableOpacity
                      key={p.id}
                      style={styles.pickerRow}
                      onPress={() => {
                        Haptics.selectionAsync();
                        setPartnerId(p.id);
                        setPartnerDisplayName(p.displayName);
                        setInvitePickerChoice(null);
                        setContactsQuery("");
                        setFlowStep(invitePickerFromStep === "invite" ? "add_to_planner" : "summary");
                      }}
                      activeOpacity={0.8}
                    >
                      <Avatar uri={p.avatar_url} size={48} />
                      <Text style={styles.pickerRowName} numberOfLines={1}>{p.displayName}</Text>
                      <Ionicons name="chevron-forward" size={20} color={Colors.gray400} />
                    </TouchableOpacity>
                  ))
                )
              ) : partners.length === 0 ? (
                <Text style={styles.pickerEmpty}>No one to show yet</Text>
              ) : (
                partners.map((p) => (
                  <TouchableOpacity
                    key={p.id}
                    style={styles.pickerRow}
                    onPress={() => {
                      Haptics.selectionAsync();
                      setPartnerId(p.id);
                      setPartnerDisplayName(p.displayName);
                      setInvitePickerChoice(null);
                      setFlowStep(invitePickerFromStep === "invite" ? "add_to_planner" : "summary");
                    }}
                    activeOpacity={0.8}
                  >
                    <Avatar uri={p.avatar_url} size={48} />
                    <Text style={styles.pickerRowName} numberOfLines={1}>{p.displayName}</Text>
                    <Ionicons name="chevron-forward" size={20} color={Colors.gray400} />
                  </TouchableOpacity>
                ))
              )}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {flowStep === "add_to_planner" && (chosenOption || (structuredPlans && chosenStructuredIndex != null && structuredPlans[chosenStructuredIndex])) && (
        <ConciergeConfirmStep
          chosenOption={chosenOption ?? undefined}
          structuredPlan={structuredPlans && chosenStructuredIndex != null ? structuredPlans[chosenStructuredIndex] : undefined}
          partner={partnerId && partnerDisplayName ? { id: partnerId, displayName: partnerDisplayName } : null}
          dateForPlan={details.date ?? new Date(lastDateRef.current)}
          locationLineDisplay={locationLineDisplay || undefined}
          exactTimeHm={details.singleDay !== false ? details.exactTimeHm : undefined}
          mode={effectiveMode}
          contextForPendingPlan={lastContextRef.current}
          onDone={() => {
            if (chosenOption) setShowFeedbackFor(chosenOption);
            else onClose();
          }}
          onBack={() => {
            setChosenIndex(null);
            setFlowStep(showInviteStepBeforePlanner ? "invite" : "suggestions");
          }}
          onCorrectDetails={handleCorrectDetails}
          showInlineBack={false}
        />
      )}

      <Modal visible={showFeedbackFor != null} transparent animationType="fade">
        <Pressable style={styles.feedbackBackdrop} onPress={() => { setShowFeedbackFor(null); onClose(); }}>
          <Pressable style={styles.feedbackCard} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.feedbackTitle}>How did it go?</Text>
            <View style={styles.feedbackActions}>
              {(["went_well", "didnt_use", "not_quite_right"] as ConciergeFeedbackType[]).map((fb) => (
                <TouchableOpacity
                  key={fb}
                  style={styles.feedbackBtn}
                  onPress={async () => {
                    Haptics.selectionAsync();
                    if (showFeedbackFor) {
                      await saveConciergeFeedback(
                        String(showFeedbackFor.option_name ?? showFeedbackFor.narrative ?? "Plan"),
                        fb,
                        effectiveMode
                      );
                    }
                    setShowFeedbackFor(null);
                    onClose();
                  }}
                  activeOpacity={0.9}
                >
                  <Text style={styles.feedbackBtnText}>
                    {fb === "went_well" ? "Went well" : fb === "didnt_use" ? "Didn't use" : "Not quite right"}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity style={styles.feedbackSkip} onPress={() => { setShowFeedbackFor(null); onClose(); }}>
              <Text style={styles.feedbackSkipText}>Skip</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  flowHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Layout.spacing.md,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.gray200,
    backgroundColor: Colors.white,
    minHeight: HEADER_BAR_HEIGHT,
    zIndex: 50,
    elevation: 10,
  },
  flowHeaderBtn: {
    width: HEADER.buttonSize,
    height: HEADER.buttonSize,
    alignItems: "center",
    justifyContent: "center",
  },
  flowHeaderTitle: {
    ...Typography.headerTitle,
    flex: 1,
    textAlign: "center",
    marginHorizontal: 8,
    color: Colors.textPrimary,
  },
  stepRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 6,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.gray200,
  },
  stepDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.gray300,
  },
  stepDotActive: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.primaryViolet,
  },
  stepDotDone: {
    backgroundColor: Colors.primaryViolet,
    opacity: 0.6,
  },
  suggestionsWrap: { flex: 1 },
  loadingWrap: { flex: 1, justifyContent: "center", alignItems: "center", gap: 12 },
  loadingText: { ...Typography.caption, color: Colors.gray600 },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(255,255,255,0.78)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  loadingOverlayCard: {
    width: "100%",
    maxWidth: 320,
    backgroundColor: Colors.white,
    borderRadius: 20,
    paddingVertical: 20,
    paddingHorizontal: 18,
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderColor: Colors.gray200,
    shadowColor: "#1C1C1E",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 18,
    elevation: 6,
  },
  loadingOverlayTitle: { ...Typography.h3, color: Colors.textPrimary },
  loadingOverlaySub: { ...Typography.caption, color: Colors.gray600, textAlign: "center" },
  errorContent: { padding: 24 },
  errorText: { ...Typography.body, color: Colors.errorRed, marginBottom: 12 },
  retryBtn: {
    alignSelf: "flex-start",
    backgroundColor: Colors.primaryViolet,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 12,
  },
  retryBtnText: { ...Typography.caption, color: Colors.white, fontWeight: "600" },
  emptyContent: { padding: 24 },
  emptyActionsRow: { flexDirection: "row", gap: 12, marginTop: 8, flexWrap: "wrap" },
  messageText: { ...Typography.body, color: Colors.textPrimary, marginBottom: 8 },
  noOptionsReason: { ...Typography.caption, color: Colors.gray600, fontStyle: "italic", marginBottom: 16 },
  tryAgainBtn: {
    backgroundColor: Colors.primaryViolet,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
  },
  tryAgainBtnText: { ...Typography.button, color: Colors.white },
  optionsScroll: { flex: 1 },
  optionsContent: { paddingHorizontal: 24, paddingBottom: 24 },
  optionsIntro: { ...Typography.body, color: Colors.textPrimary, marginBottom: 16 },
  optionsHeaderRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 12 },
  tryDifferentBtn: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.gray200,
  },
  tryDifferentBtnText: { ...Typography.caption, color: Colors.primaryViolet, fontWeight: "700" },
  planCard: {
    backgroundColor: Colors.white,
    borderRadius: 20,
    padding: 18,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: Colors.gray200,
    shadowColor: "#1C1C1E",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 3,
  },
  planCardTouch: { marginBottom: 12 },
  planTime: { ...Typography.caption, color: Colors.primaryViolet, fontWeight: "600", marginBottom: 4 },
  planTitle: { ...Typography.h3, color: Colors.textPrimary, marginBottom: 4 },
  planPlace: { ...Typography.caption, color: Colors.gray600, marginBottom: 8 },
  optionTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 8, flexWrap: "wrap" },
  optionChip: {
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: Colors.gray100,
    borderWidth: 1,
    borderColor: Colors.gray200,
  },
  optionChipText: { ...Typography.caption, color: Colors.gray700, fontWeight: "800" },
  characterChip: {
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: Colors.gray100,
  },
  characterChipText: { ...Typography.caption, color: Colors.gray700, fontWeight: "700" },
  planItinerary: { marginTop: 8, marginBottom: 8, paddingLeft: 4 },
  planItineraryRow: { flexDirection: "row", alignItems: "center", marginBottom: 4, gap: 10 },
  planItineraryTime: { ...Typography.caption, color: Colors.primaryViolet, fontWeight: "600", minWidth: 36 },
  planItineraryActivity: { ...Typography.caption, color: Colors.gray600, flex: 1 },
  planMeta: { flexDirection: "row", flexWrap: "wrap", gap: 12, alignItems: "center" },
  planRating: { flexDirection: "row", alignItems: "center", gap: 4 },
  planMetaText: { ...Typography.caption, color: Colors.gray600 },
  planActions: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  planActionBtn: {
    flex: 1,
    minWidth: 120,
    backgroundColor: Colors.primaryViolet,
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: "center",
  },
  planActionText: { ...Typography.caption, color: Colors.white, fontWeight: "600" },
  planActionIcon: { padding: 10 },
  feedbackBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  feedbackCard: {
    backgroundColor: Colors.white,
    borderRadius: 20,
    padding: 24,
    width: "100%",
    maxWidth: 340,
  },
  feedbackTitle: { ...Typography.h3, color: Colors.textPrimary, marginBottom: 20, textAlign: "center" },
  feedbackActions: { gap: 10 },
  feedbackBtn: {
    backgroundColor: Colors.gray100,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    marginBottom: 8,
  },
  feedbackBtnText: { ...Typography.body, color: Colors.primaryViolet, fontWeight: "600" },
  feedbackSkip: { alignItems: "center", marginTop: 12 },
  feedbackSkipText: { ...Typography.caption, color: Colors.gray500 },
  backRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 12,
  },
  backRowText: { ...Typography.caption, color: Colors.primaryViolet, fontWeight: "600" },
  pickerBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-end",
  },
  pickerSheet: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "70%",
  },
  pickerHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.gray200,
  },
  pickerSearchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.gray100,
    backgroundColor: Colors.white,
  },
  pickerSearchInput: {
    flex: 1,
    ...Typography.body,
    color: Colors.textPrimary,
    paddingVertical: 8,
  },
  pickerTitle: {
    ...Typography.h3,
    color: Colors.textPrimary,
  },
  pickerScroll: { maxHeight: 400 },
  pickerScrollContent: { paddingHorizontal: 20, paddingVertical: 12, paddingBottom: 24 },
  pickerEmpty: {
    ...Typography.body,
    color: Colors.gray500,
    textAlign: "center",
    paddingVertical: 24,
  },
  pickerRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    gap: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.gray100,
  },
  pickerRowName: {
    ...Typography.body,
    color: Colors.textPrimary,
    flex: 1,
    fontWeight: "500",
  },
});
