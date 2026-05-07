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
import { Colors, Typography, FontFamily, HEADER } from "@/constants/tokens";
import type { ConciergeContext, ExperienceOption } from "@/lib/ai/conciergeClient";
import { ConciergeRequestForm } from "@/components/ai/ConciergeRequestForm";
import { ConciergePlanningFlow } from "@/components/ai/ConciergePlanningFlow";
import { callConciergeStream, reportConciergeOutcome } from "@/lib/ai/conciergeClient";
import { getMergedDeviceWhiteSpaceSlots, formatCalendarWhiteSpaceForGateway } from "@/lib/integrations/calendarWhiteSpace";
import { buildBookingContextForAi } from "@/lib/integrations/bookingLinks";
import { supabase } from "@/lib/supabase";
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

function isWinklyOption(opt: ExperienceOption): boolean {
  return (opt as { source?: string }).source === "winkly_event";
}
import { useFormatLocationDisplay } from "@/lib/location/useLocationDisplay";
import { useModeContext } from "@/providers";
import type { Mode } from "@/types";
import { recordPairBehaviorSignal } from "@/lib/matching/behaviorSignals";

const VALID_MODES: Mode[] = ["romance", "friends", "business", "events"];

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
  }>();
  const insets = useSafeAreaInsets();
  const { context: modeContext } = useModeContext();

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
  const [lastRetryAfter, setLastRetryAfter] = useState<number | null>(null);
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
      router.back();
    }
  }, [step, router]);

  const panGesture = useMemo(
    () =>
      Gesture.Pan()
        .onStart((e) => {
          swipeStartX.current = e.x;
        })
        .activeOffsetX(20)
        .failOffsetY(-15)
        .minDistance(40)
        .onEnd((e) => {
          // Support both directions: swipe left (anywhere) or edge-swipe right.
          if (step === "form") return;
          if (e.translationX < -60) {
            handleBack();
            return;
          }
          if (swipeStartX.current < 50 && e.translationX > 60) handleBack();
        }),
    [step, handleBack]
  );

  const handleClose = () => {
    Haptics.selectionAsync();
    router.back();
  };

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
            params.initial_step === "activity" || params.initial_step === "social"
              ? (params.initial_step as "activity" | "social")
              : undefined
          }
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
          onBack={() => router.back()}
        />
      </KeyboardAvoidingView>
    );
  }

  const handleSubmit = async (context: ConciergeContext) => {
    setError(null);
    setLastErrorCode(null);
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
          if (res.error) {
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
        <TouchableOpacity onPress={handleBack} style={styles.headerBtn} accessibilityLabel="Back">
          <Ionicons name="arrow-back" size={HEADER.iconSize} color={Colors.textPrimary} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle} numberOfLines={1}>{headerTitle}</Text>
          {step !== "form" && (
            <Text style={styles.headerSub}>
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
        <TouchableOpacity onPress={handleClose} style={styles.headerBtn} accessibilityLabel="Close">
          <Ionicons name="close" size={22} color={Colors.gray600} />
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
          {savedIdeas.length > 0 && (
            <View style={styles.savedSection}>
              <Text style={styles.savedSectionTitle}>Saved ideas</Text>
              {savedIdeas.slice(0, 5).map((saved) => (
                <View key={saved.id} style={styles.savedCard}>
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
                    <TouchableOpacity
                      style={styles.savedAddBtn}
                      onPress={() => {
                        Haptics.selectionAsync();
                        setSuggestions([saved.option]);
                        setChosenIndex(0);
                        if (saved.context?.date_from) setLastDate(saved.context.date_from);
                      }}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.savedAddBtnText}>Add to planner</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={async () => {
                        Haptics.selectionAsync();
                        await removeSavedIdea(saved.id);
                        loadSaved();
                      }}
                      style={styles.savedRemoveBtn}
                    >
                      <Ionicons name="trash-outline" size={18} color={Colors.gray500} />
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>
          )}

          {source_screen === "chats" && chatMode === null && params.partner_user_id ? (
            <Modal transparent animationType="slide" visible>
              <Pressable
                style={styles.chatModeBackdrop}
                onPress={() => {
                  Haptics.selectionAsync();
                  setChatMode("assist");
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
                      <Ionicons name="close" size={22} color={Colors.gray600} />
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
                  <TouchableOpacity
                    key={chip.id}
                    style={styles.chatAssistChip}
                    onPress={() => {
                      Haptics.selectionAsync();
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
                    activeOpacity={0.85}
                  >
                    <Text style={styles.chatAssistChipText}>{chip.label}</Text>
                  </TouchableOpacity>
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
          />
          {isConnected === false && (
            <View style={styles.offlineBanner}>
              <Ionicons name="cloud-offline-outline" size={20} color={Colors.white} />
              <Text style={styles.offlineBannerText}>Check connection and try again.</Text>
            </View>
          )}
          {error ? (
            <View style={styles.errorBlock}>
              <Text style={styles.errorText}>{error}</Text>
              {lastErrorCode === "rate_limit" && lastRetryAfter != null && lastRetryAfter >= 60 && (
                <Text style={styles.errorHint}>Try after 1 minute.</Text>
              )}
              {lastSubmittedContext.current && (
                <TouchableOpacity
                  style={styles.retryBtn}
                  onPress={() => { Haptics.selectionAsync(); handleSubmit(lastSubmittedContext.current!); }}
                  activeOpacity={0.9}
                  disabled={loading}
                >
                  <Text style={styles.retryBtnText}>Retry</Text>
                </TouchableOpacity>
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
          <View style={styles.emptyStateWrap}>
            <Text style={styles.messageText}>{message}</Text>
            {noOptionsReason ? (
              <Text style={styles.noOptionsReasonText}>{noOptionsReason}</Text>
            ) : null}
            <Text style={styles.emptyStateLabel}>Try adjusting:</Text>
            <View style={styles.emptyStateActions}>
              {EMPTY_STATE_ACTIONS.map((a) => (
                <TouchableOpacity
                  key={a.id}
                  style={styles.emptyStateChip}
                  onPress={() => {
                    Haptics.selectionAsync();
                    setMessage(null);
                  }}
                  activeOpacity={0.8}
                >
                  <Ionicons name={a.icon} size={16} color={Colors.primaryViolet} />
                  <Text style={styles.emptyStateChipText}>{a.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity style={styles.tryAgainBtn} onPress={handleTryAgain} activeOpacity={0.9}>
              <Text style={styles.tryAgainBtnText}>Get new suggestions</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      )}

      {step === "options" && suggestions && suggestions.length > 0 && (
        <ScrollView style={styles.optionsScroll} contentContainerStyle={styles.optionsContent} showsVerticalScrollIndicator={false}>
          {message ? <Text style={styles.optionsIntro}>{message}</Text> : null}
          {sortedOptionsWithIndex.map(({ opt, originalIndex }) => {
            const mapQuery = [opt.option_name ?? opt.narrative, (opt as { place?: string }).place, lastSubmittedContext.current?.city].filter(Boolean).join(", ");
            return (
              <View key={originalIndex} style={styles.optionCard}>
                <View style={styles.optionCardBadges}>
                  {isWinklyOption(opt) && (
                    <View style={styles.winklyBadge}>
                      <Text style={styles.winklyBadgeText}>Winkly</Text>
                    </View>
                  )}
                  {lastSubmittedContext.current?.presentation === "decisive" && (suggestions?.length ?? 0) >= 2 ? (
                    <View style={styles.dnaBadge}>
                      <Ionicons name="star" size={14} color={Colors.accentYellow} />
                      <Text style={styles.dnaBadgeText}>{originalIndex === 0 ? "Primary pick" : "Backup"}</Text>
                    </View>
                  ) : (opt.why_this_fits || opt.logic_bridge) ? (
                    <View style={styles.dnaBadge}>
                      <Ionicons name="heart" size={14} color={Colors.primaryViolet} />
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
                      <Ionicons name="git-compare-outline" size={14} color={compareIndices.includes(originalIndex) ? Colors.white : Colors.primaryViolet} />
                      <Text style={[styles.compareChipText, compareIndices.includes(originalIndex) && styles.compareChipTextActive]}>Compare</Text>
                    </TouchableOpacity>
                  </View>
                  {opt.why_this_fits ? <Text style={styles.optionWhy} numberOfLines={2}>{String(opt.why_this_fits)}</Text> : null}
                  {Array.isArray(opt.schedule) && opt.schedule.length > 0 ? (
                    <Text style={styles.optionSchedule} numberOfLines={2}>{opt.schedule.join(" · ")}</Text>
                  ) : null}
                  {mapQuery ? (
                    <TouchableOpacity
                      style={styles.viewOnMapBtn}
                      onPress={() => {
                        Haptics.selectionAsync();
                        Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapQuery)}`);
                      }}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="map-outline" size={16} color={Colors.primaryViolet} />
                      <Text style={styles.viewOnMapText}>View on map</Text>
                    </TouchableOpacity>
                  ) : null}
                  <Text style={styles.optionCta}>Use this one</Text>
                </TouchableOpacity>
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
                  <Ionicons name="bookmark-outline" size={18} color={Colors.primaryViolet} />
                  <Text style={styles.saveForLaterText}>Save for later</Text>
                </TouchableOpacity>
              </View>
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
              <View style={styles.compareBlock}>
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
                  <TouchableOpacity style={styles.compareChooseBtn} onPress={() => { Haptics.selectionAsync(); setChosenIndex(iA); setCompareIndices([]); }} activeOpacity={0.9}>
                    <Text style={styles.compareChooseBtnText}>Choose A</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.compareChooseBtn} onPress={() => { Haptics.selectionAsync(); setChosenIndex(iB); setCompareIndices([]); }} activeOpacity={0.9}>
                    <Text style={styles.compareChooseBtnText}>Choose B</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })()}
          <View style={styles.refinementFromOptionsWrap}>
            <Text style={styles.refinementFromOptionsLabel}>Want something different?</Text>
            <View style={styles.refinementChipsRow}>
              {REFINEMENT_CHIPS.map((label) => (
                <TouchableOpacity
                  key={label}
                  style={styles.refinementChip}
                  onPress={() => handleRefinementFromOptions(label)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.refinementChipText}>{label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </ScrollView>
      )}

      {step === "confirm" && chosenOption && (
        <ScrollView style={styles.chatConfirmScroll} contentContainerStyle={styles.chatConfirmContent}>
          <TouchableOpacity onPress={() => setChosenIndex(null)} style={styles.backRow} activeOpacity={0.8}>
            <Ionicons name="arrow-back" size={22} color={Colors.primaryViolet} />
            <Text style={styles.backText}>Back to options</Text>
          </TouchableOpacity>
          <Text style={styles.chatConfirmTitle}>{String(chosenOption.option_name || chosenOption.narrative || "Suggestion")}</Text>
          {(chosenOption.why_this_fits || chosenOption.logic_bridge) && (
            <Text style={styles.chatConfirmWhy}>{String(chosenOption.why_this_fits || chosenOption.logic_bridge)}</Text>
          )}
          <TouchableOpacity style={styles.useSuggestionBtn} onPress={() => chosenOption && setShowFeedbackFor(chosenOption)} activeOpacity={0.9}>
            <Text style={styles.useSuggestionBtnText}>Use this suggestion</Text>
          </TouchableOpacity>
        </ScrollView>
      )}

      <Modal visible={showFeedbackFor != null} transparent animationType="fade">
        <Pressable style={styles.feedbackModalBackdrop} onPress={() => { setShowFeedbackFor(null); handleClose(); }}>
          <Pressable style={styles.feedbackModalCard} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.feedbackModalTitle}>How did it go?</Text>
            <View style={styles.feedbackModalActions}>
              {(["went_well", "didnt_use", "not_quite_right"] as ConciergeFeedbackType[]).map((fb) => (
                <TouchableOpacity
                  key={fb}
                  style={styles.feedbackModalBtn}
                  onPress={async () => {
                    Haptics.selectionAsync();
                    reportConciergeOutcome(lastRequestId, fb).catch(() => {});
                    if (showFeedbackFor) {
                      const summary = String(showFeedbackFor.option_name ?? showFeedbackFor.narrative ?? "Plan");
                      await saveConciergeFeedback(summary, fb, mode);
                    }
                    setShowFeedbackFor(null);
                    handleClose();
                  }}
                  activeOpacity={0.9}
                >
                  <Text style={styles.feedbackModalBtnText}>
                    {fb === "went_well" ? "Went well" : fb === "didnt_use" ? "Didn't use" : "Not quite right"}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity style={styles.feedbackModalSkip} onPress={() => { setShowFeedbackFor(null); handleClose(); }}>
              <Text style={styles.feedbackModalSkipText}>Skip</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
        </View>
      </GestureDetector>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.backgroundLight,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray200,
  },
  headerBtn: {
    width: HEADER.buttonSize,
    height: HEADER.buttonSize,
    borderRadius: HEADER.buttonRadius,
    alignItems: "center",
    justifyContent: "center",
  },
  headerCenter: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
  },
  headerTitle: {
    ...Typography.headerTitle,
    color: Colors.primaryViolet,
    fontFamily: FontFamily.heading,
  },
  headerSub: {
    ...Typography.caption,
    color: Colors.gray500,
    marginTop: 2,
  },
  stepIndicatorRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    backgroundColor: Colors.white,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.gray200,
  },
  stepDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.gray300,
  },
  stepDotActive: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.primaryViolet,
  },
  stepDotDone: {
    backgroundColor: Colors.primaryViolet,
    opacity: 0.6,
  },
  contentWrap: {
    flex: 1,
  },
  chatModeBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-end",
  },
  chatModeSheet: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
  },
  chatModeHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  chatModeTitle: {
    ...Typography.h3,
    color: Colors.textPrimary,
    flex: 1,
    paddingRight: 10,
  },
  chatModeOption: {
    backgroundColor: Colors.gray100,
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: Colors.gray200,
  },
  chatModeOptionTitle: {
    ...Typography.body,
    color: Colors.textPrimary,
    fontWeight: "700",
    marginBottom: 4,
  },
  chatModeOptionSub: {
    ...Typography.caption,
    color: Colors.gray600,
  },
  chatAssistChipsWrap: {
    marginHorizontal: 24,
    marginBottom: 12,
    marginTop: 6,
  },
  chatAssistLabel: {
    ...Typography.caption,
    color: Colors.gray600,
    fontWeight: "600",
    marginBottom: 8,
  },
  chatAssistChipsRow: {
    flexDirection: "row",
    gap: 10,
    paddingRight: 10,
  },
  chatAssistChip: {
    backgroundColor: Colors.gray100,
    borderRadius: 999,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: Colors.gray200,
  },
  chatAssistChipText: {
    ...Typography.caption,
    color: Colors.primaryViolet,
    fontWeight: "600",
  },
  offlineBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: Colors.textPrimary,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
    marginHorizontal: 24,
    marginBottom: 12,
  },
  offlineBannerText: {
    ...Typography.caption,
    color: Colors.white,
    fontWeight: "600",
  },
  errorBlock: {
    marginHorizontal: 24,
    marginTop: 12,
    marginBottom: 12,
  },
  errorText: {
    ...Typography.caption,
    color: Colors.errorRed,
    marginBottom: 6,
  },
  errorHint: {
    ...Typography.caption,
    color: Colors.gray600,
    marginBottom: 10,
  },
  retryBtn: {
    alignSelf: "flex-start",
    backgroundColor: Colors.primaryViolet,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 12,
    marginTop: 4,
  },
  retryBtnText: {
    ...Typography.caption,
    color: Colors.white,
    fontWeight: "600",
  },
  noOptionsReasonText: {
    ...Typography.caption,
    color: Colors.gray600,
    fontStyle: "italic",
    marginTop: 8,
    marginBottom: 4,
  },
  messageWrap: {
    marginHorizontal: 24,
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: Colors.gray200,
  },
  messageText: {
    ...Typography.body,
    color: Colors.textPrimary,
  },
  messageHint: {
    ...Typography.caption,
    color: Colors.gray500,
    marginTop: 8,
  },
  skeletonWrap: {
    marginHorizontal: 24,
    marginTop: 20,
  },
  skeletonCard: {
    backgroundColor: Colors.gray100,
    borderRadius: 16,
    padding: 18,
    marginBottom: 12,
  },
  skeletonLine: {
    height: 14,
    backgroundColor: Colors.gray300,
    borderRadius: 7,
    marginBottom: 8,
    width: "90%",
  },
  skeletonLineShort: { width: "60%" },
  skeletonLineCta: { width: 80, height: 12, marginTop: 4 },
  emptyStateWrap: {
    marginHorizontal: 24,
    marginTop: 20,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: Colors.gray200,
  },
  emptyStateLabel: {
    ...Typography.caption,
    color: Colors.gray600,
    fontWeight: "600",
    marginTop: 16,
    marginBottom: 10,
  },
  emptyStateActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 16,
  },
  emptyStateChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: Colors.gray100,
  },
  emptyStateChipText: {
    ...Typography.caption,
    color: Colors.primaryViolet,
    fontWeight: "600",
  },
  tryAgainBtn: {
    backgroundColor: Colors.primaryViolet,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
  },
  tryAgainBtnText: {
    ...Typography.button,
    color: Colors.white,
  },
  refinementFromOptionsWrap: {
    marginTop: 8,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: Colors.gray200,
  },
  refinementFromOptionsLabel: {
    ...Typography.caption,
    color: Colors.gray600,
    fontWeight: "600",
    marginBottom: 10,
  },
  refinementChipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  refinementChip: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: Colors.gray100,
  },
  refinementChipText: {
    ...Typography.caption,
    color: Colors.primaryViolet,
    fontWeight: "500",
  },
  optionsScroll: { flex: 1 },
  optionsContent: { paddingHorizontal: 24, paddingBottom: 24 },
  optionsIntro: {
    ...Typography.body,
    color: Colors.textPrimary,
    marginBottom: 16,
  },
  optionCard: {
    backgroundColor: Colors.white,
    borderRadius: 16,
    padding: 18,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.gray200,
  },
  optionCardTouchable: { marginBottom: 0 },
  optionCardBadges: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 8,
  },
  winklyBadge: {
    backgroundColor: Colors.primaryViolet,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 12,
  },
  winklyBadgeText: {
    ...Typography.caption,
    color: Colors.white,
    fontWeight: "700",
  },
  dnaBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  dnaBadgeText: {
    ...Typography.caption,
    color: Colors.primaryViolet,
    fontWeight: "600",
  },
  saveForLaterBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.gray200,
  },
  saveForLaterText: {
    ...Typography.caption,
    color: Colors.primaryViolet,
    fontWeight: "500",
  },
  viewOnMapBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 8,
  },
  viewOnMapText: {
    ...Typography.caption,
    color: Colors.primaryViolet,
    fontWeight: "500",
  },
  optionCardHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    marginBottom: 6,
  },
  compareChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 12,
    backgroundColor: Colors.gray100,
  },
  compareChipActive: { backgroundColor: Colors.primaryViolet },
  compareChipText: {
    ...Typography.caption,
    fontSize: 11,
    color: Colors.primaryViolet,
    fontWeight: "600",
  },
  compareChipTextActive: { color: Colors.white },
  compareBlock: {
    marginHorizontal: 24,
    marginTop: 20,
    marginBottom: 16,
    backgroundColor: Colors.gray100,
    borderRadius: 14,
    padding: 16,
  },
  compareBlockTitle: {
    ...Typography.caption,
    fontWeight: "700",
    color: Colors.textPrimary,
    marginBottom: 12,
  },
  compareTableHeader: {
    flexDirection: "row",
    marginBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray300,
    paddingBottom: 6,
  },
  compareTableHeaderText: {
    ...Typography.caption,
    fontWeight: "600",
    color: Colors.gray600,
    flex: 1,
  },
  compareRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  compareRowLabel: {
    ...Typography.caption,
    width: 70,
    color: Colors.gray600,
    fontWeight: "500",
  },
  compareRowVal: {
    flex: 1,
    ...Typography.caption,
    color: Colors.textPrimary,
  },
  compareActions: {
    flexDirection: "row",
    gap: 12,
    marginTop: 14,
  },
  compareChooseBtn: {
    flex: 1,
    backgroundColor: Colors.primaryViolet,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
  },
  compareChooseBtnText: {
    ...Typography.caption,
    color: Colors.white,
    fontWeight: "600",
  },
  feedbackModalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  feedbackModalCard: {
    backgroundColor: Colors.white,
    borderRadius: 20,
    padding: 24,
    width: "100%",
    maxWidth: 340,
  },
  feedbackModalTitle: {
    ...Typography.h3,
    color: Colors.textPrimary,
    marginBottom: 20,
    textAlign: "center",
  },
  feedbackModalActions: {
    gap: 10,
  },
  feedbackModalBtn: {
    backgroundColor: Colors.gray100,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    marginBottom: 8,
  },
  feedbackModalBtnText: {
    ...Typography.body,
    color: Colors.primaryViolet,
    fontWeight: "600",
  },
  feedbackModalSkip: {
    alignItems: "center",
    marginTop: 12,
  },
  feedbackModalSkipText: {
    ...Typography.caption,
    color: Colors.gray500,
  },
  savedSection: {
    marginHorizontal: 24,
    marginBottom: 20,
  },
  savedSectionTitle: {
    ...Typography.caption,
    color: Colors.gray600,
    fontWeight: "600",
    marginBottom: 10,
  },
  savedCard: {
    backgroundColor: Colors.white,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: Colors.gray200,
  },
  savedCardTitle: {
    ...Typography.body,
    fontWeight: "600",
    color: Colors.textPrimary,
    marginBottom: 4,
  },
  savedCardMeta: {
    ...Typography.caption,
    color: Colors.gray500,
    marginBottom: 10,
  },
  savedCardActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  savedAddBtn: {
    flex: 1,
    backgroundColor: Colors.primaryViolet,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: "center",
  },
  savedAddBtnText: {
    ...Typography.caption,
    color: Colors.white,
    fontWeight: "600",
  },
  savedRemoveBtn: { padding: 8 },
  optionTitle: {
    ...Typography.h3,
    color: Colors.textPrimary,
    marginBottom: 6,
  },
  optionWhy: {
    ...Typography.caption,
    color: Colors.gray600,
    marginBottom: 6,
  },
  optionSchedule: {
    ...Typography.caption,
    color: Colors.gray500,
    marginBottom: 10,
  },
  optionCta: {
    ...Typography.caption,
    color: Colors.primaryViolet,
    fontWeight: "600",
  },
  backRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 16,
  },
  backText: {
    ...Typography.caption,
    color: Colors.primaryViolet,
    fontWeight: "600",
  },
  chatConfirmScroll: { flex: 1 },
  chatConfirmContent: { paddingHorizontal: 24, paddingBottom: 24 },
  chatConfirmTitle: {
    ...Typography.h3,
    color: Colors.textPrimary,
    marginBottom: 8,
  },
  chatConfirmWhy: {
    ...Typography.body,
    color: Colors.gray600,
    marginBottom: 24,
  },
  useSuggestionBtn: {
    backgroundColor: Colors.primaryViolet,
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: "center",
  },
  useSuggestionBtnText: {
    ...Typography.button,
    color: Colors.white,
  },
});
