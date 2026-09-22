// Winkly AI Agent — Full-screen flow on top of the app (like filter screens).
// Steps: 1) Request form → 2) Pick option → 3) Confirm (add to planner / use for chat) or Cancel/Close.

import React, { useState, useMemo, useRef, useCallback, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Linking,
  Modal,
  Pressable,
} from "react-native";
import { GestureDetector, Gesture } from "react-native-gesture-handler";
import { useRouter, useLocalSearchParams } from "expo-router";
import NetInfo from "@react-native-community/netinfo";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAppTheme, accentYellow, type AppTheme } from "@/constants/design-system";
import { Card, Chip, PrimaryButton, SecondaryButton, TextButton } from "@/components/ds";
import type { ConciergeContext, ExperienceOption } from "@/lib/ai/conciergeClient";
import { ConciergeRequestForm } from "@/components/ai/ConciergeRequestForm";
import { AIDisclosureNote } from "@/components/ai/AIDisclosureNote";
import { FitReasonLine, resolveFitReason } from "@/components/ai/FitReasonLine";
import { ConciergePlanningFlow } from "@/components/ai/ConciergePlanningFlow";
import { ConciergeSurpriseFlow } from "@/components/ai/ConciergeSurpriseFlow";
import { ConciergeRateLimitCard } from "@/components/ai/ConciergeRateLimitCard";
import { CommunityPlansSection } from "@/components/ai/CommunityPlansSection";
import { callConciergeStream, reportConciergeOutcome } from "@/lib/ai/conciergeClient";
import { getMergedDeviceWhiteSpaceSlots, formatCalendarWhiteSpaceForGateway } from "@/lib/integrations/calendarWhiteSpace";
import { buildBookingContextForAi } from "@/lib/integrations/bookingLinks";
import { supabase } from "@/lib/supabase";
import { useFormatLocationDisplay } from "@/lib/location/useLocationDisplay";
import { useModeContext } from "@/providers";
import type { Mode } from "@/types";
import { recordPairBehaviorSignal } from "@/lib/matching/behaviorSignals";
import {
  getRecentRequests,
  addRecentRequest,
  getSavedIdeas,
  saveIdea,
  removeSavedIdea,
  saveConciergeFeedback,
  type SavedIdea,
  type ConciergeFeedbackType,
} from "@/lib/ai/conciergeStorage";
import { useDefaultLocation } from "@/lib/ai/useDefaultCity";
import { isModeAvailable } from "@/lib/modes/availability";

function isWinklyOption(opt: ExperienceOption): boolean {
  return (opt as { source?: string }).source === "winkly_event";
}

const VALID_MODES: Mode[] = (["romance", "friends", "business", "events"] as Mode[]).filter((m) => isModeAvailable(m));

type ConciergeStep = "form" | "options" | "message_only" | "confirm";

const REFINEMENT_CHIPS = ["Make it cheaper", "Earlier time", "More relaxed", "Different vibe"];
const EMPTY_STATE_ACTIONS = [
  { id: "date", label: "Change date", icon: "calendar-outline" as const },
  { id: "location", label: "Change location", icon: "location-outline" as const },
  { id: "simplify", label: "Simplify request", icon: "chatbubble-outline" as const },
];

export default function ConciergeScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    source_screen?: string;
    mode?: string;
    source_planner_tab?: string;
    partner_user_id?: string;
    partner_display_name?: string;
    /** From proactive suggestion: open at activity step with pre-fill */
    initial_step?: string;
    proactive_activity_label?: string;
    proactive_date_preset?: string;
    proactive_time_of_day?: string;
    /** Pre-fills request form (e.g. stale networking nudge). */
    prefill_prompt?: string;
    /** "decisive" = primary + backup; "menu" or omit = three options. */
    presentation?: string;
    /** With initial_step "quick": "1" generates plan options right away (person/event plan hint). */
    auto_generate?: string;
    /** YYYY-MM-DD to plan for (e.g. the event's day). */
    prefill_date?: string;
    /** One-line Plan-it request (PlanItBar): generate right away, assumptions as editable chips. */
    plan_it?: string;
    /** "1" = Surprise me: three plans from one tap, no form. */
    surprise?: string;
  }>();
  const insets = useSafeAreaInsets();
  const { context: modeContext } = useModeContext();
  const theme = useAppTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  const source_screen = useMemo<"chats" | "planner">(() => {
    const s = params.source_screen;
    return s === "planner" ? "planner" : "chats";
  }, [params.source_screen]);

  const mode = useMemo<Mode>(() => {
    const fromParams = params.mode && VALID_MODES.includes(params.mode as Mode) ? (params.mode as Mode) : null;
    const fromContext = modeContext.active_mode;
    if (fromParams) return fromParams;
    if (fromContext) return fromContext;
    return source_screen === "chats" ? "romance" : "events";
  }, [params.mode, source_screen, modeContext.active_mode]);

  const plannerScope = useMemo<"all" | Mode>(() => {
    if (params.mode === "all") return "all";
    return mode;
  }, [params.mode, mode]);

  const { city: defaultCity, country: defaultCountry } = useDefaultLocation();
  const fmtLoc = useFormatLocationDisplay();

  /** Chats form only: optional route override; Planner flow uses decisive inside ConciergePlanningFlow. */
  const chatPresentation = useMemo((): "menu" | "decisive" | undefined => {
    const p = params.presentation;
    return p === "decisive" || p === "menu" ? p : undefined;
  }, [params.presentation]);

  const [chatMode, setChatMode] = useState<"plan" | "assist" | null>(
    source_screen === "chats" && params.partner_user_id ? null : "assist"
  );

  useEffect(() => {
    if (source_screen !== "chats") return;
    setChatMode(params.partner_user_id ? null : "assist");
  }, [source_screen, params.partner_user_id]);

  /** Use improved 7-step planning flow when opened from Planner or from a chat (plan mode). */
  const usePlanningFlow =
    source_screen === "planner" || (source_screen === "chats" && chatMode === "plan");

  const [chatPrefillPrompt, setChatPrefillPrompt] = useState<string | undefined>(undefined);
  const [partnerInterests, setPartnerInterests] = useState<string[]>([]);

  useEffect(() => {
    if (source_screen !== "chats") return;
    if (!params.partner_user_id) return;
    if (mode !== "romance" && mode !== "friends" && mode !== "business") return;
    let cancelled = false;
    (async () => {
      try {
        const { data: row } = await supabase
          .from("profiles_mode")
          .select("interests")
          .eq("user_id", params.partner_user_id)
          .eq("mode", mode)
          .maybeSingle();
        const ints = Array.isArray((row as any)?.interests)
          ? ((row as any).interests as unknown[]).filter((x): x is string => typeof x === "string")
          : [];
        if (!cancelled) setPartnerInterests(ints.slice(0, 6));
      } catch {
        if (!cancelled) setPartnerInterests([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [source_screen, params.partner_user_id, mode]);

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<ExperienceOption[] | null>(null);
  const [chosenIndex, setChosenIndex] = useState<number | null>(null);
  const [selectedPartner, setSelectedPartner] = useState<{ id: string; displayName: string } | null>(null);

  useEffect(() => {
    if (source_screen === "chats" && params.partner_user_id && params.partner_display_name) {
      setSelectedPartner({
        id: params.partner_user_id,
        displayName: params.partner_display_name,
      });
    }
  }, [source_screen, params.partner_user_id, params.partner_display_name]);

  const conciergePairSignalSentRef = useRef<string | null>(null);
  useEffect(() => {
    if (source_screen !== "chats") return;
    const pid = params.partner_user_id;
    if (!pid) return;
    const m = mode;
    if (m !== "romance" && m !== "friends" && m !== "business") return;
    const key = `${pid}:${m}`;
    if (conciergePairSignalSentRef.current === key) return;
    conciergePairSignalSentRef.current = key;
    void recordPairBehaviorSignal({
      partnerUserId: pid,
      mode: m,
      kind: "concierge_match_session",
    });
  }, [source_screen, params.partner_user_id, mode]);

  const [lastDate, setLastDate] = useState<string>(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });
  const [refinementFeedback, setRefinementFeedback] = useState<string | null>(null);
  const [previousOptions, setPreviousOptions] = useState<ExperienceOption[] | null>(null);
  const lastSubmittedContext = useRef<ConciergeContext | null>(null);
  const swipeStartX = useRef(0);
  const [recentRequests, setRecentRequests] = useState<import("@/lib/ai/conciergeStorage").RecentRequest[]>([]);
  const [savedIdeas, setSavedIdeas] = useState<SavedIdea[]>([]);
  const [, setSavedIds] = useState<Set<string>>(new Set());
  const [lastErrorCode, setLastErrorCode] = useState<import("@/lib/ai/conciergeClient").ConciergeErrorCode | null>(null);
  const [lastLimitType, setLastLimitType] = useState<import("@/lib/ai/conciergeClient").ConciergeLimitType | null>(null);
  const [lastUpgradeTo, setLastUpgradeTo] = useState<"super" | "premium" | null>(null);
  const [lastRetryAfter, setLastRetryAfter] = useState<number | null>(null);
  const [savingRequest, setSavingRequest] = useState(false);
  const [noOptionsReason, setNoOptionsReason] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState<boolean | null>(true);
  const [compareIndices, setCompareIndices] = useState<number[]>([]);
  const [showFeedbackFor, setShowFeedbackFor] = useState<ExperienceOption | null>(null);
  const [lastRequestId, setLastRequestId] = useState<string | undefined>(undefined);
  useEffect(() => {
    const unsub = NetInfo.addEventListener((s) => setIsConnected(s.isConnected ?? null));
    return () => unsub();
  }, []);

  const loadRecent = useCallback(async () => {
    const list = await getRecentRequests();
    setRecentRequests(list);
  }, []);
  const loadSaved = useCallback(async () => {
    const list = await getSavedIdeas();
    setSavedIdeas(list);
  }, []);

  useEffect(() => {
    loadRecent();
    loadSaved();
  }, [loadRecent, loadSaved]);

  const step: ConciergeStep =
    chosenIndex != null && suggestions?.length
      ? "confirm"
      : suggestions?.length
        ? "options"
        : message && !loading && !error
          ? "message_only"
          : "form";
  const stepIndex = step === "form" ? 1 : step === "options" || step === "message_only" ? 2 : 3;

  const sortedOptionsWithIndex = useMemo(() => {
    if (!suggestions?.length) return [];
    return [...suggestions]
      .map((opt, originalIndex) => ({ opt, originalIndex }))
      .sort((a, b) => (isWinklyOption(b.opt) ? 1 : 0) - (isWinklyOption(a.opt) ? 1 : 0));
  }, [suggestions]);

  const headerTitle =
    step === "form"
      ? source_screen === "chats"
        ? "Winkly AI for Chats"
        : "Ask Winkly AI"
      : step === "message_only"
        ? "Suggestions"
        : step === "options"
          ? "Pick an option"
          : source_screen === "planner"
            ? "Add to planner"
            : "Use this suggestion";

  const backOrFallback = useCallback(
    (fallback: `/(modes)/${Mode}/chats` | `/(modes)/${Mode}/planner`) => {
      if (typeof router.canGoBack === "function" && router.canGoBack()) {
        router.back();
        return;
      }
      router.replace(fallback);
    },
    [router]
  );

  const handleBack = useCallback(() => {
    Haptics.selectionAsync();
    if (step === "confirm") {
      setChosenIndex(null);
    } else if (step === "options" || step === "message_only") {
      setSuggestions(null);
      setMessage(null);
      setError(null);
      setNoOptionsReason(null);
    } else {
      backOrFallback(source_screen === "planner" ? `/(modes)/${mode}/planner` : `/(modes)/${mode}/chats`);
    }
  }, [step, backOrFallback, source_screen, mode]);

  const panGesture = useMemo(
    () =>
      Gesture.Simultaneous(
        Gesture.Pan()
          .onStart((e) => {
            swipeStartX.current = e.x;
          })
          .failOffsetY([-15, 15])
          // Require a more deliberate horizontal swipe so vertical scroll stays smooth.
          .activeOffsetX([-44, 44])
          .minDistance(72)
          .onEnd((e) => {
            // Support both directions: swipe left (anywhere) or edge-swipe right.
            if (step === "form") return;
            if (e.translationX < -60) {
              handleBack();
              return;
            }
            if (swipeStartX.current < 50 && e.translationX > 60) handleBack();
          }),
        Gesture.Native()
      ),
    [step, handleBack]
  );

  const handleClose = (plannerItemId?: string) => {
    Haptics.selectionAsync();
    // A successful "Add to planner" passes the new item's id. Go straight to the planner tab
    // (fresh mount) with it so the entry the user just created is what they land on, instead of
    // popping back to whatever planner screen state was on the stack before they opened Winkly AI.
    if (plannerItemId && source_screen === "planner") {
      router.replace(`/(modes)/${mode}/planner?focus_planner_item_id=${encodeURIComponent(plannerItemId)}`);
      return;
    }
    backOrFallback(source_screen === "planner" ? `/(modes)/${mode}/planner` : `/(modes)/${mode}/chats`);
  };

  if (params.surprise === "1") {
    return (
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        <ConciergeSurpriseFlow
          mode={mode}
          defaultCity={defaultCity ?? undefined}
          defaultCountry={defaultCountry ?? undefined}
          onClose={handleClose}
          onBack={() =>
            backOrFallback(source_screen === "planner" ? `/(modes)/${mode}/planner` : `/(modes)/${mode}/chats`)
          }
        />
      </View>
    );
  }

  if (usePlanningFlow) {
    return (
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={[styles.screen, { paddingTop: insets.top }]}
      >
        <ConciergePlanningFlow
          mode={mode}
          plannerScope={plannerScope}
          source_screen={source_screen}
          source_planner_tab={
            source_screen === "planner"
              ? ((params.source_planner_tab as "all" | "dates" | "meetups" | "business" | "events") ?? "all")
              : undefined
          }
          partnerUserId={typeof params.partner_user_id === "string" ? params.partner_user_id : undefined}
          partnerDisplayNameHint={
            typeof params.partner_display_name === "string" ? params.partner_display_name : undefined
          }
          defaultCity={defaultCity ?? undefined}
          defaultCountry={defaultCountry ?? undefined}
          initialStep={
            params.initial_step === "activity" || params.initial_step === "social" || params.initial_step === "quick"
              ? (params.initial_step as "activity" | "social" | "quick")
              : undefined
          }
          prefillRequest={
            params.initial_step === "quick" && typeof params.prefill_prompt === "string" ? params.prefill_prompt : undefined
          }
          autoGenerate={params.auto_generate === "1"}
          prefillDate={typeof params.prefill_date === "string" ? params.prefill_date : undefined}
          planItRequest={typeof params.plan_it === "string" ? params.plan_it : undefined}
          proactiveActivityLabel={params.proactive_activity_label ?? undefined}
          proactiveDatePreset={
            params.proactive_date_preset === "today" ||
            params.proactive_date_preset === "tomorrow" ||
            params.proactive_date_preset === "weekend"
              ? (params.proactive_date_preset as "today" | "tomorrow" | "weekend")
              : undefined
          }
          proactiveTimeOfDay={
            params.proactive_time_of_day === "morning" ||
            params.proactive_time_of_day === "lunch" ||
            params.proactive_time_of_day === "afternoon" ||
            params.proactive_time_of_day === "evening"
              ? (params.proactive_time_of_day as "morning" | "lunch" | "afternoon" | "evening")
              : undefined
          }
          onClose={handleClose}
          onBack={() =>
            backOrFallback(source_screen === "planner" ? `/(modes)/${mode}/planner` : `/(modes)/${mode}/chats`)
          }
        />
      </KeyboardAvoidingView>
    );
  }

  const handleSubmit = async (context: ConciergeContext) => {
    setError(null);
    setLastErrorCode(null);
    setLastLimitType(null);
    setLastUpgradeTo(null);
    setLastRetryAfter(null);
    setNoOptionsReason(null);
    setMessage(null);
    setSuggestions(null);
    setChosenIndex(null);
    setLastDate((context.date_from as string) ?? lastDate);
    const refinement_structured =
      refinementFeedback === "Make it cheaper"
        ? { cheaper: true as const }
        : refinementFeedback === "Earlier time"
          ? { earlier: true as const }
          : refinementFeedback === "More relaxed"
            ? { more_relaxed: true as const }
            : refinementFeedback === "Different vibe" || refinementFeedback === "Different cuisine"
              ? { different_vibe: true as const }
              : undefined;
    const contextWithRefinement =
      refinementFeedback && previousOptions?.length
        ? { ...context, refinement_feedback: refinementFeedback, previous_options: previousOptions, refinement_structured }
        : refinement_structured
          ? { ...context, refinement_structured }
          : context;
    setLoading(true);
    setMessage("");
    try {
      const slots = await getMergedDeviceWhiteSpaceSlots();
      const calStr = formatCalendarWhiteSpaceForGateway(slots);
      const cityLine = contextWithRefinement.city ?? defaultCity ?? "";
      const booking = buildBookingContextForAi({
        venueQuery: mode === "business" ? "professional lunch or quiet cafe" : "casual restaurant or cafe",
        city: cityLine.split(",")[0]?.trim(),
      });
      const agencyContext: ConciergeContext = {
        ...contextWithRefinement,
        ...(calStr ? { calendar_white_space: calStr } : {}),
        booking_context: booking,
      };
      lastSubmittedContext.current = agencyContext;
      await callConciergeStream({
        task: "concierge",
        context: agencyContext,
        onDelta: (content) => setMessage((prev) => (prev ?? "") + content),
        onDone: (res) => {
          setLoading(false);
          if (res.error_code === "rate_limit" || res.error_code === "daily_quota" || res.error_code === "tier_required") {
            setError(null);
            setLastErrorCode(res.error_code);
            setLastLimitType(res.limit_type ?? null);
            setLastUpgradeTo(res.upgrade_to ?? null);
            setLastRetryAfter(res.retry_after ?? null);
          } else if (res.error) {
            setError(res.error);
            setLastErrorCode(res.error_code ?? null);
            setLastRetryAfter(res.retry_after ?? null);
          } else {
            setLastRequestId(res.request_id);
            setMessage(res.message ?? "");
            const raw = res.suggestions;
            const list = Array.isArray(raw) ? raw : raw != null ? [raw] : [];
            setSuggestions(list.length > 0 ? (list as ExperienceOption[]) : null);
            if (list.length === 0 && res.no_options_reason) setNoOptionsReason(res.no_options_reason);
            setRefinementFeedback(null);
            setPreviousOptions(null);
            addRecentRequest(agencyContext).then(loadRecent);
          }
        },
      });
    } catch (e) {
      setLoading(false);
      setError((e as Error).message || "Something went wrong.");
      setLastErrorCode("unknown");
    }
  };

  const handleTryAgain = () => {
    if (lastSubmittedContext.current) {
      handleSubmit(lastSubmittedContext.current);
    }
  };

  const handleRefinementFromOptions = (hint: string) => {
    Haptics.selectionAsync();
    setRefinementFeedback(hint);
    setPreviousOptions(suggestions);
    setSuggestions(null);
    setMessage(null);
    setChosenIndex(null);
    setError(null);
  };

  const chosenOption = chosenIndex != null && suggestions?.length && suggestions[chosenIndex] ? suggestions[chosenIndex] : null;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={[styles.screen, { paddingTop: insets.top }]}
    >
      <View style={styles.header}>
        <TouchableOpacity onPress={handleBack} style={styles.headerBtn} accessibilityLabel="Back" hitSlop={8}>
          <Ionicons name="chevron-back" size={22} color={theme.colors.textPrimary} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <View style={styles.headerTitleRow}>
            <Ionicons name="sparkles" size={15} color={theme.colors.primary} style={styles.headerSpark} />
            <Text style={styles.headerTitle} numberOfLines={1}>{headerTitle}</Text>
          </View>
          {step !== "form" && (
            <Text style={styles.headerSub} numberOfLines={1}>
              {step === "options"
                ? lastSubmittedContext.current?.presentation === "decisive"
                  ? "Primary plan or backup"
                  : "Choose one to continue"
                : step === "message_only"
                  ? "Try adjusting your request"
                  : "Confirm or go back"}
            </Text>
          )}
        </View>
        <TouchableOpacity onPress={() => handleClose()} style={styles.headerBtn} accessibilityLabel="Close" hitSlop={8}>
          <Ionicons name="close" size={22} color={theme.colors.textSecondary} />
        </TouchableOpacity>
      </View>

      <View style={styles.stepIndicatorRow}>
        {[1, 2, 3].map((i) => (
          <View
            key={i}
            style={[
              styles.stepDot,
              i === stepIndex && styles.stepDotActive,
              i < stepIndex && styles.stepDotDone,
            ]}
          />
        ))}
      </View>

      <GestureDetector gesture={panGesture}>
        <View style={styles.contentWrap}>
      {step === "form" && (
        <>
          <AIDisclosureNote style={styles.disclosure} />
          {savedIdeas.length > 0 && (
            <View style={styles.savedSection}>
              <Text style={styles.savedSectionTitle}>Saved ideas</Text>
              {savedIdeas.slice(0, 5).map((saved) => (
                <Card key={saved.id} style={styles.savedCard} elevation={0} padding="md">
                  <Text style={styles.savedCardTitle} numberOfLines={1}>
                    {String(saved.option.option_name || saved.option.narrative || "Idea")}
                  </Text>
                  {saved.context?.city && (
                    <Text style={styles.savedCardMeta}>
                      {fmtLoc(saved.context.city)}
                      {saved.context.date_from ? ` · ${saved.context.date_from}` : ""}
                    </Text>
                  )}
                  <View style={styles.savedCardActions}>
                    <View style={styles.savedAddBtnWrap}>
                      <PrimaryButton
                        title="Add to planner"
                        onPress={() => {
                          setSuggestions([saved.option]);
                          setChosenIndex(0);
                          if (saved.context?.date_from) setLastDate(saved.context.date_from);
                        }}
                      />
                    </View>
                    <TouchableOpacity
                      onPress={async () => {
                        Haptics.selectionAsync();
                        await removeSavedIdea(saved.id);
                        loadSaved();
                      }}
                      style={styles.savedRemoveBtn}
                      accessibilityLabel="Remove saved idea"
                      hitSlop={8}
                    >
                      <Ionicons name="trash-outline" size={18} color={theme.colors.textMuted} />
                    </TouchableOpacity>
                  </View>
                </Card>
              ))}
            </View>
          )}

          {source_screen === "chats" && chatMode === null && params.partner_user_id ? (
            <Modal transparent animationType="slide" visible>
              <Pressable
                style={styles.chatModeBackdrop}
                onPress={() => {
                  Haptics.selectionAsync();
                  // Dismiss without choosing: keep sheet decision pending.
                  // User explicitly chooses Plan/Assist or taps Close.
                }}
              >
                <Pressable style={styles.chatModeSheet} onPress={(e) => e.stopPropagation()}>
                  <View style={styles.chatModeHeader}>
                    <Text style={styles.chatModeTitle}>What do you want help with?</Text>
                    <TouchableOpacity
                      onPress={() => {
                        Haptics.selectionAsync();
                        setChatMode("assist");
                      }}
                      hitSlop={12}
                      accessibilityLabel="Close"
                    >
                      <Ionicons name="close" size={22} color={theme.colors.textSecondary} />
                    </TouchableOpacity>
                  </View>
                  <TouchableOpacity
                    style={styles.chatModeOption}
                    onPress={() => {
                      Haptics.selectionAsync();
                      setChatMode("plan");
                    }}
                    activeOpacity={0.9}
                  >
                    <Text style={styles.chatModeOptionTitle}>Plan something together</Text>
                    <Text style={styles.chatModeOptionSub}>Card-based planning using their interests</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.chatModeOption}
                    onPress={() => {
                      Haptics.selectionAsync();
                      setChatMode("assist");
                    }}
                    activeOpacity={0.9}
                  >
                    <Text style={styles.chatModeOptionTitle}>Help with the conversation</Text>
                    <Text style={styles.chatModeOptionSub}>Quick templates to draft your next message</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.chatModeCloseRow}
                    onPress={() => {
                      Haptics.selectionAsync();
                      setChatMode("assist");
                    }}
                    activeOpacity={0.9}
                    accessibilityLabel="Close without choosing"
                  >
                    <Text style={styles.chatModeCloseText}>Close</Text>
                  </TouchableOpacity>
                </Pressable>
              </Pressable>
            </Modal>
          ) : null}

          {source_screen === "chats" && chatMode === "assist" ? (
            <View style={styles.chatAssistChipsWrap}>
              <Text style={styles.chatAssistLabel}>Quick picks</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chatAssistChipsRow}>
                {[
                  { id: "opening", label: "Opening move" },
                  { id: "next", label: "Next move" },
                  { id: "icebreaker", label: "Suggest an icebreaker" },
                  { id: "reconnect", label: "Reconnect after silence" },
                ].map((chip) => (
                  <Chip
                    key={chip.id}
                    label={chip.label}
                    onPress={() => {
                      const name = selectedPartner?.displayName?.trim() || "them";
                      const interestSnippet =
                        partnerInterests.length > 0
                          ? `Shared interests to consider: ${partnerInterests.slice(0, 3).join(", ")}.`
                          : "";
                      const baseRules =
                        "Rules: Do NOT reference or assume any message history. Keep it natural, not cringe. 1–2 short messages max. End with one easy question.";
                      const prompt =
                        chip.id === "opening"
                          ? `Write an opening message to ${name}.\n${interestSnippet}\n${baseRules}`
                          : chip.id === "next"
                            ? `Draft my next message to ${name} to move the conversation forward.\n${interestSnippet}\n${baseRules}`
                            : chip.id === "icebreaker"
                              ? `Suggest an icebreaker question for ${name}.\n${interestSnippet}\n${baseRules}`
                              : `Write a friendly reconnection message to ${name} after a period of silence.\n${interestSnippet}\n${baseRules}`;
                      setChatPrefillPrompt(prompt);
                    }}
                  />
                ))}
              </ScrollView>
            </View>
          ) : null}

          <ConciergeRequestForm
            mode={mode}
            source_screen={source_screen}
            source_planner_tab={undefined}
            defaultCity={defaultCity ?? undefined}
            defaultCountry={defaultCountry ?? undefined}
            refinementPlaceholder={refinementFeedback ?? undefined}
            initialPrompt={
              chatPrefillPrompt ??
              (typeof params.prefill_prompt === "string" ? params.prefill_prompt : undefined)
            }
            showModeLabel
            recentRequests={recentRequests}
            onClearError={() => {
              setError(null);
              setMessage(null);
            }}
            onSubmit={handleSubmit}
            loading={loading}
            onPartnerChange={setSelectedPartner}
            presentation={chatPresentation}
            selectedTopicLabel={undefined}
          />
          {isConnected === false && (
            <View style={styles.offlineBanner}>
              <Ionicons name="cloud-offline-outline" size={20} color={theme.colors.textInverse} />
              <Text style={styles.offlineBannerText}>Check connection and try again.</Text>
            </View>
          )}
          {lastErrorCode === "rate_limit" || lastErrorCode === "daily_quota" || lastErrorCode === "tier_required" ? (
            <ConciergeRateLimitCard
              errorCode={lastErrorCode}
              limitType={lastLimitType ?? undefined}
              retryAfter={lastRetryAfter ?? undefined}
              upgradeTo={lastUpgradeTo ?? undefined}
              saving={savingRequest}
              onSaveForLater={
                lastSubmittedContext.current
                  ? async () => {
                      setSavingRequest(true);
                      try {
                        await addRecentRequest(lastSubmittedContext.current!);
                        await loadRecent();
                        setLastErrorCode(null);
                        setLastLimitType(null);
                        setLastUpgradeTo(null);
                        setLastRetryAfter(null);
                      } finally {
                        setSavingRequest(false);
                      }
                    }
                  : undefined
              }
              onRetry={
                lastSubmittedContext.current
                  ? () => handleSubmit(lastSubmittedContext.current!)
                  : undefined
              }
            />
          ) : error ? (
            <View style={styles.errorBlock}>
              <Text style={styles.errorText}>{error}</Text>
              {lastSubmittedContext.current && (
                <View style={styles.retryBtnWrap}>
                  <SecondaryButton
                    title="Retry"
                    onPress={() => handleSubmit(lastSubmittedContext.current!)}
                    disabled={loading}
                  />
                </View>
              )}
            </View>
          ) : null}
          {loading && (
            <View style={styles.skeletonWrap}>
              {[1, 2, 3].map((i) => (
                <View key={i} style={styles.skeletonCard}>
                  <View style={styles.skeletonLine} />
                  <View style={[styles.skeletonLine, styles.skeletonLineShort]} />
                  <View style={[styles.skeletonLine, styles.skeletonLineCta]} />
                </View>
              ))}
            </View>
          )}
        </>
      )}

      {step === "message_only" && message && (
        <ScrollView style={styles.optionsScroll} contentContainerStyle={styles.optionsContent} showsVerticalScrollIndicator={false}>
          <Card style={styles.emptyStateWrap} elevation={0}>
            <Text style={styles.messageText}>{message}</Text>
            {noOptionsReason ? (
              <Text style={styles.noOptionsReasonText}>{noOptionsReason}</Text>
            ) : null}
            <Text style={styles.emptyStateLabel}>Try adjusting:</Text>
            <View style={styles.emptyStateActions}>
              {EMPTY_STATE_ACTIONS.map((a) => (
                <Chip
                  key={a.id}
                  label={a.label}
                  onPress={() => setMessage(null)}
                />
              ))}
            </View>
            <PrimaryButton title="Get new suggestions" onPress={handleTryAgain} />
          </Card>
        </ScrollView>
      )}

      {step === "options" && suggestions && suggestions.length > 0 && (
        <ScrollView style={styles.optionsScroll} contentContainerStyle={styles.optionsContent} showsVerticalScrollIndicator={false}>
          {message ? <Text style={styles.optionsIntro}>{message}</Text> : null}
          {/* Plans other members ran and rated, for this city + activity. Renders
              nothing until at least one rated plan exists, so it stays invisible
              until there is real experience behind it. */}
          <CommunityPlansSection
            city={(lastSubmittedContext.current?.city ?? defaultCity ?? "").split(",")[0]?.trim() || undefined}
            mode={mode}
            theme={lastSubmittedContext.current?.theme ?? lastSubmittedContext.current?.activity_hint}
            numDays={lastSubmittedContext.current?.num_days ?? 1}
          />
          {sortedOptionsWithIndex.map(({ opt, originalIndex }) => {
            const mapQuery = [opt.option_name ?? opt.narrative, (opt as { place?: string }).place, lastSubmittedContext.current?.city].filter(Boolean).join(", ");
            return (
              <Card key={originalIndex} style={styles.optionCard} elevation={1}>
                <View style={styles.optionCardBadges}>
                  {isWinklyOption(opt) && (
                    <View style={styles.winklyBadge}>
                      <Text style={styles.winklyBadgeText}>Winkly</Text>
                    </View>
                  )}
                  {lastSubmittedContext.current?.presentation === "decisive" && (suggestions?.length ?? 0) >= 2 ? (
                    <View style={styles.dnaBadge}>
                      <Ionicons name="star" size={14} color={accentYellow} />
                      <Text style={styles.dnaBadgeText}>{originalIndex === 0 ? "Primary pick" : "Backup"}</Text>
                    </View>
                  ) : resolveFitReason(opt) ? (
                    <View style={styles.dnaBadge}>
                      <Ionicons name="heart" size={14} color={theme.colors.primary} />
                      <Text style={styles.dnaBadgeText}>Picked for you</Text>
                    </View>
                  ) : null}
                </View>
                <TouchableOpacity
                  style={styles.optionCardTouchable}
                  onPress={() => {
                    Haptics.selectionAsync();
                    setChosenIndex(originalIndex);
                  }}
                  activeOpacity={0.9}
                >
                  <View style={styles.optionCardHeaderRow}>
                    <Text style={styles.optionTitle}>{String(opt.option_name || opt.narrative || `Option ${originalIndex + 1}`)}</Text>
                    <TouchableOpacity
                      style={[styles.compareChip, compareIndices.includes(originalIndex) && styles.compareChipActive]}
                      onPress={(e) => {
                        e.stopPropagation();
                        Haptics.selectionAsync();
                        setCompareIndices((prev) =>
                          prev.includes(originalIndex)
                            ? prev.filter((i) => i !== originalIndex)
                            : prev.length >= 2
                              ? [prev[1], originalIndex]
                              : [...prev, originalIndex]
                        );
                      }}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="git-compare-outline" size={14} color={compareIndices.includes(originalIndex) ? theme.colors.onPrimary : theme.colors.primary} />
                      <Text style={[styles.compareChipText, compareIndices.includes(originalIndex) && styles.compareChipTextActive]}>Compare</Text>
                    </TouchableOpacity>
                  </View>
                  <FitReasonLine reason={resolveFitReason(opt)} style={styles.optionFitReason} />
                  {Array.isArray(opt.schedule) && opt.schedule.length > 0 ? (
                    <Text style={styles.optionSchedule} numberOfLines={2}>{opt.schedule.join(" · ")}</Text>
                  ) : null}
                  {mapQuery ? (
                    <TouchableOpacity
                      style={styles.viewOnMapBtn}
                      onPress={(e) => {
                        e.stopPropagation();
                        Haptics.selectionAsync();
                        Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapQuery)}`);
                      }}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="map-outline" size={16} color={theme.colors.primary} />
                      <Text style={styles.viewOnMapText}>View on map</Text>
                    </TouchableOpacity>
                  ) : null}
                </TouchableOpacity>
                <View style={styles.optionCardFooter}>
                  <TouchableOpacity
                    style={styles.saveForLaterBtn}
                    onPress={async () => {
                      Haptics.selectionAsync();
                      await saveIdea(opt, mode, { city: lastSubmittedContext.current?.city, date_from: lastDate });
                      setSavedIds((prev) => new Set(prev).add(`opt-${originalIndex}`));
                      loadSaved();
                    }}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="bookmark-outline" size={18} color={theme.colors.primary} />
                    <Text style={styles.saveForLaterText}>Save for later</Text>
                  </TouchableOpacity>
                  <View style={styles.choosePlanBtnWrap}>
                    <PrimaryButton
                      title="Choose this plan"
                      onPress={() => {
                        Haptics.selectionAsync();
                        setChosenIndex(originalIndex);
                      }}
                    />
                  </View>
                </View>
              </Card>
            );
          })}
          {compareIndices.length === 2 && suggestions && (() => {
            const [iA, iB] = compareIndices;
            const optA = suggestions[iA];
            const optB = suggestions[iB];
            const row = (label: string, valA: string, valB: string) => (
              <View key={label} style={styles.compareRow}>
                <Text style={styles.compareRowLabel}>{label}</Text>
                <Text style={styles.compareRowVal} numberOfLines={1}>{valA || "—"}</Text>
                <Text style={styles.compareRowVal} numberOfLines={1}>{valB || "—"}</Text>
              </View>
            );
            return (
              <Card style={styles.compareBlock} elevation={0}>
                <Text style={styles.compareBlockTitle}>Compare</Text>
                <View style={styles.compareTableHeader}>
                  <Text style={styles.compareTableHeaderText} />
                  <Text style={styles.compareTableHeaderText}>A</Text>
                  <Text style={styles.compareTableHeaderText}>B</Text>
                </View>
                {row("Price", (optA?.price_indicator as string) ?? (optA?.logistics as { estimated_cost?: string })?.estimated_cost ?? "", (optB?.price_indicator as string) ?? (optB?.logistics as { estimated_cost?: string })?.estimated_cost ?? "")}
                {row("Vibe", (optA?.why_this_fits as string) ?? (optA?.logic_bridge as string) ?? "", (optB?.why_this_fits as string) ?? (optB?.logic_bridge as string) ?? "")}
                {row("Distance", (optA?.logistics as { distance?: string })?.distance ?? "", (optB?.logistics as { distance?: string })?.distance ?? "")}
                <View style={styles.compareActions}>
                  <View style={styles.compareChooseBtnWrap}>
                    <PrimaryButton title="Choose A" onPress={() => { setChosenIndex(iA); setCompareIndices([]); }} />
                  </View>
                  <View style={styles.compareChooseBtnWrap}>
                    <PrimaryButton title="Choose B" onPress={() => { setChosenIndex(iB); setCompareIndices([]); }} />
                  </View>
                </View>
              </Card>
            );
          })()}
          <View style={styles.refinementFromOptionsWrap}>
            <Text style={styles.refinementFromOptionsLabel}>Want something different?</Text>
            <View style={styles.refinementChipsRow}>
              {REFINEMENT_CHIPS.map((label) => (
                <Chip key={label} label={label} onPress={() => handleRefinementFromOptions(label)} />
              ))}
            </View>
          </View>
        </ScrollView>
      )}

      {step === "confirm" && chosenOption && (
        <ScrollView style={styles.chatConfirmScroll} contentContainerStyle={styles.chatConfirmContent}>
          <TextButton
            title="Back to options"
            icon={<Ionicons name="arrow-back" size={20} color={theme.colors.primary} />}
            onPress={() => setChosenIndex(null)}
            style={styles.backRow}
          />
          <Card style={styles.chatConfirmCard} elevation={1}>
            <Text style={styles.chatConfirmTitle}>{String(chosenOption.option_name || chosenOption.narrative || "Suggestion")}</Text>
            <FitReasonLine reason={resolveFitReason(chosenOption)} numberOfLines={3} style={styles.chatConfirmFitReason} />
            <PrimaryButton title="Use this suggestion" onPress={() => chosenOption && setShowFeedbackFor(chosenOption)} />
          </Card>
        </ScrollView>
      )}

      <Modal visible={showFeedbackFor != null} transparent animationType="fade">
        <Pressable style={styles.feedbackModalBackdrop} onPress={() => { setShowFeedbackFor(null); handleClose(); }}>
          <Pressable onPress={(e) => e.stopPropagation()}>
          <Card style={styles.feedbackModalCard} elevation={2}>
            <Text style={styles.feedbackModalTitle}>How did it go?</Text>
            <View style={styles.feedbackModalActions}>
              {(["went_well", "didnt_use", "not_quite_right"] as ConciergeFeedbackType[]).map((fb) => (
                <SecondaryButton
                  key={fb}
                  title={fb === "went_well" ? "Went well" : fb === "didnt_use" ? "Didn't use" : "Not quite right"}
                  onPress={async () => {
                    reportConciergeOutcome(lastRequestId, fb).catch(() => {});
                    if (showFeedbackFor) {
                      const summary = String(showFeedbackFor.option_name ?? showFeedbackFor.narrative ?? "Plan");
                      await saveConciergeFeedback(summary, fb, mode);
                    }
                    setShowFeedbackFor(null);
                    handleClose();
                  }}
                />
              ))}
            </View>
            <TouchableOpacity style={styles.feedbackModalSkip} onPress={() => { setShowFeedbackFor(null); handleClose(); }}>
              <Text style={styles.feedbackModalSkipText}>Skip</Text>
            </TouchableOpacity>
          </Card>
          </Pressable>
        </Pressable>
      </Modal>
        </View>
      </GestureDetector>
    </KeyboardAvoidingView>
  );
}

function makeStyles(theme: AppTheme) {
  return StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    backgroundColor: theme.colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  headerBtn: {
    width: 40,
    height: 40,
    borderRadius: theme.radii.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  headerCenter: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: theme.spacing.sm,
  },
  headerTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.xs,
  },
  headerSpark: {
    marginTop: 1,
  },
  headerTitle: {
    ...theme.type.h3,
    color: theme.colors.textPrimary,
  },
  headerSub: {
    ...theme.type.caption,
    color: theme.colors.textMuted,
    marginTop: 2,
  },
  stepIndicatorRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: theme.spacing.sm,
    paddingVertical: theme.spacing.sm,
    backgroundColor: theme.colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
  },
  stepDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: theme.colors.border,
  },
  stepDotActive: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: theme.colors.primary,
  },
  stepDotDone: {
    backgroundColor: theme.colors.primary,
    opacity: 0.6,
  },
  contentWrap: {
    flex: 1,
  },
  disclosure: {
    marginHorizontal: theme.spacing.xxl,
    marginTop: theme.spacing.md,
    marginBottom: theme.spacing.sm,
  },
  chatModeBackdrop: {
    flex: 1,
    backgroundColor: theme.colors.overlay,
    justifyContent: "flex-end",
  },
  chatModeSheet: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: theme.radii.lg,
    borderTopRightRadius: theme.radii.lg,
    padding: theme.spacing.xl,
  },
  chatModeHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: theme.spacing.md,
  },
  chatModeTitle: {
    ...theme.type.h3,
    color: theme.colors.textPrimary,
    flex: 1,
    paddingRight: theme.spacing.sm,
  },
  chatModeOption: {
    backgroundColor: theme.colors.backgroundMuted,
    borderRadius: theme.radii.lg,
    paddingVertical: theme.spacing.lg,
    paddingHorizontal: theme.spacing.lg,
    marginBottom: theme.spacing.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  chatModeOptionTitle: {
    ...theme.type.bodyMedium,
    color: theme.colors.textPrimary,
    fontWeight: "700",
    marginBottom: theme.spacing.xs,
  },
  chatModeOptionSub: {
    ...theme.type.caption,
    color: theme.colors.textSecondary,
  },
  chatModeCloseRow: {
    marginTop: theme.spacing.xs,
    paddingVertical: theme.spacing.lg,
    alignItems: "center",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.border,
  },
  chatModeCloseText: {
    ...theme.type.caption,
    color: theme.colors.textSecondary,
    fontWeight: "700",
  },
  chatAssistChipsWrap: {
    marginHorizontal: theme.spacing.xxl,
    marginBottom: theme.spacing.md,
    marginTop: theme.spacing.xs,
  },
  chatAssistLabel: {
    ...theme.type.caption,
    color: theme.colors.textSecondary,
    fontWeight: "600",
    marginBottom: theme.spacing.sm,
  },
  chatAssistChipsRow: {
    flexDirection: "row",
    gap: theme.spacing.sm,
    paddingRight: theme.spacing.sm,
  },
  offlineBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
    backgroundColor: theme.colors.textPrimary,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.lg,
    borderRadius: theme.radii.sm,
    marginHorizontal: theme.spacing.xxl,
    marginBottom: theme.spacing.md,
  },
  offlineBannerText: {
    ...theme.type.caption,
    color: theme.colors.textInverse,
    fontWeight: "600",
  },
  errorBlock: {
    marginHorizontal: theme.spacing.xxl,
    marginTop: theme.spacing.md,
    marginBottom: theme.spacing.md,
  },
  errorText: {
    ...theme.type.caption,
    color: theme.colors.error,
    marginBottom: theme.spacing.sm,
  },
  retryBtnWrap: {
    alignSelf: "flex-start",
    marginTop: theme.spacing.xs,
  },
  noOptionsReasonText: {
    ...theme.type.caption,
    color: theme.colors.textSecondary,
    fontStyle: "italic",
    marginTop: theme.spacing.sm,
    marginBottom: theme.spacing.xs,
  },
  skeletonWrap: {
    marginHorizontal: theme.spacing.xxl,
    marginTop: theme.spacing.xl,
  },
  skeletonCard: {
    backgroundColor: theme.colors.backgroundMuted,
    borderRadius: theme.radii.lg,
    padding: theme.spacing.lg,
    marginBottom: theme.spacing.md,
  },
  skeletonLine: {
    height: 14,
    backgroundColor: theme.colors.border,
    borderRadius: 7,
    marginBottom: theme.spacing.sm,
    width: "90%",
  },
  skeletonLineShort: { width: "60%" },
  skeletonLineCta: { width: 80, height: 12, marginTop: theme.spacing.xs },
  emptyStateWrap: {
    marginHorizontal: theme.spacing.xxl,
    marginTop: theme.spacing.xl,
  },
  messageText: {
    ...theme.type.body,
    color: theme.colors.textPrimary,
  },
  emptyStateLabel: {
    ...theme.type.caption,
    color: theme.colors.textSecondary,
    fontWeight: "600",
    marginTop: theme.spacing.lg,
    marginBottom: theme.spacing.sm,
  },
  emptyStateActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.lg,
  },
  refinementFromOptionsWrap: {
    marginTop: theme.spacing.sm,
    paddingTop: theme.spacing.lg,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  refinementFromOptionsLabel: {
    ...theme.type.caption,
    color: theme.colors.textSecondary,
    fontWeight: "600",
    marginBottom: theme.spacing.sm,
  },
  refinementChipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing.sm,
  },
  optionsScroll: { flex: 1 },
  optionsContent: { paddingHorizontal: theme.spacing.xxl, paddingBottom: theme.spacing.xxl },
  optionsIntro: {
    ...theme.type.body,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.lg,
  },
  optionCard: {
    marginBottom: theme.spacing.md,
  },
  optionCardTouchable: { marginBottom: 0 },
  optionCardBadges: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
  },
  winklyBadge: {
    backgroundColor: theme.colors.primary,
    paddingVertical: theme.spacing.xs,
    paddingHorizontal: theme.spacing.sm,
    borderRadius: theme.radii.sm,
  },
  winklyBadgeText: {
    ...theme.type.caption,
    color: theme.colors.onPrimary,
    fontWeight: "700",
  },
  dnaBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.xs,
  },
  dnaBadgeText: {
    ...theme.type.caption,
    color: theme.colors.primary,
    fontWeight: "600",
  },
  saveForLaterBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.xs,
  },
  saveForLaterText: {
    ...theme.type.caption,
    color: theme.colors.primary,
    fontWeight: "500",
  },
  viewOnMapBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.xs,
    marginTop: theme.spacing.sm,
  },
  viewOnMapText: {
    ...theme.type.caption,
    color: theme.colors.primary,
    fontWeight: "500",
  },
  optionCardHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.xs,
  },
  compareChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.xxs,
    paddingVertical: theme.spacing.xs,
    paddingHorizontal: theme.spacing.sm,
    borderRadius: theme.radii.sm,
    backgroundColor: theme.colors.backgroundMuted,
  },
  compareChipActive: { backgroundColor: theme.colors.primary },
  compareChipText: {
    ...theme.type.caption,
    fontSize: 11,
    color: theme.colors.primary,
    fontWeight: "600",
  },
  compareChipTextActive: { color: theme.colors.onPrimary },
  compareBlock: {
    marginHorizontal: theme.spacing.xxl,
    marginTop: theme.spacing.xl,
    marginBottom: theme.spacing.lg,
  },
  compareBlockTitle: {
    ...theme.type.caption,
    fontWeight: "700",
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.md,
  },
  compareTableHeader: {
    flexDirection: "row",
    marginBottom: theme.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    paddingBottom: theme.spacing.xs,
  },
  compareTableHeaderText: {
    ...theme.type.caption,
    fontWeight: "600",
    color: theme.colors.textSecondary,
    flex: 1,
  },
  compareRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: theme.spacing.sm,
  },
  compareRowLabel: {
    ...theme.type.caption,
    width: 70,
    color: theme.colors.textSecondary,
    fontWeight: "500",
  },
  compareRowVal: {
    flex: 1,
    ...theme.type.caption,
    color: theme.colors.textPrimary,
  },
  compareActions: {
    flexDirection: "row",
    gap: theme.spacing.md,
    marginTop: theme.spacing.md,
  },
  compareChooseBtnWrap: { flex: 1 },
  feedbackModalBackdrop: {
    flex: 1,
    backgroundColor: theme.colors.overlay,
    justifyContent: "center",
    alignItems: "center",
    padding: theme.spacing.xxl,
  },
  feedbackModalCard: {
    width: "100%",
    maxWidth: 340,
  },
  feedbackModalTitle: {
    ...theme.type.h3,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.xl,
    textAlign: "center",
  },
  feedbackModalActions: {
    gap: theme.spacing.sm,
  },
  feedbackModalSkip: {
    alignItems: "center",
    marginTop: theme.spacing.md,
  },
  feedbackModalSkipText: {
    ...theme.type.caption,
    color: theme.colors.textMuted,
  },
  savedSection: {
    marginHorizontal: theme.spacing.xxl,
    marginBottom: theme.spacing.xl,
  },
  savedSectionTitle: {
    ...theme.type.caption,
    color: theme.colors.textSecondary,
    fontWeight: "600",
    marginBottom: theme.spacing.sm,
  },
  savedCard: {
    marginBottom: theme.spacing.sm,
  },
  savedCardTitle: {
    ...theme.type.bodyMedium,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.xs,
  },
  savedCardMeta: {
    ...theme.type.caption,
    color: theme.colors.textMuted,
    marginBottom: theme.spacing.sm,
  },
  savedCardActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
  },
  savedAddBtnWrap: { flex: 1 },
  savedRemoveBtn: { padding: theme.spacing.sm },
  optionTitle: {
    ...theme.type.h3,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.xs,
    flex: 1,
  },
  optionFitReason: {
    marginBottom: theme.spacing.sm,
  },
  optionSchedule: {
    ...theme.type.caption,
    color: theme.colors.textMuted,
    marginBottom: theme.spacing.sm,
  },
  optionCardFooter: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.md,
    marginTop: theme.spacing.md,
    paddingTop: theme.spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.border,
  },
  choosePlanBtnWrap: { flex: 1 },
  backRow: {
    alignSelf: "flex-start",
    marginBottom: theme.spacing.md,
    paddingLeft: 0,
  },
  chatConfirmScroll: { flex: 1 },
  chatConfirmContent: { paddingHorizontal: theme.spacing.xxl, paddingBottom: theme.spacing.xxl },
  chatConfirmCard: {},
  chatConfirmTitle: {
    ...theme.type.h3,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.sm,
  },
  chatConfirmFitReason: {
    marginTop: theme.spacing.xs,
    marginBottom: theme.spacing.xl,
  },
  });
}
