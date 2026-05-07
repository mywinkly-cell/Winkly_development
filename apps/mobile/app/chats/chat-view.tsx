/**
 * Winkly 1:1 Direct Chat View
 * Text, emoji, images, GIF (paste URL), voice notes, reactions, reply, read receipts,
 * typing indicator, block, report, mute, delete for self.
 * New messages merge from realtime INSERT + sendMessage returns (no full-list refetch per message).
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  FlatList,
  ScrollView,
  TextInput,
  Pressable,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Image,
  Alert,
  Modal,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from "expo-audio";
import { SafeScreenView } from "@/components/SafeScreenView";
import { Colors } from "@/constants/tokens";
import { useRouter, useLocalSearchParams } from "expo-router";
import { supabase } from "@/lib/supabase";
import {
  sendMessage,
  addReaction,
  removeReaction,
  deleteMessageForSelf,
  deleteMessageForEveryone,
  markMessagesAsRead,
  markConversationRead,
  setConversationMuted,
  blockUser,
  reportMessage,
  getReadReceiptsPreference,
  setReadReceiptsPreference,
} from "@/lib/chats/api";
import {
  useMessages,
  useMessageSubscription,
  useTypingIndicator,
  useMessageReactions,
} from "@/lib/chats/hooks";
import type { Message, MessageAttachment, UserMini } from "@/lib/chats/types";
import { pickAndUploadChatImages as pickImages, uploadChatVoiceFromUri } from "@/lib/uploadMedia";
import { VoiceMessageBubble } from "@/components/chats/VoiceMessageBubble";
import { GifUrlSheet } from "@/components/chats/GifUrlSheet";
import { InviteToPlanModal } from "@/components/chats/InviteToPlanModal";
import type { InviteFormValues } from "@/components/chats/InviteToPlanModal";
import { buildIcebreakerPayload, pickRandomIcebreaker } from "@/lib/communications/icebreakers";
import { openVideoCallRoom, startVideoCallForConversation } from "@/lib/communications/videoCall";
import {
  createPlannerInvite,
  acceptPlannerInvite,
  declinePlannerInvite,
  reschedulePlannerInvite,
  getPlannerInvitationsForUser,
} from "@/lib/plannerInvitations";
import { confirmPendingPlan } from "@/lib/ai/conciergeClient";
import type { Mode } from "@/types";
import { useModeContext } from "@/providers";
import { hasAnyAIAccess } from "@/lib/ai/aiFeatureGate";
import { getExperienceSuggestionForChat } from "@/lib/ai/chatExperienceSuggestion";
import type { ChatExperienceSuggestion } from "@/lib/ai/chatExperienceSuggestion";
import { ChatExperienceSuggestionCard } from "@/components/chats/ChatExperienceSuggestionCard";
import { postMatchBridgeCtaMessage } from "@/lib/ai/matchBridgeClient";
import {
  postMatchAgentCtaMessage,
  recordMatchAgentApproval,
  type MatchAgentCtaPayload,
} from "@/lib/ai/matchAgentClient";
import { recordPairBehaviorSignal } from "@/lib/matching/behaviorSignals";
import { SparklesIcon } from "@/components/ui/WinklyAISpark";
import { useFormatLocationDisplay } from "@/lib/location/useLocationDisplay";
import {
  isConversationEligibleForStaleNudge,
  dismissStaleConciergeNudge,
} from "@/lib/chats/conciergeNudge";
import { getSharedInterestHintForPair } from "@/lib/ai/preferenceEngine";
import { callWinklyPlan } from "@/lib/ai/conciergeClient";
import {
  getChatStrategicHostTopics,
  getPlannerThemePlans,
  type PlannerThemePlanOption,
  type StrategicHostTopic,
} from "@/lib/ai/strategicHost";

type ConversationRow = {
  id: string;
  type: string;
  mode: string;
  related_event_id: string | null;
  dm_source: string | null;
};

type Props = { conversationId: string };

function formatName(u?: UserMini | null) {
  if (!u) return "Unknown";
  const fn = (u.first_name ?? "").trim();
  const ln = (u.last_name ?? "").trim();
  return `${fn} ${ln}`.trim() || "Unknown";
}

const QUICK_REACTIONS = ["❤️", "👍", "😊", "😂", "😮", "🔥"];

const MAX_VOICE_SECONDS = 180;

const REPORT_REASONS: { key: string; label: string }[] = [
  { key: "spam", label: "Spam" },
  { key: "harassment", label: "Harassment" },
  { key: "inappropriate", label: "Inappropriate content" },
  { key: "fake", label: "Fake profile" },
  { key: "other", label: "Other" },
];

export default function ChatView({ conversationId }: Props) {
  const router = useRouter();
  const { matchBridge: matchBridgeParam } = useLocalSearchParams<{ matchBridge?: string }>();
  const fmtLocationLine = useFormatLocationDisplay();
  const convId = useMemo(() => String(conversationId), [conversationId]);

  const [meId, setMeId] = useState<string | null>(null);
  const [conversation, setConversation] = useState<ConversationRow | null>(null);
  const [participants, setParticipants] = useState<UserMini[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [readReceiptsOn, setReadReceiptsOn] = useState(true);
  const [muted, setMuted] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [invitationStatusMap, setInvitationStatusMap] = useState<Record<string, string>>({});
  const [pendingPlanStatusMap, setPendingPlanStatusMap] = useState<Record<string, string>>({});
  const [chatExperienceSuggestion, setChatExperienceSuggestion] = useState<ChatExperienceSuggestion | null>(null);
  const [loadingExperienceSuggestion, setLoadingExperienceSuggestion] = useState(false);
  const [videoCallLoading, setVideoCallLoading] = useState(false);
  const [matchAgentLoading, setMatchAgentLoading] = useState(false);
  /** proposal_id → local UI stage after opt-in tap */
  const [matchAgentApprovalStage, setMatchAgentApprovalStage] = useState<Record<string, string>>({});
  const [matchBridgeHandled, setMatchBridgeHandled] = useState(false);
  const matchBridgeOnceRef = useRef(false);
  const matchAgentAutoOnceRef = useRef(false);
  const [staleNudgeVisible, setStaleNudgeVisible] = useState(false);
  const [staleNudgeHint, setStaleNudgeHint] = useState<string | null>(null);
  const [showStrategicHost, setShowStrategicHost] = useState(false);
  const [strategicTopics, setStrategicTopics] = useState<StrategicHostTopic[] | null>(null);
  const [strategicLoading, setStrategicLoading] = useState(false);
  const [strategicSelectedTopic, setStrategicSelectedTopic] = useState<StrategicHostTopic | null>(null);
  const [strategicPlanOptions, setStrategicPlanOptions] = useState<PlannerThemePlanOption[] | null>(null);
  const listRef = useRef<FlatList<Message>>(null);
  const inputRef = useRef<TextInput>(null);
  const chatRecordUriRef = useRef<string | null>(null);

  const { context: modeContext } = useModeContext();

  const chatVoiceRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const chatVoiceRecorderState = useAudioRecorderState(chatVoiceRecorder);

  const { messages, loading, error: loadErr, refetch, loadMore, mergeIncomingMessage } = useMessages(convId);

  const [showGifSheet, setShowGifSheet] = useState(false);
  const { typingUserIds, setTyping } = useTypingIndicator(convId, meId);
  const messageIds = useMemo(() => messages.map((m) => m.id), [messages]);
  const reactionsByMessage = useMessageReactions(messageIds);

  const otherUser = useMemo(() => {
    if (!meId) return null;
    return participants.find((p) => p.id !== meId) ?? null;
  }, [participants, meId]);

  const otherPartyLabel = formatName(otherUser) || "Chat";
  const isRomance = conversation?.mode === "romance";
  const accentColor = isRomance ? Colors.romance.primary : Colors.primaryViolet;
  const conversationMode = (conversation?.mode ?? "romance") as Mode;
  const isDm = conversation?.type === "dm";

  const recordDmFirstOutreachIfNeeded = useCallback(
    async (hadMineBeforeSend: boolean) => {
      if (hadMineBeforeSend) return;
      if (!isDm || !otherUser?.id || !conversation) return;
      const m = conversation.mode;
      if (m !== "romance" && m !== "friends" && m !== "business") return;
      await recordPairBehaviorSignal({
        partnerUserId: otherUser.id,
        mode: m,
        kind: "dm_first_outreach",
      });
    },
    [isDm, otherUser?.id, conversation],
  );

  const showChatExperienceCard =
    isDm &&
    !!otherUser &&
    !!conversation &&
    !conversation.related_event_id &&
    ["romance", "friends", "business"].includes(conversationMode) &&
    hasAnyAIAccess(modeContext.subscription_tier ?? "free");

  const showMatchAgentButton =
    isDm &&
    !!otherUser &&
    !!conversation &&
    !conversation.related_event_id &&
    (conversationMode === "romance" || conversationMode === "friends") &&
    hasAnyAIAccess(modeContext.subscription_tier ?? "free");

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      setMeId(data.user?.id ?? null);
      const on = await getReadReceiptsPreference();
      setReadReceiptsOn(on);
    })();
  }, []);

  useEffect(() => {
    if (!meId) return;
    getPlannerInvitationsForUser().then((list) => {
      const map: Record<string, string> = {};
      list.forEach((inv) => {
        map[inv.id] = inv.status;
      });
      setInvitationStatusMap(map);
    });
  }, [meId, messages.length]);

  const fetchChatExperienceSuggestion = useCallback(async () => {
    if (!meId || !otherUser || !showChatExperienceCard || conversationMode === "events") return;
    setLoadingExperienceSuggestion(true);
    setChatExperienceSuggestion(null);
    try {
      const suggestion = await getExperienceSuggestionForChat({
        mode: conversationMode as "romance" | "friends" | "business",
        partnerUserId: otherUser.id,
        myUserId: meId,
      });
      setChatExperienceSuggestion(suggestion ?? null);
    } catch {
      setChatExperienceSuggestion(null);
    } finally {
      setLoadingExperienceSuggestion(false);
    }
  }, [meId, otherUser, showChatExperienceCard, conversationMode]);

  useEffect(() => {
    if (showChatExperienceCard && meId && otherUser) {
      fetchChatExperienceSuggestion();
    } else {
      setChatExperienceSuggestion(null);
    }
  }, [showChatExperienceCard, meId, otherUser?.id, fetchChatExperienceSuggestion]);

  useEffect(() => {
    const fromQuery = matchBridgeParam === "1" || matchBridgeParam === "true";
    const fromMatchDm =
      conversation?.dm_source === "match" && isRomance && isDm && messages.length === 0;
    const wantBridge = fromQuery || fromMatchDm;
    if (!wantBridge) return;
    if (!meId || !otherUser || !isRomance || !isDm) return;
    if (loading) return;
    if (matchBridgeHandled || matchBridgeOnceRef.current) return;
    const already = messages.some((m) => {
      if (m.message_type !== "cta") return false;
      try {
        const p = JSON.parse(m.content) as { type?: string };
        return p.type === "match_bridge";
      } catch {
        return false;
      }
    });
    if (already) {
      setMatchBridgeHandled(true);
      return;
    }
    matchBridgeOnceRef.current = true;
    let cancelled = false;
    (async () => {
      try {
        const bridge = await postMatchBridgeCtaMessage({
          conversationId: convId,
          partnerUserId: otherUser.id,
        });
        if (!cancelled && bridge.ok) mergeIncomingMessage(bridge.inserted);
      } catch {
        matchBridgeOnceRef.current = false;
      } finally {
        if (!cancelled) setMatchBridgeHandled(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    matchBridgeParam,
    conversation?.dm_source,
    meId,
    otherUser?.id,
    isRomance,
    isDm,
    loading,
    messages,
    matchBridgeHandled,
    convId,
    mergeIncomingMessage,
  ]);

  /** Default happy path: after Match Bridge runs (or romance match with no bridge), auto-post Match Agent CTA once. Friends: cold-start connection DM. */
  useEffect(() => {
    if (!meId || !otherUser || !isDm || loading) return;
    if (!hasAnyAIAccess(modeContext.subscription_tier ?? "free")) return;
    if (conversationMode !== "romance" && conversationMode !== "friends") return;

    const hasAgentCta = messages.some((m) => {
      if (m.message_type !== "cta") return false;
      try {
        const p = JSON.parse(m.content) as { type?: string };
        return p.type === "match_agent";
      } catch {
        return false;
      }
    });
    if (hasAgentCta) return;

    const onlyCtasOrEmpty =
      messages.length === 0 || messages.every((m) => m.message_type === "cta");

    if (conversationMode === "romance") {
      if (!isRomance || conversation?.dm_source !== "match") return;
      if (!matchBridgeHandled) return;
      if (!onlyCtasOrEmpty) return;
    } else {
      if (conversation?.dm_source !== "connection") return;
      if (messages.length > 0) return;
    }

    if (matchAgentAutoOnceRef.current) return;
    matchAgentAutoOnceRef.current = true;
    let cancelled = false;
    (async () => {
      setMatchAgentLoading(true);
      try {
        const res = await postMatchAgentCtaMessage({
          conversationId: convId,
          partnerUserId: otherUser.id,
          createdByUserId: meId,
          mode: conversationMode === "romance" ? "romance" : "friends",
        });
        if (!res.ok) matchAgentAutoOnceRef.current = false;
        if (!cancelled && res.ok) mergeIncomingMessage(res.inserted);
      } catch {
        matchAgentAutoOnceRef.current = false;
      } finally {
        if (!cancelled) setMatchAgentLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    meId,
    otherUser?.id,
    isDm,
    loading,
    conversationMode,
    conversation?.dm_source,
    isRomance,
    matchBridgeHandled,
    messages,
    convId,
    mergeIncomingMessage,
    modeContext.subscription_tier,
  ]);

  const openConciergeFromChat = useCallback(() => {
    if (!otherUser) return;
    router.push({
      pathname: "/concierge",
      params: {
        source_screen: "chats",
        mode: conversationMode,
        partner_user_id: otherUser.id,
        partner_display_name: formatName(otherUser),
      },
    });
  }, [otherUser, conversationMode, router]);

  const openStrategicHost = useCallback(async () => {
    if (!meId || !conversation || !participants.length) return;
    if (!["romance", "friends", "business"].includes(conversationMode)) return;
    setShowStrategicHost(true);
    setStrategicLoading(true);
    setStrategicTopics(null);
    setStrategicSelectedTopic(null);
    setStrategicPlanOptions(null);
    try {
      const city =
        (participants.find((p) => p.id === meId)?.city ?? participants.find((p) => p.id !== meId)?.city ?? null) ||
        null;
      const topics = await getChatStrategicHostTopics({
        mode: conversationMode as "romance" | "friends" | "business",
        participantUserIds: participants.map((p) => p.id),
        city: city ?? undefined,
        conversationId: convId,
      });
      setStrategicTopics(topics);
    } catch (e) {
      setStrategicTopics([]);
      Alert.alert("Winkly AI", e instanceof Error ? e.message : "Could not load suggestions");
    } finally {
      setStrategicLoading(false);
    }
  }, [meId, conversation, participants, conversationMode]);

  const loadStructuredPlansForTopic = useCallback(async (topic: StrategicHostTopic) => {
    if (!meId || !conversation) return;
    if (!["romance", "friends", "business"].includes(conversationMode)) return;
    const city =
      (participants.find((p) => p.id === meId)?.city ?? participants.find((p) => p.id !== meId)?.city ?? null) ||
      null;
    setStrategicLoading(true);
    try {
      const dt = new Date(Date.now() + 48 * 3600_000);
      dt.setMinutes(0, 0, 0);
      setStrategicSelectedTopic(topic);
      const plans = await getPlannerThemePlans({
        mode: conversationMode,
        theme: topic.title,
        participantUserIds: participants.map((p) => p.id),
        city: city ?? undefined,
        dateTimeIso: dt.toISOString(),
      });
      setStrategicPlanOptions(plans.slice(0, 2));
    } catch (e) {
      Alert.alert("Winkly AI", e instanceof Error ? e.message : "Could not draft a plan");
    } finally {
      setStrategicLoading(false);
    }
  }, [meId, conversation, conversationMode, participants, convId]);

  const draftPendingPlanFromStructuredOption = useCallback(async (opt: PlannerThemePlanOption) => {
    if (!meId || !conversation) return;
    const city =
      (participants.find((p) => p.id === meId)?.city ?? participants.find((p) => p.id !== meId)?.city ?? null) ||
      null;
    setStrategicLoading(true);
    try {
      const res = await callWinklyPlan({
        context: {
          mode: conversationMode,
          city: city ?? undefined,
          date_from: opt.date_time,
          user_prompt: opt.topic,
          activity_hint: opt.topic,
          participant_user_ids: participants.map((p) => p.id),
          conversation_id: convId,
        },
      });
      const payload = JSON.stringify({
        type: "pending_plan",
        pending_plan_id: res.pending_plan_id,
        plan_options: res.options,
      });
      const inserted = await sendMessage(convId, meId, payload, [], { messageType: "cta" });
      mergeIncomingMessage(inserted);
      setShowStrategicHost(false);
      setStrategicSelectedTopic(null);
      setStrategicPlanOptions(null);
    } catch (e) {
      Alert.alert("Winkly AI", e instanceof Error ? e.message : "Could not draft a pending plan");
    } finally {
      setStrategicLoading(false);
    }
  }, [meId, conversation, conversationMode, participants, convId, mergeIncomingMessage]);

  const openConciergeStaleNudge = useCallback(() => {
    if (!otherUser) return;
    const hint = staleNudgeHint;
    const prefill = hint
      ? `We have not messaged in a while. We share an interest in ${hint}. Suggest a quiet place for a short sync — respect dietary and noise preferences for both of us. Include OpenTable-style discovery, not a confirmed booking.`
      : "We have not messaged in 48+ hours. Suggest a quiet café or coworking spot for a short sync; respect both users' preferences; use calendar-friendly times.";
    router.push({
      pathname: "/concierge",
      params: {
        source_screen: "chats",
        mode: conversationMode,
        partner_user_id: otherUser.id,
        partner_display_name: formatName(otherUser),
        prefill_prompt: prefill,
      },
    });
    setStaleNudgeVisible(false);
  }, [otherUser, conversationMode, router, staleNudgeHint]);

  const onRunMatchAgent = useCallback(async () => {
    if (!meId || !otherUser) return;
    if (conversationMode !== "romance" && conversationMode !== "friends") return;
    setMatchAgentLoading(true);
    try {
      const res = await postMatchAgentCtaMessage({
        conversationId: convId,
        partnerUserId: otherUser.id,
        createdByUserId: meId,
        mode: conversationMode,
      });
      if (!res.ok) {
        Alert.alert("Match Agent", res.error);
        return;
      }
      mergeIncomingMessage(res.inserted);
    } catch (e) {
      Alert.alert("Match Agent", e instanceof Error ? e.message : "Try again");
    } finally {
      setMatchAgentLoading(false);
    }
  }, [meId, otherUser, convId, conversationMode, mergeIncomingMessage]);

  const onMatchAgentApprove = useCallback(async (proposalId: string) => {
    const r = await recordMatchAgentApproval(proposalId);
    if (r.ok) {
      setMatchAgentApprovalStage((prev) => ({
        ...prev,
        [proposalId]: r.stage === "confirmed" ? "confirmed" : "waiting_other",
      }));
      return;
    }
    if (r.error === "ALREADY_FULLY_CONFIRMED") {
      setMatchAgentApprovalStage((prev) => ({ ...prev, [proposalId]: "confirmed" }));
      return;
    }
    if (r.error === "ALREADY_APPROVED") {
      setMatchAgentApprovalStage((prev) => ({ ...prev, [proposalId]: "waiting_other" }));
      return;
    }
    Alert.alert("Could not update", r.error);
  }, []);

  useEffect(() => {
    if (!isDm || !meId || !otherUser || !convId) return;
    if (conversationMode !== "business" && conversationMode !== "friends") return;
    let cancelled = false;
    (async () => {
      const eligible = await isConversationEligibleForStaleNudge(convId);
      if (cancelled || !eligible) {
        if (!cancelled) setStaleNudgeVisible(false);
        return;
      }
      const hint = await getSharedInterestHintForPair(meId, otherUser.id, conversationMode);
      if (!cancelled) {
        setStaleNudgeHint(hint);
        setStaleNudgeVisible(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isDm, meId, otherUser?.id, convId, conversationMode, messages.length]);

  const loadMeta = useCallback(async () => {
    const { data: conv } = await supabase
      .from("conversations")
      .select("id,type,mode,related_event_id,dm_source")
      .eq("id", convId)
      .single();
    setConversation(conv as ConversationRow);

    const { data: cps } = await supabase
      .from("conversation_members")
      .select("user_id")
      .eq("conversation_id", convId)
      .is("left_at", null);
    const ids = (cps ?? []).map((x) => x.user_id).filter(Boolean) as string[];

    if (ids.length > 0) {
      const { data: profs } = await supabase
        .from("user_profiles")
        .select("id,first_name,last_name,city,main_photo_url")
        .in("id", ids);
      setParticipants((profs ?? []) as UserMini[]);
    }

    const { data: settings } = await supabase
      .from("conversation_member_settings")
      .select("muted")
      .eq("conversation_id", convId)
      .eq("user_id", (await supabase.auth.getUser()).data.user?.id ?? "")
      .maybeSingle();
    if (settings) setMuted((settings as { muted?: boolean }).muted ?? false);
  }, [convId]);

  useEffect(() => {
    loadMeta();
  }, [loadMeta]);

  useEffect(() => {
    if (loadErr) setError(loadErr);
  }, [loadErr]);

  const onRealtimeMessage = useCallback(
    (msg: Message) => {
      mergeIncomingMessage(msg);
      if (readReceiptsOn && meId && msg.sender_id !== meId) {
        markMessagesAsRead([msg.id]);
        markConversationRead(convId, msg.created_at);
      }
    },
    [mergeIncomingMessage, readReceiptsOn, meId, convId]
  );

  useMessageSubscription(convId, onRealtimeMessage);

  useEffect(() => {
    if (!readReceiptsOn || !meId) return;
    const unread = messages.filter((m) => m.sender_id !== meId);
    if (unread.length === 0) return;
    const ids = unread.slice(-20).map((m) => m.id);
    markMessagesAsRead(ids);
    const last = unread[unread.length - 1];
    if (last) markConversationRead(convId, last.created_at);
  }, [convId, meId, messages, readReceiptsOn]);

  const handleSend = useCallback(
    async (attachments: MessageAttachment[] = [], replyToId?: string | null) => {
      const content = draft.trim();
      if ((!content && attachments.length === 0) || sending) return;
      if (!meId) return;

      const hadMineBeforeSend = messages.some((m) => m.sender_id === meId);
      setSending(true);
      setError(null);
      try {
        const inserted = await sendMessage(convId, meId, content, attachments, {
          replyToId: replyToId ?? replyTo?.id ?? null,
        });
        mergeIncomingMessage(inserted);
        void recordDmFirstOutreachIfNeeded(hadMineBeforeSend);
        setDraft("");
        setReplyTo(null);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Failed to send");
      } finally {
        setSending(false);
      }
    },
    [convId, meId, draft, replyTo, sending, mergeIncomingMessage, messages, recordDmFirstOutreachIfNeeded]
  );

  const onSendText = useCallback(() => {
    handleSend([], replyTo?.id);
  }, [handleSend, replyTo]);

  const onSendImages = useCallback(async () => {
    if (!meId) return;
    const attachments = await pickImages(meId);
    if (attachments.length > 0) {
      await handleSend(attachments, replyTo?.id);
    }
  }, [meId, handleSend, replyTo]);

  const onToggleVoiceNote = useCallback(async () => {
    if (!meId || !convId || sending) return;
    if (chatVoiceRecorderState.isRecording) {
      const durMs = chatVoiceRecorderState.durationMillis ?? 0;
      const hadMineBeforeSend = messages.some((m) => m.sender_id === meId);
      try {
        await chatVoiceRecorder.stop();
        const uri = chatVoiceRecorder.uri ?? chatRecordUriRef.current;
        chatRecordUriRef.current = uri ?? null;
        if (durMs > (MAX_VOICE_SECONDS + 1) * 1000) {
          Alert.alert("Voice message", `Please keep voice messages under ${MAX_VOICE_SECONDS} seconds.`);
          return;
        }
        if (!uri) return;
        setSending(true);
        const att = await uploadChatVoiceFromUri(meId, uri);
        if (!att) {
          setSending(false);
          return;
        }
        const inserted = await sendMessage(convId, meId, " ", [att], { replyToId: replyTo?.id ?? null });
        mergeIncomingMessage(inserted);
        void recordDmFirstOutreachIfNeeded(hadMineBeforeSend);
        setReplyTo(null);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Voice send failed");
      } finally {
        setSending(false);
      }
      return;
    }
    const perm = await AudioModule.requestRecordingPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Microphone", "Permission is required to record a voice message.");
      return;
    }
    chatRecordUriRef.current = null;
    await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true });
    await chatVoiceRecorder.prepareToRecordAsync();
    chatVoiceRecorder.record();
  }, [
    meId,
    convId,
    sending,
    chatVoiceRecorderState.isRecording,
    chatVoiceRecorderState.durationMillis,
    messages,
    recordDmFirstOutreachIfNeeded,
    chatVoiceRecorder,
    replyTo?.id,
    mergeIncomingMessage,
  ]);

  const onAddReaction = useCallback(
    async (messageId: string, emoji: string) => {
      try {
        await addReaction(messageId, emoji);
        refetch();
      } catch {
        // ignore
      }
    },
    [refetch]
  );

  const onRemoveReaction = useCallback(
    async (messageId: string, emoji: string) => {
      try {
        await removeReaction(messageId, emoji);
        refetch();
      } catch {
        // ignore
      }
    },
    [refetch]
  );

  const DELETE_FOR_EVERYONE_WINDOW_MIN = 15;

  const onDeleteForSelf = useCallback(
    async (messageId: string) => {
      Alert.alert("Delete message", "Remove this message for you only?", [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete for me",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteMessageForSelf(messageId);
              refetch();
            } catch {
              setError("Could not delete");
            }
          },
        },
      ]);
    },
    [refetch]
  );

  const onDeleteForEveryone = useCallback(
    async (messageId: string, createdAt: string) => {
      const ageMs = Date.now() - new Date(createdAt).getTime();
      if (ageMs > DELETE_FOR_EVERYONE_WINDOW_MIN * 60 * 1000) {
        Alert.alert(
          "Delete for everyone",
          `You can only delete for everyone within ${DELETE_FOR_EVERYONE_WINDOW_MIN} minutes. Use "Delete for me" instead.`
        );
        return;
      }
      Alert.alert(
        "Delete for everyone?",
        "This will remove the message for both of you. This cannot be undone.",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Delete",
            style: "destructive",
            onPress: async () => {
              try {
                const ok = await deleteMessageForEveryone(messageId);
                if (ok) refetch();
                else setError("Could not delete");
              } catch {
                setError("Could not delete");
              }
            },
          },
        ]
      );
    },
    [refetch]
  );

  const toggleReadReceipts = useCallback(async () => {
    const next = !readReceiptsOn;
    await setReadReceiptsPreference(next);
    setReadReceiptsOn(next);
  }, [readReceiptsOn]);

  const handleMute = useCallback(async () => {
    try {
      await setConversationMuted(convId, !muted);
      setMuted(!muted);
      setShowMenu(false);
    } catch {
      setError("Could not update mute");
    }
  }, [convId, muted]);

  const handleBlock = useCallback(() => {
    if (!otherUser) return;
    Alert.alert("Block user", `Block ${formatName(otherUser)}? You won't see their messages.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Block",
        style: "destructive",
        onPress: async () => {
          try {
            await blockUser(otherUser.id);
            router.back();
          } catch {
            setError("Could not block");
          }
        },
      },
    ]);
    setShowMenu(false);
  }, [otherUser, router]);

  const handleReportMessage = useCallback(
    (messageId: string) => {
      Alert.alert("Report message", "Select a reason:", [
        ...REPORT_REASONS.map((r) => ({
          text: r.label,
          onPress: async () => {
            try {
              await reportMessage(messageId, r.key, "User reported");
              refetch();
            } catch {
              setError("Could not report");
            }
          },
        })),
        { text: "Cancel", style: "cancel" },
      ]);
      setShowMenu(false);
    },
    [refetch]
  );

  const onSendIcebreaker = useCallback(async () => {
    if (!convId) return;
    if (!meId) return;
    const hadMineBeforeSend = messages.some((m) => m.sender_id === meId);
    try {
      setSending(true);
      const prompt = pickRandomIcebreaker();
      const inserted = await sendMessage(convId, meId, buildIcebreakerPayload(prompt), [], {
        messageType: "icebreaker",
      });
      mergeIncomingMessage(inserted);
      void recordDmFirstOutreachIfNeeded(hadMineBeforeSend);
    } catch {
      setError("Could not send icebreaker");
    } finally {
      setSending(false);
    }
  }, [convId, meId, messages, mergeIncomingMessage, recordDmFirstOutreachIfNeeded]);

  const onVideoCall = useCallback(async () => {
    if (!convId) return;
    setVideoCallLoading(true);
    try {
      const session = await startVideoCallForConversation(convId);
      await openVideoCallRoom(session);
    } catch (e) {
      Alert.alert("Video call", e instanceof Error ? e.message : "Could not start call");
    } finally {
      setVideoCallLoading(false);
    }
  }, [convId]);

  const onConfirmMatchBridge = useCallback(
    async (p: {
      title: string;
      place: string | null;
      location: string | null;
      starts_at: string;
      ends_at: string | null;
      activity_theme?: string;
    }) => {
      if (!meId || !otherUser || !convId) return;
      if (!p.starts_at || typeof p.starts_at !== "string") {
        Alert.alert("Missing time", "This suggestion could not be confirmed. Try inviting from the menu instead.");
        return;
      }
      try {
        const inviteTitle = p.place?.trim()
          ? `${p.activity_theme === "coffee" ? "Coffee" : "Date"} at ${p.place.trim()}`
          : p.title;
        const { planner_item_id, planner_invitation_id } = await createPlannerInvite(meId, otherUser.id, convId, {
          title: inviteTitle,
          source_mode: "romance",
          starts_at: p.starts_at,
          ends_at: p.ends_at ?? undefined,
          activity: p.activity_theme ?? "Date",
          location: p.location || undefined,
          place: p.place || undefined,
        });
        const ctaPayload = JSON.stringify({
          type: "planner_invite",
          planner_item_id,
          planner_invitation_id,
          title: inviteTitle,
          activity: p.activity_theme ?? "Date",
          location: p.location,
          place: p.place,
          starts_at: p.starts_at,
          ends_at: p.ends_at,
          source_mode: "romance",
        });
        const inserted = await sendMessage(convId, meId, ctaPayload, [], { messageType: "cta" });
        mergeIncomingMessage(inserted);
        setInvitationStatusMap((prev) => ({ ...prev, [planner_invitation_id]: "pending" }));
      } catch (e) {
        Alert.alert("Could not create invite", e instanceof Error ? e.message : "Try again");
      }
    },
    [meId, otherUser, convId, mergeIncomingMessage]
  );

  const renderMessage = useCallback(
    ({ item }: { item: Message }) => {
      let isCenteredCta = false;
      if (item.message_type === "cta") {
        try {
          const parsed = JSON.parse(item.content) as { type?: string };
          if (parsed.type === "match_bridge" || parsed.type === "match_agent") isCenteredCta = true;
        } catch {
          // ignore
        }
      }
      const mine = meId && item.sender_id === meId;
      const deletedForMe = item.delete_type === "for_me" && mine;
      const deletedForEveryone = item.delete_type === "for_everyone";
      const reactions = reactionsByMessage[item.id] ?? [];

      return (
        <View
          style={{
            alignSelf: isCenteredCta ? "center" : mine ? "flex-end" : "flex-start",
            maxWidth: isCenteredCta ? "96%" : "84%",
            marginBottom: 8,
          }}
        >
          {deletedForMe ? (
            <View
              style={{
                paddingVertical: 8,
                paddingHorizontal: 12,
                borderRadius: 14,
                backgroundColor: Colors.gray100,
              }}
            >
              <Text style={{ fontSize: 13, color: Colors.gray600, fontStyle: "italic" }}>
                You deleted this message
              </Text>
            </View>
          ) : deletedForEveryone ? (
            <View
              style={{
                paddingVertical: 8,
                paddingHorizontal: 12,
                borderRadius: 14,
                backgroundColor: Colors.gray100,
              }}
            >
              <Text style={{ fontSize: 13, color: Colors.gray600, fontStyle: "italic" }}>
                This message was deleted
              </Text>
            </View>
          ) : (
            <>
              {item.message_type === "cta" ? (() => {
                try {
                  const p = JSON.parse(item.content);
                  if (p.type === "match_bridge") {
                    const accent = Colors.romance.primary;
                    return (
                      <View
                        style={{
                          padding: 14,
                          borderRadius: 14,
                          borderWidth: 1,
                          borderColor: accent + "55",
                          backgroundColor: accent + "10",
                          minWidth: 240,
                        }}
                      >
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8 }}>
                          <SparklesIcon size={16} color={accent} />
                          <Text style={{ fontSize: 12, fontWeight: "800", color: accent }}>AI Bridge</Text>
                        </View>
                        <Text style={{ fontSize: 15, lineHeight: 22, marginBottom: 8 }}>{p.bridge_message}</Text>
                        {p.disclaimer ? (
                          <Text style={{ fontSize: 11, color: Colors.gray600, marginBottom: 10 }}>{p.disclaimer}</Text>
                        ) : null}
                        <Pressable
                          onPress={() => {
                            onConfirmMatchBridge({
                              title: typeof p.title === "string" ? p.title : "Date",
                              place: typeof p.place === "string" ? p.place : null,
                              location: typeof p.location === "string" ? p.location : null,
                              starts_at: p.starts_at,
                              ends_at: typeof p.ends_at === "string" ? p.ends_at : null,
                              activity_theme: typeof p.activity_theme === "string" ? p.activity_theme : undefined,
                            });
                          }}
                          style={{
                            paddingVertical: 10,
                            alignItems: "center",
                            backgroundColor: accent,
                            borderRadius: 10,
                          }}
                        >
                          <Text style={{ fontSize: 14, fontWeight: "700", color: Colors.accentYellow }}>Tap to confirm</Text>
                        </Pressable>
                      </View>
                    );
                  }
                  if (p.type === "match_agent") {
                    const pma = p as MatchAgentCtaPayload;
                    const accentMa =
                      conversationMode === "romance"
                        ? Colors.romance.primary
                        : conversationMode === "friends"
                          ? Colors.friends.primary
                          : Colors.primaryViolet;
                    const proposalId =
                      typeof pma.proposal_id === "string" && pma.proposal_id.length > 0 ? pma.proposal_id : null;
                    const stage = proposalId ? matchAgentApprovalStage[proposalId] : undefined;
                    const draft = pma.draft;
                    const venue =
                      draft && typeof draft.venue_name === "string" ? draft.venue_name : null;
                    const timeCap =
                      draft && typeof draft.proposed_time_caption === "string"
                        ? draft.proposed_time_caption
                        : null;
                    const privacyLine =
                      pma.privacy && typeof pma.privacy.double_opt_in === "string"
                        ? pma.privacy.double_opt_in
                        : null;
                    return (
                      <View
                        style={{
                          padding: 14,
                          borderRadius: 14,
                          borderWidth: 1,
                          borderColor: accentMa + "55",
                          backgroundColor: accentMa + "10",
                          minWidth: 240,
                        }}
                      >
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8 }}>
                          <SparklesIcon size={16} color={accentMa} />
                          <Text style={{ fontSize: 12, fontWeight: "800", color: accentMa }}>Match Agent</Text>
                        </View>
                        <Text style={{ fontSize: 15, lineHeight: 22, marginBottom: 8 }}>{pma.agent_message}</Text>
                        {venue ? (
                          <Text style={{ fontSize: 13, color: Colors.gray700, marginBottom: 4 }}>
                            {venue}
                            {timeCap ? ` · ${timeCap}` : ""}
                          </Text>
                        ) : null}
                        {privacyLine ? (
                          <Text style={{ fontSize: 11, color: Colors.gray600, marginBottom: 10 }}>{privacyLine}</Text>
                        ) : null}
                        {proposalId && stage === "confirmed" ? (
                          <Text style={{ fontSize: 13, fontWeight: "600", color: Colors.successGreen }}>
                            Both confirmed — plan saved in Winkly.
                          </Text>
                        ) : null}
                        {proposalId && stage === "waiting_other" ? (
                          <Text style={{ fontSize: 13, color: Colors.gray600, textAlign: "center" }}>
                            Waiting for the other person to confirm.
                          </Text>
                        ) : null}
                        {proposalId && !stage ? (
                          <Pressable
                            onPress={() => onMatchAgentApprove(proposalId)}
                            style={{
                              paddingVertical: 10,
                              alignItems: "center",
                              backgroundColor: accentMa,
                              borderRadius: 10,
                            }}
                          >
                            <Text style={{ fontSize: 14, fontWeight: "700", color: Colors.accentYellow }}>I&apos;m in</Text>
                          </Pressable>
                        ) : null}
                        {!proposalId ? (
                          <Text style={{ fontSize: 11, color: Colors.gray600, marginTop: 4 }}>
                            Draft only — run the flow again after migration if proposals are not saving.
                          </Text>
                        ) : null}
                      </View>
                    );
                  }
                  if (p.type === "pending_plan") {
                    const pendingPlanId = typeof p.pending_plan_id === "string" ? p.pending_plan_id : null;
                    const status = pendingPlanId ? pendingPlanStatusMap[pendingPlanId] : undefined;
                    const imInvitee = !mine;
                    const dateStr =
                      typeof p.date_time === "string" && p.date_time
                        ? new Date(p.date_time).toLocaleString(undefined, {
                            weekday: "short",
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : "";
                    const loc = p.location_details?.name
                      ? String(p.location_details.name)
                      : p.location_details?.address
                        ? String(p.location_details.address)
                        : "";
                    return (
                      <View
                        style={{
                          padding: 14,
                          borderRadius: 14,
                          borderWidth: 1,
                          borderColor: Colors.primaryViolet + "55",
                          backgroundColor: Colors.primaryViolet + "0A",
                          minWidth: 240,
                        }}
                      >
                        <Text style={{ fontSize: 12, fontWeight: "800", color: Colors.primaryViolet, marginBottom: 6 }}>
                          Winkly plan (needs confirmation)
                        </Text>
                        <Text style={{ fontWeight: "700", fontSize: 15, marginBottom: 4 }}>
                          {String(p.topic ?? "Plan")}
                        </Text>
                        {dateStr ? <Text style={{ fontSize: 13, color: Colors.gray700, marginBottom: 2 }}>{dateStr}</Text> : null}
                        {loc ? <Text style={{ fontSize: 13, color: Colors.gray600, marginBottom: 10 }}>{loc}</Text> : null}

                        {pendingPlanId && imInvitee && status !== "confirmed" ? (
                          <Pressable
                            onPress={() => {
                              setPendingPlanStatusMap((prev) => ({ ...prev, [pendingPlanId]: "confirming" }));
                              confirmPendingPlan(pendingPlanId)
                                .then((r) => {
                                  setPendingPlanStatusMap((prev) => ({
                                    ...prev,
                                    [pendingPlanId]: r.all_participants_confirmed ? "confirmed" : "waiting_other",
                                  }));
                                })
                                .catch((e) => {
                                  setPendingPlanStatusMap((prev) => ({ ...prev, [pendingPlanId]: "error" }));
                                  Alert.alert("Couldn't confirm", (e as Error)?.message ?? "Please try again.");
                                });
                            }}
                            style={{
                              paddingVertical: 10,
                              alignItems: "center",
                              backgroundColor:
                                status === "confirming" ? Colors.gray200 : Colors.primaryViolet,
                              borderRadius: 10,
                            }}
                          >
                            <Text style={{ fontSize: 14, fontWeight: "700", color: Colors.white }}>
                              {status === "confirming" ? "Confirming..." : "Confirm"}
                            </Text>
                          </Pressable>
                        ) : null}
                        {pendingPlanId && imInvitee && status === "waiting_other" ? (
                          <Text style={{ fontSize: 12, color: Colors.gray600, marginTop: 8, textAlign: "center" }}>
                            Confirmed — waiting for the other person.
                          </Text>
                        ) : null}
                        {pendingPlanId && status === "confirmed" ? (
                          <Text style={{ fontSize: 12, color: Colors.successGreen, marginTop: 8, textAlign: "center" }}>
                            Both confirmed — saved in Planner.
                          </Text>
                        ) : null}
                      </View>
                    );
                  }
                  if (p.type === "planner_invite") {
                    const status = invitationStatusMap[p.planner_invitation_id];
                    const imInvitee = !mine;
                    const dateStr = p.starts_at
                      ? new Date(p.starts_at).toLocaleString(undefined, {
                          weekday: "short",
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : "";
                    const locationLine =
                      [p.place, p.location ? fmtLocationLine(String(p.location)) : ""].filter(Boolean).join(" • ") || null;
                    return (
                      <View
                        style={{
                          padding: 14,
                          borderRadius: 14,
                          borderWidth: 1,
                          borderColor: accentColor + "50",
                          backgroundColor: accentColor + "08",
                          minWidth: 220,
                        }}
                      >
                        <Text style={{ fontWeight: "600", fontSize: 15, marginBottom: 4 }}>{p.title}</Text>
                        {dateStr ? (
                          <Text style={{ fontSize: 13, color: Colors.gray700, marginBottom: 2 }}>{dateStr}</Text>
                        ) : null}
                        {locationLine ? (
                          <Text style={{ fontSize: 13, color: Colors.gray600, marginBottom: 10 }}>{locationLine}</Text>
                        ) : null}
                        {imInvitee && status === "pending" && (
                          <View style={{ flexDirection: "row", gap: 8, marginTop: 4 }}>
                            <Pressable
                              onPress={() => {
                                declinePlannerInvite(p.planner_invitation_id).then(() => {
                                  setInvitationStatusMap((prev) => ({ ...prev, [p.planner_invitation_id]: "declined" }));
                                  refetch();
                                });
                              }}
                              style={{ flex: 1, paddingVertical: 8, alignItems: "center", backgroundColor: Colors.gray100, borderRadius: 10 }}
                            >
                              <Text style={{ fontSize: 13, fontWeight: "600" }}>Decline</Text>
                            </Pressable>
                            <Pressable
                              onPress={() => {
                                reschedulePlannerInvite(p.planner_invitation_id).then(() => {
                                  setInvitationStatusMap((prev) => ({ ...prev, [p.planner_invitation_id]: "reschedule" }));
                                  refetch();
                                });
                              }}
                              style={{ flex: 1, paddingVertical: 8, alignItems: "center", backgroundColor: Colors.gray100, borderRadius: 10 }}
                            >
                              <Text style={{ fontSize: 13, fontWeight: "600" }}>Reschedule</Text>
                            </Pressable>
                            <Pressable
                              onPress={() => {
                                acceptPlannerInvite(p.planner_invitation_id).then(() => {
                                  setInvitationStatusMap((prev) => ({ ...prev, [p.planner_invitation_id]: "accepted" }));
                                  refetch();
                                });
                              }}
                              style={{ flex: 1, paddingVertical: 8, alignItems: "center", backgroundColor: accentColor, borderRadius: 10 }}
                            >
                              <Text style={{ fontSize: 13, fontWeight: "600", color: Colors.accentYellow }}>Accept</Text>
                            </Pressable>
                          </View>
                        )}
                        {imInvitee && status === "accepted" && (
                          <Text style={{ fontSize: 12, color: Colors.successGreen, marginTop: 4 }}>You accepted</Text>
                        )}
                        {imInvitee && status === "declined" && (
                          <Text style={{ fontSize: 12, color: Colors.gray600, marginTop: 4 }}>You declined</Text>
                        )}
                        {imInvitee && status === "reschedule" && (
                          <Text style={{ fontSize: 12, color: Colors.gray600, marginTop: 4 }}>You asked to reschedule</Text>
                        )}
                      </View>
                    );
                  }
                } catch {}
                return (
                  <View style={{ paddingVertical: 8, paddingHorizontal: 12, borderRadius: 14, backgroundColor: Colors.gray100 }}>
                    <Text style={{ fontSize: 15 }}>{item.content}</Text>
                  </View>
                );
              })() : null}

              {item.message_type === "icebreaker" ? (() => {
                try {
                  const p = JSON.parse(item.content);
                  const prompt = typeof p.prompt === "string" ? p.prompt : item.content;
                  return (
                    <View
                      style={{
                        padding: 14,
                        borderRadius: 14,
                        borderWidth: 1,
                        borderColor: Colors.primaryViolet + "55",
                        backgroundColor: Colors.primaryViolet + "12",
                        maxWidth: 300,
                      }}
                    >
                      <Text style={{ fontSize: 11, fontWeight: "800", color: Colors.primaryViolet, marginBottom: 6 }}>
                        Icebreaker
                      </Text>
                      <Text style={{ fontSize: 15, lineHeight: 22 }}>{prompt}</Text>
                    </View>
                  );
                } catch {
                  return (
                    <View style={{ paddingVertical: 8, paddingHorizontal: 12, borderRadius: 14, backgroundColor: Colors.gray100 }}>
                      <Text style={{ fontSize: 15 }}>{item.content}</Text>
                    </View>
                  );
                }
              })() : null}

              {item.message_type !== "cta" && item.message_type !== "icebreaker" && item.reply_to_id ? (
                <View
                  style={{
                    marginBottom: 4,
                    paddingVertical: 4,
                    paddingHorizontal: 8,
                    borderRadius: 8,
                    backgroundColor: "rgba(0,0,0,0.05)",
                    borderLeftWidth: 3,
                    borderLeftColor: accentColor,
                  }}
                >
                  <Text numberOfLines={1} style={{ fontSize: 12, color: Colors.gray600 }}>
                    Reply to message
                  </Text>
                </View>
              ) : null}

              {item.message_type !== "cta" && item.message_type !== "icebreaker" && item.message_type === "audio" ? (
                item.attachments?.[0]?.url ? (
                  <VoiceMessageBubble
                    audioUrl={item.attachments[0].url}
                    mine={!!mine}
                    accentColor={accentColor}
                  />
                ) : (
                  <Text style={{ fontSize: 13, color: Colors.gray600 }}>Voice message unavailable</Text>
                )
              ) : item.message_type !== "cta" && item.message_type !== "icebreaker" && (item.message_type === "image" || item.message_type === "gif") ? (
                <View style={{ borderRadius: 14, overflow: "hidden" }}>
                  <Image
                    source={{ uri: (item.attachments?.[0]?.url ?? item.content) || "" }}
                    style={{ width: 200, height: 200, borderRadius: 14 }}
                    resizeMode="cover"
                  />
                  {item.content?.trim() ? (
                    <Text style={{ padding: 8, fontSize: 15 }}>{item.content}</Text>
                  ) : null}
                </View>
              ) : item.message_type !== "cta" && item.message_type !== "icebreaker" ? (
                <View
                  style={{
                    paddingVertical: 8,
                    paddingHorizontal: 12,
                    borderRadius: 14,
                    borderWidth: 1,
                    borderColor: mine ? accentColor + "40" : Colors.gray200,
                    backgroundColor: mine ? accentColor + "12" : Colors.backgroundLight,
                  }}
                >
                  <Text style={{ fontSize: 15 }}>{item.content}</Text>
                </View>
              ) : null}

              <View style={{ flexDirection: "row", alignItems: "center", marginTop: 4, gap: 8 }}>
                <Text style={{ fontSize: 11, color: Colors.gray500 }}>
                  {new Date(item.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </Text>
                {reactions.length > 0 && (
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 4 }}>
                    {Array.from(
                      new Map(reactions.map((r) => [r.emoji, reactions.filter((x) => x.emoji === r.emoji).length])).entries()
                    ).map(([emoji, count]) => (
                      <Pressable
                        key={emoji}
                        onPress={() => {
                          const mineReacted = reactions.some((r) => r.emoji === emoji && r.user_id === meId);
                          if (mineReacted) onRemoveReaction(item.id, emoji);
                          else onAddReaction(item.id, emoji);
                        }}
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          paddingHorizontal: 6,
                          paddingVertical: 2,
                          borderRadius: 12,
                          backgroundColor: Colors.gray100,
                        }}
                      >
                        <Text>{emoji}</Text>
                        {count > 1 && <Text style={{ fontSize: 10, marginLeft: 2 }}>{count}</Text>}
                      </Pressable>
                    ))}
                  </View>
                )}
              </View>

              <View style={{ flexDirection: "row", marginTop: 4, gap: 8 }}>
                <Pressable
                  onPress={() => setReplyTo(item)}
                  style={{ padding: 4 }}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons name="arrow-undo-outline" size={16} color={Colors.gray600} />
                </Pressable>
                {mine && (
                  <Pressable
                    onPress={() => {
                      Alert.alert("Delete message", "Choose an option:", [
                        { text: "Cancel", style: "cancel" },
                        {
                          text: "Delete for me",
                          onPress: () => onDeleteForSelf(item.id),
                        },
                        {
                          text: "Delete for everyone",
                          onPress: () => onDeleteForEveryone(item.id, item.created_at),
                        },
                      ]);
                    }}
                    style={{ padding: 4 }}
                    hitSlop={8}
                  >
                    <Ionicons name="trash-outline" size={16} color={Colors.gray600} />
                  </Pressable>
                )}
                {!mine && (
                  <Pressable onPress={() => handleReportMessage(item.id)} style={{ padding: 4 }} hitSlop={8}>
                    <Ionicons name="flag-outline" size={16} color={Colors.gray600} />
                  </Pressable>
                )}
                <View style={{ flexDirection: "row", gap: 4 }}>
                  {QUICK_REACTIONS.map((emoji) => (
                    <Pressable key={emoji} onPress={() => onAddReaction(item.id, emoji)}>
                      <Text style={{ fontSize: 14 }}>{emoji}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            </>
          )}
        </View>
      );
    },
    [
      meId,
      accentColor,
      reactionsByMessage,
      invitationStatusMap,
      pendingPlanStatusMap,
      refetch,
      onAddReaction,
      onRemoveReaction,
      onDeleteForSelf,
      onDeleteForEveryone,
      handleReportMessage,
      onConfirmMatchBridge,
      fmtLocationLine,
      conversationMode,
      matchAgentApprovalStage,
      onMatchAgentApprove,
    ]
  );

  if (loading) {
    return (
      <SafeScreenView style={{ flex: 1, padding: 16, justifyContent: "center" }}>
        <ActivityIndicator />
        <Text style={{ textAlign: "center", marginTop: 8 }}>Loading chat…</Text>
      </SafeScreenView>
    );
  }

  return (
    <SafeScreenView style={{ flex: 1 }}>
      {/* Header */}
      <View
        style={{
          paddingHorizontal: 14,
          paddingVertical: 10,
          borderBottomWidth: 1,
          borderBottomColor: Colors.gray200,
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
        }}
      >
        <Pressable
          onPress={() => router.back()}
          style={{
            width: 44,
            height: 44,
            borderRadius: 22,
            backgroundColor: Colors.gray100,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Ionicons name="arrow-back" size={24} color={Colors.textPrimary} />
        </Pressable>

        <Pressable
          style={{ flex: 1 }}
          onPress={() => {
            if (isDm && otherUser && conversation?.mode) {
              const mode = conversation.mode as "romance" | "friends" | "business";
              if (mode === "romance") router.push(`/(modes)/romance/profile-view?id=${otherUser.id}`);
              else router.push(`/(modes)/${mode}/profile-view?user_id=${otherUser.id}`);
            }
          }}
        >
          <Text style={{ fontWeight: "900", fontSize: 16 }} numberOfLines={1}>{otherPartyLabel}</Text>
          <Text style={{ opacity: 0.65, fontSize: 12 }}>
            {typingUserIds.size > 0 ? "typing…" : conversation ? `${conversation.mode} • direct` : ""}
          </Text>
        </Pressable>

        <Pressable
          onPress={() => setShowMenu(!showMenu)}
          style={{
            width: 44,
            height: 44,
            borderRadius: 22,
            backgroundColor: Colors.gray100,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Ionicons name="ellipsis-vertical" size={24} color={Colors.textPrimary} />
        </Pressable>
      </View>

      {staleNudgeVisible && isDm && (conversationMode === "business" || conversationMode === "friends") ? (
        <View
          style={{
            marginHorizontal: 14,
            marginTop: 8,
            padding: 12,
            borderRadius: 12,
            backgroundColor: Colors.primaryViolet + "14",
            borderWidth: 1,
            borderColor: Colors.primaryViolet + "44",
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <SparklesIcon size={18} color={Colors.primaryViolet} />
            <Text style={{ fontWeight: "800", fontSize: 13, color: Colors.primaryViolet }}>Concierge nudge</Text>
          </View>
          <Text style={{ fontSize: 14, color: Colors.textPrimary, marginBottom: 10, lineHeight: 20 }}>
            {staleNudgeHint
              ? `You have not messaged in a while — you both care about ${staleNudgeHint}. Want Winkly to suggest a spot for a quick sync?`
              : "It has been quiet here — want Winkly to suggest a time and place that fits both of you?"}
          </Text>
          <View style={{ flexDirection: "row", gap: 10 }}>
            <Pressable
              onPress={() => {
                openConciergeStaleNudge();
              }}
              style={{
                flex: 1,
                paddingVertical: 10,
                alignItems: "center",
                backgroundColor: Colors.primaryViolet,
                borderRadius: 10,
              }}
            >
              <Text style={{ fontWeight: "700", color: Colors.accentYellow }}>Find a spot</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                dismissStaleConciergeNudge(convId).then(() => setStaleNudgeVisible(false)).catch(() => {});
              }}
              style={{
                paddingVertical: 10,
                paddingHorizontal: 14,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: Colors.gray100,
                borderRadius: 10,
              }}
            >
              <Text style={{ fontWeight: "600", color: Colors.gray700 }}>Later</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {showMenu && (
        <View
          style={{
            position: "absolute",
            top: 70,
            right: 14,
            backgroundColor: Colors.backgroundLight,
            borderRadius: 12,
            padding: 8,
            shadowColor: "#000",
            shadowOpacity: 0.15,
            shadowRadius: 8,
            elevation: 8,
            zIndex: 100,
            minWidth: 180,
          }}
        >
          <Pressable onPress={toggleReadReceipts} style={{ padding: 12, flexDirection: "row", alignItems: "center" }}>
            <Ionicons name={readReceiptsOn ? "checkmark-circle" : "checkmark-circle-outline"} size={20} color={Colors.textPrimary} />
            <Text style={{ marginLeft: 8 }}>Read receipts {readReceiptsOn ? "On" : "Off"}</Text>
          </Pressable>
          {isDm && otherUser && (
            <Pressable
              onPress={() => { setShowMenu(false); setShowInviteModal(true); }}
              style={{ padding: 12, flexDirection: "row", alignItems: "center" }}
            >
              <Ionicons name="calendar-outline" size={20} color={Colors.primaryViolet} />
              <Text style={{ marginLeft: 8, color: Colors.primaryViolet }}>
                {conversationMode === "romance" ? "Invite on date" : conversationMode === "friends" ? "Invite to meet-up" : conversationMode === "business" ? "Suggest meeting" : "Invite to meet"}
              </Text>
            </Pressable>
          )}
          <Pressable onPress={handleMute} style={{ padding: 12, flexDirection: "row", alignItems: "center" }}>
            <Ionicons name={muted ? "notifications-off" : "notifications-outline"} size={20} color={Colors.textPrimary} />
            <Text style={{ marginLeft: 8 }}>{muted ? "Unmute chat" : "Mute chat"}</Text>
          </Pressable>
          <Pressable onPress={handleBlock} style={{ padding: 12, flexDirection: "row", alignItems: "center" }}>
            <Ionicons name="remove-circle-outline" size={20} color={Colors.errorRed} />
            <Text style={{ marginLeft: 8, color: Colors.errorRed }}>Block user</Text>
          </Pressable>
          <Pressable onPress={() => setShowMenu(false)} style={{ padding: 12 }}>
            <Text style={{ color: Colors.gray600 }}>Close</Text>
          </Pressable>
        </View>
      )}

      <InviteToPlanModal
        visible={showInviteModal}
        mode={conversationMode}
        onClose={() => setShowInviteModal(false)}
        partnerUserId={otherUser?.id}
        partnerDisplayName={otherUser ? formatName(otherUser) : undefined}
        onSubmit={async (values: InviteFormValues) => {
          if (!meId || !otherUser) throw new Error("Missing user");
          const title = values.place.trim() ? `${values.activity} at ${values.place.trim()}` : values.activity;
          const startsAtIso = values.starts_at.toISOString();
          const { planner_item_id, planner_invitation_id } = await createPlannerInvite(
            meId,
            otherUser.id,
            convId,
            {
              title,
              source_mode: conversationMode,
              starts_at: startsAtIso,
              ends_at: values.ends_at ? values.ends_at.toISOString() : undefined,
              activity: values.activity,
              location: values.location || undefined,
              place: values.place || undefined,
            }
          );
          const ctaPayload = JSON.stringify({
            type: "planner_invite",
            planner_item_id,
            planner_invitation_id,
            title,
            activity: values.activity,
            location: values.location || null,
            place: values.place || null,
            starts_at: startsAtIso,
            ends_at: values.ends_at ? values.ends_at.toISOString() : null,
            source_mode: conversationMode,
          });
          const insertedPlan = await sendMessage(convId, meId, ctaPayload, [], { messageType: "cta" });
          mergeIncomingMessage(insertedPlan);
          setInvitationStatusMap((prev) => ({ ...prev, [planner_invitation_id]: "pending" }));
        }}
      />

      <GifUrlSheet
        visible={showGifSheet}
        onClose={() => setShowGifSheet(false)}
        onAttach={async (gifUrl) => {
          if (!meId) return;
          try {
            setSending(true);
            const insertedGif = await sendMessage(convId, meId, " ", [{ type: "gif", url: gifUrl }], {
              replyToId: replyTo?.id ?? null,
            });
            mergeIncomingMessage(insertedGif);
            setReplyTo(null);
          } catch (e: unknown) {
            setError(e instanceof Error ? e.message : "Could not send GIF");
          } finally {
            setSending(false);
          }
        }}
      />

      <Modal visible={showStrategicHost} transparent animationType="fade">
        <Pressable
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "center", padding: 18 }}
          onPress={() => setShowStrategicHost(false)}
        >
          <Pressable
            onPress={(e) => e.stopPropagation()}
            style={{
              backgroundColor: Colors.white,
              borderRadius: 18,
              padding: 16,
              maxHeight: "80%",
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <SparklesIcon size={18} color={Colors.primaryViolet} />
                <Text style={{ fontWeight: "900", fontSize: 14, color: Colors.textPrimary }}>
                  Strategic Host topics
                </Text>
              </View>
              <Pressable onPress={() => setShowStrategicHost(false)} hitSlop={10}>
                <Ionicons name="close" size={22} color={Colors.gray500} />
              </Pressable>
            </View>

            {strategicLoading ? (
              <View style={{ paddingVertical: 18, alignItems: "center" }}>
                <ActivityIndicator color={Colors.primaryViolet} />
                <Text style={{ marginTop: 8, color: Colors.gray600 }}>Finding your sweet spot…</Text>
              </View>
            ) : (
              <ScrollView showsVerticalScrollIndicator={false}>
                {strategicPlanOptions?.length ? (
                  <>
                    <Pressable
                      onPress={() => { setStrategicSelectedTopic(null); setStrategicPlanOptions(null); }}
                      style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 10 }}
                    >
                      <Ionicons name="arrow-back" size={18} color={Colors.primaryViolet} />
                      <Text style={{ fontSize: 13, fontWeight: "700", color: Colors.primaryViolet }}>Back to topics</Text>
                    </Pressable>
                    {strategicSelectedTopic ? (
                      <View style={{ marginBottom: 10 }}>
                        <Text style={{ fontSize: 12, color: Colors.gray500, fontWeight: "700" }}>Topic</Text>
                        <Text style={{ fontSize: 14, fontWeight: "900", color: Colors.textPrimary }}>{strategicSelectedTopic.title}</Text>
                      </View>
                    ) : null}
                    {strategicPlanOptions.slice(0, 2).map((p, idx) => (
                      <Pressable
                        key={`${p.topic}-${idx}`}
                        onPress={() => draftPendingPlanFromStructuredOption(p)}
                        style={{
                          padding: 12,
                          borderRadius: 14,
                          borderWidth: 1,
                          borderColor: Colors.gray200,
                          backgroundColor: Colors.backgroundLight,
                          marginBottom: 10,
                        }}
                      >
                        <Text style={{ fontSize: 11, fontWeight: "800", color: Colors.primaryViolet, marginBottom: 6 }}>
                          Plan option {idx + 1}
                        </Text>
                        <Text style={{ fontSize: 14, fontWeight: "900", color: Colors.textPrimary, marginBottom: 4 }}>
                          {p.topic}
                        </Text>
                        <Text style={{ fontSize: 12, color: Colors.gray600, lineHeight: 17, marginBottom: 8 }}>
                          {[p.location.name, p.location.address].filter(Boolean).join(" • ")}
                        </Text>
                        <Text style={{ fontSize: 12, color: Colors.gray600, lineHeight: 17 }}>
                          {p.details}
                        </Text>
                        <Text style={{ marginTop: 10, fontSize: 12, fontWeight: "800", color: Colors.primaryViolet }}>
                          Draft pending plan →
                        </Text>
                      </Pressable>
                    ))}
                  </>
                ) : (
                  <>
                    {(strategicTopics ?? []).map((t, idx) => (
                      <Pressable
                        key={`${t.title}-${idx}`}
                        onPress={() => loadStructuredPlansForTopic(t)}
                        style={{
                          padding: 12,
                          borderRadius: 14,
                          borderWidth: 1,
                          borderColor: Colors.gray200,
                          backgroundColor: Colors.backgroundLight,
                          marginBottom: 10,
                        }}
                      >
                        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                          <View style={{ flex: 1 }}>
                            <Text style={{ fontSize: 14, fontWeight: "800", color: Colors.textPrimary, marginBottom: 4 }}>
                              {t.title}
                            </Text>
                            <Text style={{ fontSize: 12, color: Colors.gray600, lineHeight: 17 }}>
                              {t.pitch}
                            </Text>
                          </View>
                          <View style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: Colors.primaryViolet + "12" }}>
                            <Text style={{ fontSize: 11, fontWeight: "800", color: Colors.primaryViolet }}>
                              {t.type}
                            </Text>
                          </View>
                        </View>
                        <Text style={{ marginTop: 10, fontSize: 12, fontWeight: "700", color: Colors.primaryViolet }}>
                          See 2 plan options →
                        </Text>
                      </Pressable>
                    ))}
                    {(strategicTopics ?? []).length === 0 ? (
                      <Text style={{ color: Colors.gray600, textAlign: "center", paddingVertical: 14 }}>
                        No topics found. Try again in a moment.
                      </Text>
                    ) : null}
                  </>
                )}
              </ScrollView>
            )}
          </Pressable>
        </Pressable>
      </Modal>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
      >
        <View style={{ flex: 1, padding: 14 }}>
          {error ? <Text style={{ color: Colors.errorRed, marginBottom: 10 }}>{error}</Text> : null}

          {replyTo && (
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                padding: 8,
                backgroundColor: Colors.gray100,
                borderRadius: 8,
                marginBottom: 8,
              }}
            >
              <Text numberOfLines={1} style={{ flex: 1 }}>Replying to: {replyTo.content.slice(0, 40)}…</Text>
              <Pressable onPress={() => setReplyTo(null)}>
                <Ionicons name="close" size={20} color={Colors.gray600} />
              </Pressable>
            </View>
          )}

          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(m) => m.id}
            renderItem={renderMessage}
            inverted
            contentContainerStyle={{ paddingVertical: 10 }}
            ListEmptyComponent={<Text style={{ opacity: 0.7, textAlign: "center" }}>No messages yet.</Text>}
            onEndReached={loadMore}
            onEndReachedThreshold={0.5}
          />

          {showChatExperienceCard && (loadingExperienceSuggestion ? (
            <View style={{ paddingHorizontal: 14, paddingVertical: 12, alignItems: "center" }}>
              <ActivityIndicator size="small" color={accentColor} />
              <Text style={{ fontSize: 13, color: Colors.gray500, marginTop: 6 }}>Winkly is preparing a suggestion…</Text>
            </View>
          ) : chatExperienceSuggestion ? (
            <ChatExperienceSuggestionCard
              suggestion={chatExperienceSuggestion}
              mode={conversationMode as "romance" | "friends" | "business"}
              onPlanDate={openConciergeFromChat}
              onSuggestAnother={fetchChatExperienceSuggestion}
            />
          ) : null)}

          {/* Composer */}
          <View style={{ flexDirection: "row", gap: 8, marginTop: 10, alignItems: "flex-end" }}>
            <Pressable
              onPress={onSendImages}
              style={{
                width: 44,
                height: 44,
                borderRadius: 22,
                backgroundColor: Colors.gray100,
                alignItems: "center",
                justifyContent: "center",
              }}
              accessibilityLabel="Add photo"
            >
              <Ionicons name="image-outline" size={24} color={Colors.textPrimary} />
            </Pressable>

            <Pressable
              onPress={() => setShowGifSheet(true)}
              disabled={sending}
              style={{
                width: 44,
                height: 44,
                borderRadius: 22,
                backgroundColor: Colors.gray100,
                alignItems: "center",
                justifyContent: "center",
                opacity: sending ? 0.5 : 1,
              }}
              accessibilityLabel="Add GIF from URL"
            >
              <Ionicons name="happy-outline" size={24} color={Colors.textPrimary} />
            </Pressable>

            <Pressable
              onPress={onToggleVoiceNote}
              disabled={sending && !chatVoiceRecorderState.isRecording}
              style={{
                width: 44,
                height: 44,
                borderRadius: 22,
                backgroundColor: chatVoiceRecorderState.isRecording ? Colors.errorRed + "22" : Colors.gray100,
                alignItems: "center",
                justifyContent: "center",
                opacity: sending && !chatVoiceRecorderState.isRecording ? 0.5 : 1,
              }}
              accessibilityLabel={chatVoiceRecorderState.isRecording ? "Stop recording and send" : "Record voice message"}
            >
              <Ionicons
                name={chatVoiceRecorderState.isRecording ? "stop-circle" : "mic-outline"}
                size={24}
                color={chatVoiceRecorderState.isRecording ? Colors.errorRed : Colors.textPrimary}
              />
            </Pressable>

            {isDm && otherUser && (
              <Pressable
                onPress={() => setShowInviteModal(true)}
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 22,
                  backgroundColor: Colors.primaryViolet + "18",
                  alignItems: "center",
                  justifyContent: "center",
                }}
                accessibilityLabel="Invite to activity"
              >
                <Ionicons name="calendar-outline" size={22} color={Colors.primaryViolet} />
              </Pressable>
            )}

            {showMatchAgentButton && (
              <Pressable
                onPress={onRunMatchAgent}
                disabled={matchAgentLoading}
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 22,
                  backgroundColor: Colors.primaryViolet + "20",
                  alignItems: "center",
                  justifyContent: "center",
                  opacity: matchAgentLoading ? 0.55 : 1,
                }}
                accessibilityLabel="Match Agent: suggest a place and time"
              >
                {matchAgentLoading ? (
                  <ActivityIndicator size="small" color={Colors.primaryViolet} />
                ) : (
                  <SparklesIcon size={22} color={Colors.primaryViolet} />
                )}
              </Pressable>
            )}

            {showChatExperienceCard && (
              <Pressable
                onPress={openStrategicHost}
                disabled={strategicLoading}
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 22,
                  backgroundColor: Colors.primaryViolet + "12",
                  alignItems: "center",
                  justifyContent: "center",
                  opacity: strategicLoading ? 0.6 : 1,
                }}
                accessibilityLabel="Strategic Host: topic suggestions"
              >
                <Ionicons name={"sparkles-outline" as never} size={22} color={Colors.primaryViolet} />
              </Pressable>
            )}

            {isDm && otherUser && (
              <Pressable
                onPress={onSendIcebreaker}
                disabled={sending}
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 22,
                  backgroundColor: Colors.gray100,
                  alignItems: "center",
                  justifyContent: "center",
                  opacity: sending ? 0.5 : 1,
                }}
                accessibilityLabel="Send icebreaker"
              >
                <Ionicons name="game-controller-outline" size={22} color={Colors.primaryViolet} />
              </Pressable>
            )}

            {isDm && otherUser && (
              <Pressable
                onPress={onVideoCall}
                disabled={videoCallLoading}
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 22,
                  backgroundColor: Colors.gray100,
                  alignItems: "center",
                  justifyContent: "center",
                  opacity: videoCallLoading ? 0.5 : 1,
                }}
                accessibilityLabel="Video call"
              >
                <Ionicons name="videocam-outline" size={22} color={Colors.primaryViolet} />
              </Pressable>
            )}

            <Pressable
              onPress={() => inputRef.current?.focus()}
              style={{
                width: 44,
                height: 44,
                borderRadius: 22,
                backgroundColor: Colors.gray100,
                alignItems: "center",
                justifyContent: "center",
              }}
              accessibilityLabel="Emoji"
            >
              <Text style={{ fontSize: 22 }}>😊</Text>
            </Pressable>

            <TextInput
              ref={inputRef}
              value={draft}
              onChangeText={setDraft}
              onFocus={() => setTyping(true)}
              onBlur={() => setTyping(false)}
              onSubmitEditing={onSendText}
              placeholder="Message…"
              multiline
              maxLength={4000}
              style={{
                flex: 1,
                borderWidth: 1,
                borderRadius: 22,
                paddingHorizontal: 16,
                paddingVertical: 10,
                maxHeight: 120,
                fontSize: 16,
              }}
            />

            <Pressable
              onPress={onSendText}
              disabled={sending || (draft.trim().length === 0 && !replyTo)}
              style={{
                width: 44,
                height: 44,
                borderRadius: 22,
                backgroundColor: accentColor,
                alignItems: "center",
                justifyContent: "center",
                opacity: sending || (draft.trim().length === 0 && !replyTo) ? 0.5 : 1,
              }}
            >
              <Ionicons name="send" size={20} color="#FFF" />
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeScreenView>
  );
}
