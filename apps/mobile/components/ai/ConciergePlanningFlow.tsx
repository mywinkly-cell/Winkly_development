/**
 * Winkly AI Concierge — 7-step planning flow container.
 * Step 1 Intent → 2 Activity Details → 3 Social → 4 Summary → 5 Suggestions → 6 Invite (optional) → 7 Add to Planner
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
} from "react-native";
import { useTranslation } from "react-i18next";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import {
  callConciergeStream,
  reportConciergeOutcome,
  buildOriginContext,
  type ConciergeContext,
  type ExperienceOption,
} from "@/lib/ai/conciergeClient";
import { getWeatherForCityAndDate } from "@/lib/weatherClient";
import { formatDefaultLocationDisplay, normalizeLocationDisplayString } from "@/lib/location/countryDisplay";
import { ConciergeIntentStep } from "@/components/ai/ConciergeIntentStep";
import { ConciergeActivityDetailsStep } from "@/components/ai/ConciergeActivityDetailsStep";
import { ConciergeSocialStep } from "@/components/ai/ConciergeSocialStep";
import { ConciergeSummaryStep } from "@/components/ai/ConciergeSummaryStep";
import { ConciergeInviteStep } from "@/components/ai/ConciergeInviteStep";
import { ConciergeConfirmStep } from "@/components/ai/ConciergeConfirmStep";
import { getPlannerThemePlans, type PlannerThemePlanOption } from "@/lib/ai/strategicHost";
import {
  type ConciergeFlowStep,
  type WhoJoining,
  type ActivityDetails,
  type DatePreset,
  type TimeOfDay,
  getSmartDefaultsForActivity,
} from "@/lib/ai/conciergePlanningFlow";
import { buildPlanRequestText } from "@/lib/ai/buildPlanRequestText";
import { loadPlanningProfileContext, formatSanitizedPersonaForConciergePrompt } from "@/lib/ai/customPlanPresets";
import { supabase } from "@/lib/supabase";
import { addRecentRequest, getRecentRequests, saveConciergeFeedback, type ConciergeFeedbackType } from "@/lib/ai/conciergeStorage";
import { getPartnersForConcierge, searchWinklyUsersForInvite, type ConciergePartner } from "@/lib/ai/conciergePartners";
import { getMergedDeviceWhiteSpaceSlots, formatCalendarWhiteSpaceForGateway } from "@/lib/integrations/calendarWhiteSpace";
import { buildBookingContextForAi } from "@/lib/integrations/bookingLinks";
import type { SuggestedPerson } from "@/components/ai/ConciergeSocialStep";
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
  source_screen: "planner" | "chats";
  source_planner_tab?: "all" | "dates" | "meetups" | "business" | "events";
  defaultCity?: string;
  defaultCountry?: string;
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
  source_screen,
  source_planner_tab,
  defaultCity,
  defaultCountry,
  initialStep,
  proactiveActivityLabel,
  proactiveDatePreset,
  proactiveTimeOfDay,
  onClose,
  onBack,
}: ConciergePlanningFlowProps) {
  const { i18n } = useTranslation();
  const appLanguage = i18n?.language ?? "en";
  const [flowStep, setFlowStep] = useState<ConciergeFlowStep>("intent");
  /** Mirrors last generate request; used to label Primary / Backup in decisive mode. */
  const [lastPresentation, setLastPresentation] = useState<"menu" | "decisive" | undefined>(undefined);
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
  const [whoJoining, setWhoJoining] = useState<WhoJoining | null>(null);
  const [partnerId, setPartnerId] = useState<string | null>(null);
  const [partnerDisplayName, setPartnerDisplayName] = useState<string | null>(null);
  const [partners, setPartners] = useState<ConciergePartner[]>([]);
  const [suggestions, setSuggestions] = useState<ExperienceOption[] | null>(null);
  const [structuredPlans, setStructuredPlans] = useState<PlannerThemePlanOption[] | null>(null);
  const [chosenIndex, setChosenIndex] = useState<number | null>(null);
  const [chosenStructuredIndex, setChosenStructuredIndex] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [noOptionsReason, setNoOptionsReason] = useState<string | null>(null);
  const [lastRequestId, setLastRequestId] = useState<string | undefined>();
  const lastContextRef = useRef<ConciergeContext | null>(null);
  const [showFeedbackFor, setShowFeedbackFor] = useState<ExperienceOption | null>(null);
  const [invitePickerChoice, setInvitePickerChoice] = useState<"matches" | "friends" | "contacts" | null>(null);
  const [invitePickerFromStep, setInvitePickerFromStep] = useState<"social" | "invite">("invite");
  const [contactsQuery, setContactsQuery] = useState("");
  const [contactsResults, setContactsResults] = useState<ConciergePartner[]>([]);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [debugOpen, setDebugOpen] = useState(false);
  const [debugTrace, setDebugTrace] = useState<
    { ts: string; event: string; data?: Record<string, unknown> }[]
  >([]);
  const lastDateRef = useRef<string>(dayKey(new Date()));
  const autoGenerateRef = useRef(false);
  const genAttemptRef = useRef(0);
  const [lastRefinement, setLastRefinement] = useState<string | null>(null);

  /** Single line for UI (cards, share, maps) — always expand ISO in "City, XX". */
  const locationLineDisplay = useMemo(
    () => (details.location?.trim() ? normalizeLocationDisplayString(details.location, appLanguage) : ""),
    [details.location, appLanguage]
  );

  useEffect(() => {
    if (mode === "events") return;
    getPartnersForConcierge(mode).then(setPartners);
  }, [mode]);

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
      const w = await getWeatherForCityAndDate(city, dateStr, country);
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
      const pctx = await loadPlanningProfileContext(auth.user.id, mode);
      sanitizedPersona = formatSanitizedPersonaForConciergePrompt(pctx);
    }

    const plan_request_text = buildPlanRequestText({
      mode,
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
    });
    const [slots] = await Promise.all([getMergedDeviceWhiteSpaceSlots()]);
    const calStr = formatCalendarWhiteSpaceForGateway(slots);
    const booking = buildBookingContextForAi({
      venueQuery: mode === "business" ? "professional lunch or quiet cafe" : "casual restaurant or cafe",
      city: city ? city.split(",")[0]?.trim() : undefined,
      dateIso: dateStr,
    });

    return {
      mode,
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
        mode,
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
    };
  }, [mode, source_screen, source_planner_tab, details, activityLabel, activityKey, partnerId, partnerDisplayName, appLanguage]);

  const trace = useCallback((event: string, data?: Record<string, unknown>) => {
    if (!__DEV__) return;
    setDebugTrace((prev) => {
      const next = [...prev, { ts: new Date().toISOString(), event, data }];
      return next.length > 80 ? next.slice(next.length - 80) : next;
    });
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
    trace("generate:start", {
      genId,
      mode,
      source_screen,
      source_planner_tab,
      activityKey,
      activityLabel,
      hasPartner: !!partnerId,
    });
    try {
      // Structured output (plan_options[]) per template. Theme = current intent/activity.
      const fullCtx = await buildContext();
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
      });
      const plans = await getPlannerThemePlans({
        mode,
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
        },
      });
      if (genId !== genAttemptRef.current) return;
      trace("generate:response", { count: plans.length });
      setLoading(false);
      setStructuredPlans(plans.slice(0, 2));
      if (!plans.length) {
        setMessage("No plan options returned. Try changing the theme, date/time, or location and retry.");
      } else {
        setMessage(null);
      }
      setLastRefinement(null);
    } catch (e) {
      if (genId !== genAttemptRef.current) return;
      setLoading(false);
      const msg = (e as Error).message ?? "Something went wrong.";
      trace("generate:error", { message: msg });
      setError(msg);
    }
  }, [trace, mode, source_screen, source_planner_tab, activityKey, activityLabel, partnerId, details, appLanguage]);

  const handleCorrectDetails = useCallback(
    (refinementHint: string) => {
      const prev = suggestions;
      setLastRefinement(refinementHint);
      handleGenerate({ refinementFeedback: refinementHint, previousOptions: prev ?? null });
    },
    [handleGenerate, suggestions]
  );

  useEffect(() => {
    if (flowStep === "summary" && autoGenerateRef.current) {
      autoGenerateRef.current = false;
      handleGenerate();
    }
  }, [flowStep, handleGenerate]);

  const chosenOption = chosenIndex != null && suggestions?.length ? suggestions[chosenIndex] : null;
  const showInviteStepBeforePlanner =
    (whoJoining === "just_me" || whoJoining === "decide_later") && suggestions?.length;

  const handleFlowBack = useCallback(() => {
    Haptics.selectionAsync();
    if (flowStep === "intent") {
      onBack();
      return;
    }
    if (flowStep === "activity") {
      setFlowStep("intent");
      return;
    }
    if (flowStep === "social") {
      setFlowStep("activity");
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
  }, [flowStep, onBack, showInviteStepBeforePlanner]);

  const stepIndexMap: Record<ConciergeFlowStep, number> = {
    intent: 1,
    activity: 2,
    social: 3,
    summary: 4,
    suggestions: 5,
    invite: 6,
    add_to_planner: 7,
  };
  const currentStepIndex = stepIndexMap[flowStep];

  const headerTitle =
    flowStep === "intent"
      ? "Ask Winkly AI"
      : flowStep === "activity"
        ? "Activity details"
        : flowStep === "social"
          ? "Who's joining?"
          : flowStep === "summary"
            ? "Summary"
            : flowStep === "suggestions"
              ? "Your plans"
              : flowStep === "invite"
                ? "Invite"
                : "Add to planner";

  return (
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

      {/* Step indicator: 7 dots */}
      <View style={styles.stepRow}>
        {[1, 2, 3, 4, 5, 6, 7].map((i) => (
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
          onContinue={({ key, label }) => {
            const clearWishlist =
              activityKey != null && activityKey !== key;
            setActivityKey(key);
            setActivityLabel(label);
            const smart = getSmartDefaultsForActivity(key, label, details.budgetCurrency || "EUR");
            setDetails((prev) => ({
              ...prev,
              ...(clearWishlist ? { customPromptExtra: undefined } : {}),
              timeOfDay: smart.timeOfDay,
              budgetAmount: smart.budgetAmount || prev.budgetAmount,
              budgetCurrency: smart.budgetCurrency,
              cuisine: smart.cuisine ?? prev.cuisine,
              datePreset: smart.datePreset,
              date: prev.date ?? new Date(),
              singleDay: true,
            }));
            setFlowStep("activity");
          }}
        />
      )}

      {flowStep === "activity" && (
        <ConciergeActivityDetailsStep
          activityLabel={activityLabel}
          initialDetails={details}
          mode={mode}
          profilePromptVariant={activityKey === "custom" ? "custom" : undefined}
          onNext={(d) => {
            setDetails((prev) => ({ ...prev, ...d }));
            setFlowStep("social");
          }}
          onBack={() => setFlowStep("intent")}
          showInlineBack={false}
        />
      )}

      {flowStep === "social" && (
        <ConciergeSocialStep
          mode={mode}
          planSummary={{
            activity: activityLabel ?? undefined,
            location: locationLineDisplay || undefined,
            date: details.date ? details.date.toLocaleDateString() : undefined,
            time:
              details.timeOfDay && details.timeOfDay !== "any"
                ? details.timeOfDay
                : undefined,
          }}
          suggestedPeople={partners.slice(0, 2).map((p): SuggestedPerson => ({
            id: p.id,
            displayName: p.displayName,
            type: mode === "romance" ? "match" : mode === "business" ? "business" : "friend",
            avatar_url: p.avatar_url,
          }))}
          onSelect={(who, selectedPersonId) => {
            setWhoJoining(who);
            if (selectedPersonId) {
              const p = partners.find((x) => x.id === selectedPersonId);
              if (p) {
                setPartnerId(p.id);
                setPartnerDisplayName(p.displayName);
              }
              setFlowStep("summary");
            } else if (who === "just_me" || who === "decide_later" || who === "share") {
              setPartnerId(null);
              setPartnerDisplayName(null);
              setFlowStep("summary");
            } else if (who === "invite_match" || who === "invite_friends" || who === "invite_business" || who === "invite_contacts") {
              setInvitePickerFromStep("social");
              setInvitePickerChoice(
                who === "invite_match" ? "matches" : who === "invite_contacts" ? "contacts" : "friends"
              );
            }
          }}
          onBack={() => setFlowStep("activity")}
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
          {__DEV__ ? (
            <View style={styles.devDebugRow}>
              <TouchableOpacity
                style={styles.devDebugBtn}
                onPress={() => setDebugOpen((v) => !v)}
                activeOpacity={0.85}
              >
                <Text style={styles.devDebugBtnText}>{debugOpen ? "Hide debug trace" : "Show debug trace"}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.devDebugBtnSecondary}
                onPress={() => setDebugTrace([])}
                activeOpacity={0.85}
              >
                <Text style={styles.devDebugBtnSecondaryText}>Clear</Text>
              </TouchableOpacity>
            </View>
          ) : null}
          {__DEV__ && debugOpen ? (
            <ScrollView style={styles.devDebugBox} contentContainerStyle={styles.devDebugBoxContent}>
              {debugTrace.length === 0 ? (
                <Text style={styles.devDebugEmpty}>No trace yet. Tap Generate to capture steps.</Text>
              ) : (
                debugTrace.slice().reverse().map((ev, i) => (
                  <Text key={`${ev.ts}-${i}`} style={styles.devDebugLine}>
                    {ev.ts}  {ev.event}{ev.data ? `  ${JSON.stringify(ev.data)}` : ""}
                  </Text>
                ))
              )}
            </ScrollView>
          ) : null}
          {loading && !suggestions?.length && !structuredPlans?.length ? (
            <View style={styles.loadingWrap}>
              <ActivityIndicator size="large" color={Colors.primaryViolet} />
              <Text style={styles.loadingText}>Winkly is preparing your plan.</Text>
            </View>
          ) : error ? (
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
              <Text style={styles.optionsIntro}>Two structured plan options</Text>
              {structuredPlans.slice(0, 2).map((p, idx) => {
                const timeStr = new Date(p.date_time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
                const mapQuery = [p.location.name, p.location.address].filter(Boolean).join(", ");
                return (
                  <View key={idx} style={styles.planCard}>
                    <TouchableOpacity
                      style={styles.planCardTouch}
                      onPress={() => { Haptics.selectionAsync(); setChosenStructuredIndex(idx); }}
                      activeOpacity={0.9}
                    >
                      <Text style={styles.planTime}>{timeStr}</Text>
                      <Text style={styles.planTitle} numberOfLines={1}>{p.topic}</Text>
                      <Text style={styles.planPlace} numberOfLines={2}>
                        {[p.location.name, p.location.address].filter(Boolean).join(" • ")}
                      </Text>
                      <View style={styles.planItinerary}>
                        <View style={styles.planItineraryRow}>
                          <Text style={styles.planItineraryActivity} numberOfLines={3}>{p.details}</Text>
                        </View>
                      </View>
                      <View style={styles.planMeta}>
                        <Text style={styles.planMetaText} numberOfLines={2}>{p.weather_guard}</Text>
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
                      {p.location.maps_link ? (
                        <TouchableOpacity
                          style={styles.planActionIcon}
                          onPress={() => Linking.openURL(p.location.maps_link)}
                        >
                          <Ionicons name="map-outline" size={20} color={Colors.primaryViolet} />
                        </TouchableOpacity>
                      ) : mapQuery ? (
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
                const itinerarySteps = opt.itinerary ?? (opt.schedule ?? []).map((s) => (typeof s === "string" ? { time: "", activity: s } : s));
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
                        {lastPresentation === "decisive" && suggestions.length >= 2 ? (
                          <View style={styles.planRating}>
                            <Ionicons name="star" size={14} color={Colors.accentYellow} />
                            <Text style={styles.planMetaText}>{idx === 0 ? "Primary pick" : "Backup"}</Text>
                          </View>
                        ) : opt.why_this_fits ? (
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
        </View>
      )}

      {flowStep === "invite" && (
        <ConciergeInviteStep
          mode={mode}
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
                    ? mode === "business"
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
          mode={mode}
          contextForPendingPlan={lastContextRef.current}
          onDone={() => {
            reportConciergeOutcome(lastRequestId, "added_to_planner").catch(() => {});
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
                    reportConciergeOutcome(lastRequestId, fb).catch(() => {});
                    if (showFeedbackFor) {
                      await saveConciergeFeedback(
                        String(showFeedbackFor.option_name ?? showFeedbackFor.narrative ?? "Plan"),
                        fb,
                        mode
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
  devDebugRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 6,
  },
  devDebugBtn: {
    backgroundColor: Colors.gray100,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: Colors.gray200,
  },
  devDebugBtnText: { ...Typography.caption, color: Colors.textPrimary, fontWeight: "700" },
  devDebugBtnSecondary: {
    backgroundColor: Colors.white,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: Colors.gray200,
  },
  devDebugBtnSecondaryText: { ...Typography.caption, color: Colors.gray600, fontWeight: "700" },
  devDebugBox: {
    marginHorizontal: 24,
    marginBottom: 6,
    maxHeight: 180,
    borderWidth: 1,
    borderColor: Colors.gray200,
    borderRadius: 12,
    backgroundColor: Colors.white,
  },
  devDebugBoxContent: { padding: 10 },
  devDebugEmpty: { ...Typography.caption, color: Colors.gray600, fontStyle: "italic" },
  devDebugLine: { ...Typography.caption, color: Colors.gray700, marginBottom: 6 },
  loadingWrap: { flex: 1, justifyContent: "center", alignItems: "center", gap: 12 },
  loadingText: { ...Typography.caption, color: Colors.gray600 },
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
