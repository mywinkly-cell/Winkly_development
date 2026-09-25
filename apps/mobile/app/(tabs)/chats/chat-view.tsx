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
  StyleSheet,
} from "react-native";
import { Avatar } from "@/components/ui/Avatar";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useTranslation } from "react-i18next";
import i18n from "i18next";
import { SafeScreenView } from "@/components/SafeScreenView";
import { ChatAttachmentSheet } from "@/components/chats/ChatAttachmentSheet";
import { ChatComposer } from "@/components/chats/ChatComposer";
import { ChatConversationHeader } from "@/components/chats/ChatConversationHeader";
import { keyboardAvoidingProps } from "@/lib/ui/keyboardAvoiding";
import { RomanceChatInviteBanner } from "@/components/chats/RomanceChatInviteBanner";
import { useAppTheme, type AppTheme } from "@/constants/design-system";
import { useRouter, useLocalSearchParams } from "expo-router";
import { supabase } from "@/lib/supabase";
import {
  sendMessage,
  addReaction,
  removeReaction,
  markMessagesAsRead,
  markMessagesDelivered,
  markConversationRead,
  setConversationMuted,
  blockUser,
  reportMessage,
  getReadReceiptsPreference,
  setReadReceiptsPreference,
} from "@/lib/chats/api";
import { showReportReceivedNotice } from "@/lib/safety/reportNotice";
import {
  useMessages,
  useMessageSubscription,
  useTypingIndicator,
  useMessageReactions,
  useOwnMessageReceipts,
} from "@/lib/chats/hooks";
import type { Message, MessageAttachment, MessageType, OwnMessageStatus, UserMini } from "@/lib/chats/types";
import { pickAndUploadChatImages as pickImages, uploadChatVoiceFromUri } from "@/lib/uploadMedia";
import { ModeratedChatImage } from "@/components/chats/ModeratedChatImage";
import { VoiceMessageBubble } from "@/components/chats/VoiceMessageBubble";
import { GifUrlSheet } from "@/components/chats/GifUrlSheet";
import { InviteToPlanModal } from "@/components/chats/InviteToPlanModal";
import type { InviteFormValues } from "@/components/chats/InviteToPlanModal";
import { DateIdeasSuggestions } from "@/components/chats/DateIdeasSuggestions";
import { getDateIdeasForChat, type DateIdea } from "@/lib/dates/dateIdeas";
import { buildIcebreakerPayload, pickRandomIcebreaker } from "@/lib/communications/icebreakers";
import { openVideoCallRoom, startVideoCallForConversation } from "@/lib/communications/videoCall";
import {
  createPlannerInvite,
  acceptPlannerInvite,
  declinePlannerInvite,
  reschedulePlannerInvite,
  getPlannerInvitationsForUser,
} from "@/lib/plannerInvitations";
import { callWinklyPlan, confirmPendingPlan } from "@/lib/ai/conciergeClient";
import {
  buildRomanceFirstDateOptions,
  type RomanceFirstDateOption,
} from "@/lib/ai/romanceFirstDateProposal";
import type { Mode } from "@/types";
import { useModeContext } from "@/providers";
import { hasAnyAIAccess } from "@/lib/ai/aiFeatureGate";
import { getExperienceSuggestionForChat } from "@/lib/ai/chatExperienceSuggestion";
import type { ChatExperienceSuggestion } from "@/lib/ai/chatExperienceSuggestion";
import { ChatExperienceSuggestionCard } from "@/components/chats/ChatExperienceSuggestionCard";
import { postMatchBridgeCtaMessage } from "@/lib/ai/matchBridgeClient";
import { MatchContextBar } from "@/components/chats/MatchContextBar";
import { loadRomanceMatchContext, type RomanceMatchContext } from "@/lib/chats/matchContext";
import { requestDateSafetyPrompt } from "@/lib/safety/dateCheckinPrompt";
import {
  postMatchAgentCtaMessage,
  recordMatchAgentApproval,
  type MatchAgentCtaPayload,
} from "@/lib/ai/matchAgentClient";
import { recordPairBehaviorSignal } from "@/lib/matching/behaviorSignals";
import { SparklesIcon } from "@/components/ui/WinklyAISpark";
import { useFormatLocationDisplay } from "@/lib/location/useLocationDisplay";
import { formatAppDateTime, getAppLocaleTag } from "@/lib/i18n/appLocale";
import { chatRoutes, useModeHub } from "@/lib/navigation/modeHub";
import { openPeerProfile } from "@/lib/chats/peerProfileNavigation";
import {
  isConversationEligibleForStaleNudge,
  dismissStaleConciergeNudge,
} from "@/lib/chats/conciergeNudge";
import { getSharedInterestHintForPair } from "@/lib/ai/preferenceEngine";
import { openPlanTogetherCreateEvent } from "@/lib/social/planTogether";
import {
  getChatStrategicHostTopics,
  getPlannerThemePlans,
  type PlannerThemePlanOption,
  type StrategicHostTopic,
} from "@/lib/ai/strategicHost";
import {
  setGroupVibe,
  getGroupVibeSnapshot,
  formatVibeSnapshotForPrompt,
  type GroupVibeMood,
} from "@/lib/groups/groupsApi";
import { GroupVibeSheet } from "@/components/chats/GroupVibeSheet";
import { GroupPlanConsensusCard } from "@/components/chats/GroupPlanConsensusCard";
import { FitReasonLine, resolveFitReason } from "@/components/ai/FitReasonLine";

/** Not a navigable route — only imported by `app/chats/[conversationId].tsx`. */
export const unstable_settings = { href: null };

type ConversationRow = {
  id: string;
  type: string;
  mode: string;
  name: string | null;
  related_event_id: string | null;
  related_group_id: string | null;
  dm_source: string | null;
  dm_initiator: string | null;
  romance_invite_status: string | null;
  created_at?: string | null;
};

type Props = {
  conversationId: string;
  partnerUserId?: string;
  partnerName?: string;
  partnerPhotoUrl?: string;
  matchBridge?: string;
};

function formatName(u?: UserMini | null, fallback = i18n.t("chat.title")) {
  if (!u) return fallback;
  const fn = (u.first_name ?? "").trim();
  const ln = (u.last_name ?? "").trim();
  return `${fn} ${ln}`.trim() || fallback;
}

function peerPhotoUrl(user: UserMini | null, mode: string | undefined, previewUrl?: string | null) {
  if (previewUrl) return previewUrl;
  if (!user) return null;
  const first = (photos?: (string | null)[]) => photos?.find((x) => !!x) ?? null;
  if (mode === "romance") return first(user.romance_photos) ?? user.main_photo_url ?? null;
  if (mode === "friends") return first(user.friends_photos) ?? user.main_photo_url ?? null;
  if (mode === "business") return first(user.business_photos) ?? user.main_photo_url ?? null;
  return user.main_photo_url ?? null;
}

function nameInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2);
  return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`;
}

const QUICK_REACTIONS = ["❤️", "👍", "😊", "😂", "😮", "🔥"];

/** Locally generated id used to reconcile an optimistic bubble with the persisted row. */
function newClientId(): string {
  return `temp-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Best-effort message type for an optimistic bubble, mirroring the server's inference. */
function inferOptimisticType(attachments: MessageAttachment[]): MessageType {
  const first = attachments[0];
  if (!first) return "text";
  if (first.type === "gif") return "gif";
  if (first.type === "image") return "image";
  if (first.type === "video") return "video";
  if (first.type === "audio") return "audio";
  return "file";
}

/** Report reason keys; labels are `chat.report.reason.<key>`. */
const REPORT_REASONS = ["spam", "harassment", "inappropriate", "fake", "other"] as const;

export default function ChatView({
  conversationId,
  partnerUserId: partnerUserIdParam,
  partnerName: partnerNameParam,
  partnerPhotoUrl: partnerPhotoUrlParam,
  matchBridge: matchBridgeProp,
}: Props) {
  const { t } = useTranslation();
  const router = useRouter();
  const chatHub = useModeHub();
  const { matchBridge: matchBridgeQuery } = useLocalSearchParams<{ matchBridge?: string }>();
  const matchBridgeParam = matchBridgeProp ?? matchBridgeQuery;
  const fmtLocationLine = useFormatLocationDisplay();
  const theme = useAppTheme();
  const styles = createStyles(theme);
  const convId = useMemo(() => String(conversationId), [conversationId]);

  const [meId, setMeId] = useState<string | null>(null);
  const [conversation, setConversation] = useState<ConversationRow | null>(null);
  const [participants, setParticipants] = useState<UserMini[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [messagesLoadError, setMessagesLoadError] = useState<string | null>(null);
  const [otherMemberId, setOtherMemberId] = useState<string | null>(partnerUserIdParam ?? null);
  const [groupAvatarUrl, setGroupAvatarUrl] = useState<string | null>(null);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [readReceiptsOn, setReadReceiptsOn] = useState(true);
  const [muted, setMuted] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteInitialActivity, setInviteInitialActivity] = useState<string | undefined>(undefined);
  const [dateIdeas, setDateIdeas] = useState<DateIdea[]>([]);
  const [dateIdeasDismissed, setDateIdeasDismissed] = useState(false);
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
  // Proactive "ready date on first open" for fresh romance matches.
  const proactiveProposalOnceRef = useRef(false);
  const [proactiveProposalLoading, setProactiveProposalLoading] = useState(false);
  const [staleNudgeVisible, setStaleNudgeVisible] = useState(false);
  const [staleNudgeHint, setStaleNudgeHint] = useState<string | null>(null);
  const [showStrategicHost, setShowStrategicHost] = useState(false);
  const [strategicTopics, setStrategicTopics] = useState<StrategicHostTopic[] | null>(null);
  const [strategicLoading, setStrategicLoading] = useState(false);
  const [strategicSelectedTopic, setStrategicSelectedTopic] = useState<StrategicHostTopic | null>(null);
  const [strategicPlanOptions, setStrategicPlanOptions] = useState<PlannerThemePlanOption[] | null>(null);
  const [showVibeSheet, setShowVibeSheet] = useState(false);
  const [groupVibeText, setGroupVibeText] = useState<string | null>(null);
  const [matchContext, setMatchContext] = useState<RomanceMatchContext | null>(null);
  const listRef = useRef<FlatList<Message>>(null);
  const inputRef = useRef<TextInput>(null);

  const { context: modeContext } = useModeContext();

  const {
    messages,
    loading,
    error: loadErr,
    refetch,
    loadMore,
    mergeIncomingMessage,
    addOptimisticMessage,
    markOptimisticFailed,
    removeOptimisticMessage,
  } = useMessages(convId);

  const [showGifSheet, setShowGifSheet] = useState(false);
  const { typingUserIds, setTyping } = useTypingIndicator(convId, meId);
  // Only persisted messages have real UUID ids; optimistic bubbles (pending/failed)
  // carry temp client ids and must be excluded from uuid-keyed lookups.
  const messageIds = useMemo(
    () => messages.filter((m) => !m.pending && !m.failed).map((m) => m.id),
    [messages]
  );
  const reactionsByMessage = useMessageReactions(messageIds);

  const otherUser = useMemo(() => {
    const targetId =
      otherMemberId ??
      (meId ? participants.find((p) => p.id !== meId)?.id : null) ??
      partnerUserIdParam ??
      null;
    if (!targetId) return null;
    const fromParticipants = participants.find((p) => p.id === targetId);
    if (fromParticipants) return fromParticipants;
    if (partnerUserIdParam === targetId && partnerNameParam) {
      return {
        id: targetId,
        first_name: partnerNameParam,
        last_name: null,
        city: null,
        main_photo_url: partnerPhotoUrlParam ?? null,
      } satisfies UserMini;
    }
    return null;
  }, [participants, meId, otherMemberId, partnerUserIdParam, partnerNameParam, partnerPhotoUrlParam]);

  const isGroup = conversation?.type === "group";
  const peerDisplayName = isGroup
    ? (conversation?.name?.trim() || t("chat.groupChatTitle"))
    : formatName(otherUser, partnerNameParam?.trim() || t("chat.title"));
  const peerAvatarUri = peerPhotoUrl(otherUser, conversation?.mode, partnerPhotoUrlParam);
  const groupParticipantAvatars = useMemo(() => {
    if (!isGroup) return [];
    return participants
      .filter((p) => p.id !== meId)
      .slice(0, 2)
      .map((p) => ({
        uri: peerPhotoUrl(p, conversation?.mode),
        initials: nameInitials(formatName(p, "?")),
      }));
  }, [isGroup, participants, meId, conversation?.mode]);
  const headerSubtitle =
    typingUserIds.size > 0
      ? t("chat.view.typing")
      : conversation
        ? isGroup
          ? t("chat.view.subtitleGroup", { mode: t(`modes.${conversation.mode}`), count: participants.length })
          : t("chat.view.subtitleDirect", { mode: t(`modes.${conversation.mode}`) })
        : "";
  const isRomance = conversation?.mode === "romance";
  const accentColor = isRomance ? theme.modeAccent("romance").primary : theme.colors.primary;
  const conversationMode = (conversation?.mode ?? "romance") as Mode;
  const isDm = conversation?.type === "dm";
  const isPendingRomanceInvite =
    isDm &&
    conversation?.mode === "romance" &&
    conversation?.dm_source === "invite" &&
    conversation?.romance_invite_status === "pending";
  const isRomanceInviteRecipient =
    isPendingRomanceInvite && !!meId && conversation?.dm_initiator !== meId;
  const showRomanceInviteComposer = !isPendingRomanceInvite;

  const invitePreviewMessage = useMemo(() => {
    if (!isPendingRomanceInvite || !conversation?.dm_initiator) return null;
    const opener = messages.find((m) => m.sender_id === conversation.dm_initiator);
    return opener?.content?.trim() ?? null;
  }, [isPendingRomanceInvite, conversation?.dm_initiator, messages]);

  // Delivered/seen status of the current user's own messages (live).
  const myMessageIds = useMemo(
    () => (meId ? messages.filter((m) => m.sender_id === meId && !m.pending && !m.failed).map((m) => m.id) : []),
    [messages, meId]
  );
  const { deliveredIds: peerDeliveredIds, seenIds: peerSeenIds } = useOwnMessageReceipts(
    isDm ? convId : null,
    isDm ? otherUser?.id ?? null : null,
    myMessageIds
  );

  const backToModeChats = useCallback(() => {
    if (typeof router.canGoBack === "function" && router.canGoBack()) {
      router.back();
      return;
    }
    router.replace(chatRoutes.index(chatHub) as Parameters<typeof router.replace>[0]);
  }, [router, chatHub]);

  const handleHeaderPress = useCallback(() => {
    if (isGroup) {
      router.push(chatRoutes.conversationInfo(chatHub, convId) as Parameters<typeof router.push>[0]);
      return;
    }
    const peerId = otherUser?.id ?? otherMemberId;
    const mode = conversation?.mode;
    if (!peerId || (mode !== "romance" && mode !== "friends" && mode !== "business")) return;
    openPeerProfile(router, peerId, mode);
  }, [isGroup, router, chatHub, convId, otherUser?.id, otherMemberId, conversation?.mode]);

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

  // Group AI planning (TB-2.1): the Strategic Host pipeline already fans out to
  // every participant's profiles_mode, so group chats can plan together.
  const showGroupPlanningCard =
    isGroup &&
    !!conversation &&
    !conversation.related_event_id &&
    ["friends", "business"].includes(conversationMode) &&
    hasAnyAIAccess(modeContext.subscription_tier ?? "free");

  // Winkly differentiator: curated date ideas at the top of a new match chat.
  const isRomanceDm =
    isDm && !!otherUser && !!conversation && !conversation.related_event_id && conversationMode === "romance";

  const hasProposedDate = useMemo(
    () =>
      messages.some((m) => {
        if (m.message_type !== "cta") return false;
        try {
          return JSON.parse(m.content)?.type === "planner_invite";
        } catch {
          return false;
        }
      }),
    [messages]
  );

  // Fresh romance match with AI access → present ONE ready-made date proposal
  // (place + time + why) as an Accept/Swap card instead of the match-bridge /
  // match-agent cold-start cards. Free tier (no AI) keeps the existing bridge path.
  const proactiveRomanceProposalEligible =
    isRomanceDm &&
    conversation?.dm_source === "match" &&
    hasAnyAIAccess(modeContext.subscription_tier ?? "free");

  const showDateIdeas =
    isRomanceDm && !dateIdeasDismissed && !hasProposedDate && messages.length <= 12 && dateIdeas.length > 0;

  const hasConversationMessage = useMemo(
    () =>
      messages.some(
        (m) =>
          !m.pending &&
          !m.failed &&
          m.message_type !== "cta" &&
          m.message_type !== "system" &&
          m.message_type !== "icebreaker"
      ),
    [messages]
  );

  const showMatchContextBar = useMemo(() => {
    if (!isRomanceDm || conversation?.dm_source !== "match") return false;
    if (hasConversationMessage) return false;
    if (conversation?.created_at) {
      const ageMs = Date.now() - new Date(conversation.created_at).getTime();
      if (ageMs > 30 * 60 * 1000) return false;
    }
    return matchContext != null;
  }, [isRomanceDm, conversation?.dm_source, conversation?.created_at, hasConversationMessage, matchContext]);

  const meUser = useMemo(
    () => (meId ? participants.find((p) => p.id === meId) ?? null : null),
    [participants, meId]
  );

  useEffect(() => {
    if (!isRomanceDm || !meId || !otherUser) {
      setDateIdeas([]);
      return;
    }
    let cancelled = false;
    getDateIdeasForChat(meId, otherUser.id)
      .then((ideas) => {
        if (!cancelled) setDateIdeas(ideas);
      })
      .catch(() => {
        if (!cancelled) setDateIdeas([]);
      });
    return () => {
      cancelled = true;
    };
  }, [isRomanceDm, meId, otherUser?.id]);

  useEffect(() => {
    if (!isRomanceDm || !meId || !otherUser?.id || conversation?.dm_source !== "match") {
      setMatchContext(null);
      return;
    }
    let cancelled = false;
    loadRomanceMatchContext(meId, otherUser.id).then((ctx) => {
      if (!cancelled) setMatchContext(ctx);
    });
    return () => {
      cancelled = true;
    };
  }, [isRomanceDm, meId, otherUser?.id, conversation?.dm_source]);

  const onPickDateIdea = useCallback((idea: DateIdea) => {
    setInviteInitialActivity(t(`chat.dateIdeas.activity.${idea.key}`));
    setShowInviteModal(true);
  }, [t]);

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
    // The proactive first-date proposal replaces the bridge card for eligible matches.
    if (proactiveRomanceProposalEligible) return;
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
    proactiveRomanceProposalEligible,
  ]);

  const hasMatchBridgeCta = useMemo(
    () =>
      messages.some((m) => {
        if (m.message_type !== "cta") return false;
        try {
          return (JSON.parse(m.content) as { type?: string }).type === "match_bridge";
        } catch {
          return false;
        }
      }),
    [messages],
  );

  const messagesOnlyCtasOrEmpty =
    messages.length === 0 || messages.every((m) => m.message_type === "cta");

  const wantMatchBridge =
    !proactiveRomanceProposalEligible &&
    (matchBridgeParam === "1" ||
      matchBridgeParam === "true" ||
      (conversation?.dm_source === "match" && isRomance && isDm && messages.length === 0)) &&
    !!meId &&
    !!otherUser &&
    isRomance &&
    isDm &&
    !loading;

  const bridgeLoading =
    (matchBridgeOnceRef.current || wantMatchBridge) &&
    !matchBridgeHandled &&
    messagesOnlyCtasOrEmpty &&
    !hasMatchBridgeCta;

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
      // Eligible fresh matches get the single proactive first-date proposal instead.
      if (proactiveRomanceProposalEligible) return;
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
    proactiveRomanceProposalEligible,
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

  const openPlanTogether = useCallback(() => {
    if (!otherUser || !isDm) return;
    const mode =
      conversationMode === "romance" ||
      conversationMode === "friends" ||
      conversationMode === "business" ||
      conversationMode === "events"
        ? conversationMode
        : "friends";
    openPlanTogetherCreateEvent(router, {
      partnerUserId: otherUser.id,
      partnerDisplayName: formatName(otherUser),
      sourceMode: mode,
      conversationId: convId,
    });
  }, [otherUser, isDm, conversationMode, convId, router]);

  // TB-2.5: weather + location aggregation for groups — use the majority city
  // among members (fallback: requester's city). When members are spread across
  // cities, we note it so the AI's weather/venue reasoning is unambiguous.
  const groupCityInfo = useMemo(() => {
    const cities = participants
      .map((p) => (typeof p.city === "string" ? p.city.trim() : ""))
      .filter(Boolean);
    if (cities.length === 0) return { city: null as string | null, note: null as string | null };
    const counts: Record<string, number> = {};
    for (const c of cities) counts[c] = (counts[c] ?? 0) + 1;
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    const top = sorted[0][0];
    const distinct = sorted.length;
    const note =
      distinct > 1 ? `Note: most of the group is in ${top}; plan around ${top}.` : null;
    return { city: top, note };
  }, [participants]);

  const resolvePlanningCity = useCallback((): string | null => {
    if (isGroup && groupCityInfo.city) return groupCityInfo.city;
    return (
      (participants.find((p) => p.id === meId)?.city ?? participants.find((p) => p.id !== meId)?.city ?? null) || null
    );
  }, [isGroup, groupCityInfo.city, participants, meId]);

  // Post a concrete first-date proposal as a planner-invite CTA. The primary option
  // becomes a real planner invite (visible to BOTH sides via planner_participants +
  // RLS); the alternate rides along so "Swap" can re-propose without another AI call.
  const postFirstDateProposal = useCallback(
    async (options: RomanceFirstDateOption[]) => {
      if (!meId || !otherUser || !convId || options.length === 0) return;
      const primary = options[0];
      const swap = options[1] ?? null;
      const { planner_item_id, planner_invitation_id } = await createPlannerInvite(
        meId,
        otherUser.id,
        convId,
        {
          title: primary.title,
          source_mode: "romance",
          starts_at: primary.starts_at,
          ends_at: primary.ends_at ?? undefined,
          activity: primary.activity,
          location: primary.location || undefined,
          place: primary.place || undefined,
        }
      );
      const ctaPayload = JSON.stringify({
        type: "planner_invite",
        planner_item_id,
        planner_invitation_id,
        title: primary.title,
        activity: primary.activity,
        location: primary.location,
        place: primary.place,
        starts_at: primary.starts_at,
        ends_at: primary.ends_at,
        source_mode: "romance",
        // First-date proposal extras: human "why" + the alternate for Swap.
        why: primary.why,
        proactive: true,
        swap_option: swap,
      });
      const inserted = await sendMessage(convId, meId, ctaPayload, [], { messageType: "cta" });
      mergeIncomingMessage(inserted);
      setInvitationStatusMap((prev) => ({ ...prev, [planner_invitation_id]: "pending" }));
    },
    [meId, otherUser, convId, mergeIncomingMessage]
  );

  // First open of a fresh romance match: build one ready date (AI, curated fallback)
  // and post it once. Guarded by hasProposedDate so realtime sync between the two
  // clients does not create duplicate proposals.
  useEffect(() => {
    if (!proactiveRomanceProposalEligible) return;
    if (!meId || !otherUser || loading) return;
    if (hasProposedDate || hasConversationMessage) return;
    if (conversation?.created_at) {
      const ageMs = Date.now() - new Date(conversation.created_at).getTime();
      if (ageMs > 24 * 60 * 60 * 1000) return;
    }
    if (proactiveProposalOnceRef.current) return;
    proactiveProposalOnceRef.current = true;
    let cancelled = false;
    (async () => {
      setProactiveProposalLoading(true);
      try {
        const options = await buildRomanceFirstDateOptions({
          meId,
          partnerUserId: otherUser.id,
          city: resolvePlanningCity(),
        });
        if (cancelled) return;
        await postFirstDateProposal(options);
      } catch {
        // Allow a later retry (e.g. transient send failure).
        proactiveProposalOnceRef.current = false;
      } finally {
        if (!cancelled) setProactiveProposalLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    proactiveRomanceProposalEligible,
    meId,
    otherUser?.id,
    loading,
    hasProposedDate,
    hasConversationMessage,
    conversation?.created_at,
    resolvePlanningCity,
    postFirstDateProposal,
  ]);

  // "Swap" on a first-date proposal: decline the current invite (best-effort) and
  // re-propose the alternate option, with the previous option carried back as the
  // new swap so the two options can ping-pong.
  const onSwapProposal = useCallback(
    async (p: {
      planner_invitation_id?: string;
      title?: string;
      activity?: string;
      location?: string | null;
      place?: string | null;
      starts_at?: string;
      ends_at?: string | null;
      why?: string;
      swap_option?: RomanceFirstDateOption | null;
    }) => {
      if (!meId || !otherUser || !convId) return;
      const alt = p.swap_option;
      if (!alt) return;
      try {
        if (p.planner_invitation_id && invitationStatusMap[p.planner_invitation_id] === "pending") {
          try {
            await declinePlannerInvite(p.planner_invitation_id);
            setInvitationStatusMap((prev) => ({ ...prev, [p.planner_invitation_id!]: "declined" }));
          } catch {
            // The proposer (non-invitee) can't decline — fine, just re-propose.
          }
        }
        const priorAsSwap: RomanceFirstDateOption = {
          title: p.title ?? t("chat.cta.dateFallback"),
          place: p.place ?? null,
          location: p.location ?? null,
          starts_at: p.starts_at ?? new Date().toISOString(),
          ends_at: p.ends_at ?? null,
          activity: p.activity ?? t("chat.cta.dateFallback"),
          why: p.why ?? "",
        };
        await postFirstDateProposal([alt, priorAsSwap]);
      } catch (e) {
        Alert.alert(t("chat.cta.swap"), e instanceof Error ? e.message : t("chat.cta.swapFailed"));
      }
    },
    [meId, otherUser, convId, invitationStatusMap, postFirstDateProposal, t]
  );

  // Combine the live vibe snapshot with the city note for the prompt.
  const composedGroupVibe = useCallback((): string | undefined => {
    const parts = [groupVibeText, isGroup ? groupCityInfo.note : null].filter(Boolean) as string[];
    return parts.length ? parts.join(" ") : undefined;
  }, [groupVibeText, isGroup, groupCityInfo.note]);

  // Group planning entry: gather a quick Vibe Check first (non-blocking — anyone
  // who hasn't responded is simply skipped), then open the Strategic Host.
  const openGroupPlanning = useCallback(() => {
    if (!showGroupPlanningCard) return;
    setShowVibeSheet(true);
  }, [showGroupPlanningCard]);

  const proceedAfterVibe = useCallback(
    async (picked?: { mood: GroupVibeMood; energy?: number | null; note?: string | null }) => {
      try {
        if (picked) {
          await setGroupVibe({ conversationId: convId, mood: picked.mood, energy: picked.energy, note: picked.note });
        }
        const snap = await getGroupVibeSnapshot(convId);
        setGroupVibeText(formatVibeSnapshotForPrompt(snap));
      } catch {
        // vibe is best-effort; proceed regardless
      } finally {
        setShowVibeSheet(false);
        openStrategicHost();
      }
    },
    // openStrategicHost is declared below; it's stable via useCallback
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [convId]
  );

  const openStrategicHost = useCallback(async () => {
    if (!meId || !conversation || !participants.length) return;
    if (!["romance", "friends", "business"].includes(conversationMode)) return;
    setShowStrategicHost(true);
    setStrategicLoading(true);
    setStrategicTopics(null);
    setStrategicSelectedTopic(null);
    setStrategicPlanOptions(null);
    try {
      const city = resolvePlanningCity();
      const topics = await getChatStrategicHostTopics({
        mode: conversationMode as "romance" | "friends" | "business",
        participantUserIds: participants.map((p) => p.id),
        city: city ?? undefined,
        conversationId: convId,
        groupVibe: composedGroupVibe(),
      });
      setStrategicTopics(topics);
    } catch (e) {
      setStrategicTopics([]);
      Alert.alert(t("common.winklyAi"), e instanceof Error ? e.message : t("chat.host.loadFailed"));
    } finally {
      setStrategicLoading(false);
    }
  }, [meId, conversation, participants, conversationMode, convId, resolvePlanningCity, composedGroupVibe, t]);

  const loadStructuredPlansForTopic = useCallback(async (topic: StrategicHostTopic) => {
    if (!meId || !conversation) return;
    if (!["romance", "friends", "business"].includes(conversationMode)) return;
    const city = resolvePlanningCity();
    setStrategicLoading(true);
    try {
      const dt = new Date(Date.now() + 48 * 3600_000);
      dt.setMinutes(0, 0, 0);
      setStrategicSelectedTopic(topic);
      const { plans } = await getPlannerThemePlans({
        mode: conversationMode,
        theme: topic.title,
        participantUserIds: participants.map((p) => p.id),
        city: city ?? undefined,
        dateTimeIso: dt.toISOString(),
        groupVibe: composedGroupVibe(),
      });
      setStrategicPlanOptions(plans.slice(0, 2));
    } catch (e) {
      Alert.alert(t("common.winklyAi"), e instanceof Error ? e.message : t("chat.host.draftFailed"));
    } finally {
      setStrategicLoading(false);
    }
  }, [meId, conversation, conversationMode, participants, convId, resolvePlanningCity, composedGroupVibe, t]);

  const draftPendingPlanFromStructuredOption = useCallback(async (opt: PlannerThemePlanOption) => {
    if (!meId || !conversation) return;
    const city = resolvePlanningCity();
    setStrategicLoading(true);
    try {
      const dt = new Date(Date.now() + 48 * 3600_000);
      dt.setMinutes(0, 0, 0);
      const res = await callWinklyPlan({
        context: {
          mode: conversationMode,
          city: city ?? undefined,
          date_from: dt.toISOString(),
          user_prompt: opt.title,
          activity_hint: opt.title,
          participant_user_ids: participants.map((p) => p.id),
          conversation_id: convId,
          group_vibe: composedGroupVibe(),
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
      Alert.alert(t("common.winklyAi"), e instanceof Error ? e.message : t("chat.host.draftPendingFailed"));
    } finally {
      setStrategicLoading(false);
    }
  }, [meId, conversation, conversationMode, participants, convId, mergeIncomingMessage, resolvePlanningCity, composedGroupVibe, t]);

  const openConciergeStaleNudge = useCallback(() => {
    if (!otherUser) return;
    const hint = staleNudgeHint;
    const prefill = hint
      ? t("chat.nudge.prefillWithHint", { hint })
      : t("chat.nudge.prefill");
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
  }, [otherUser, conversationMode, router, staleNudgeHint, t]);

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
        Alert.alert(t("chat.matchAgent.title"), res.error);
        return;
      }
      mergeIncomingMessage(res.inserted);
    } catch (e) {
      Alert.alert(t("chat.matchAgent.title"), e instanceof Error ? e.message : t("chat.tryAgain"));
    } finally {
      setMatchAgentLoading(false);
    }
  }, [meId, otherUser, convId, conversationMode, mergeIncomingMessage, t]);

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
    Alert.alert(t("chat.couldNotUpdate"), r.error);
  }, [t]);

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
    const { data: auth } = await supabase.auth.getUser();
    const uid = auth.user?.id ?? null;

    const { data: conv } = await supabase
      .from("conversations")
      .select("id,type,mode,name,related_event_id,related_group_id,dm_source,dm_initiator,romance_invite_status,created_at")
      .eq("id", convId)
      .single();
    setConversation(conv as ConversationRow);
    const convMode = (conv as ConversationRow | null)?.mode;
    const convType = (conv as ConversationRow | null)?.type;
    const relatedGroupId = (conv as ConversationRow | null)?.related_group_id ?? null;

    if (convType === "group" && relatedGroupId) {
      const { data: groupRow } = await supabase
        .from("groups")
        .select("avatar_url")
        .eq("id", relatedGroupId)
        .maybeSingle();
      setGroupAvatarUrl((groupRow as { avatar_url?: string | null } | null)?.avatar_url ?? null);
    } else {
      setGroupAvatarUrl(null);
    }

    const { data: cps } = await supabase
      .from("conversation_members")
      .select("user_id")
      .eq("conversation_id", convId)
      .is("left_at", null);
    const ids = (cps ?? []).map((x) => x.user_id).filter(Boolean) as string[];
    const peerId = uid ? ids.find((id) => id !== uid) ?? null : ids[0] ?? null;
    if (peerId) setOtherMemberId(peerId);

    if (ids.length > 0) {
      const [minisRes, modeProfilesRes] = await Promise.all([
        supabase.from("user_profiles").select("id,first_name,last_name,city,main_photo_url").in("id", ids),
        supabase
          .from("profiles_mode")
          .select("user_id,mode,photos")
          .in("user_id", ids)
          .in("mode", ["romance", "friends", "business"]),
      ]);
      const usersById: Record<string, UserMini> = {};
      for (const u of (minisRes.data ?? []) as UserMini[]) usersById[u.id] = { ...u };
      for (const row of (modeProfilesRes.data ?? []) as {
        user_id: string;
        mode: string;
        photos: (string | null)[];
      }[]) {
        const u = usersById[row.user_id];
        if (!u) continue;
        if (row.mode === "romance") u.romance_photos = row.photos ?? [];
        else if (row.mode === "friends") u.friends_photos = row.photos ?? [];
        else if (row.mode === "business") u.business_photos = row.photos ?? [];
      }
      setParticipants(Object.values(usersById));
      if (!peerId && partnerUserIdParam) setOtherMemberId(partnerUserIdParam);
    } else if (partnerUserIdParam) {
      setOtherMemberId(partnerUserIdParam);
    }

    const { data: settings } = await supabase
      .from("conversation_member_settings")
      .select("muted")
      .eq("conversation_id", convId)
      .eq("user_id", uid ?? "")
      .maybeSingle();
    if (settings) setMuted((settings as { muted?: boolean }).muted ?? false);
  }, [convId, partnerUserIdParam]);

  useEffect(() => {
    loadMeta();
  }, [loadMeta]);

  useEffect(() => {
    if (!loadErr) {
      setMessagesLoadError(null);
      return;
    }
    setMessagesLoadError(loadErr);
  }, [loadErr]);

  const onRealtimeMessage = useCallback(
    (msg: Message) => {
      mergeIncomingMessage(msg);
      if (meId && msg.sender_id !== meId) {
        // Delivered is a transport-level signal — recorded regardless of the
        // read-receipts preference. "Seen" respects the preference below.
        markMessagesDelivered([msg.id]);
        if (readReceiptsOn) {
          markMessagesAsRead([msg.id]);
          markConversationRead(convId, msg.created_at);
        }
      }
    },
    [mergeIncomingMessage, readReceiptsOn, meId, convId]
  );

  useMessageSubscription(convId, onRealtimeMessage);

  // Mark peer messages delivered as soon as they reach this client (always).
  useEffect(() => {
    if (!meId) return;
    const peerIds = messages.filter((m) => m.sender_id !== meId).map((m) => m.id);
    if (peerIds.length === 0) return;
    markMessagesDelivered(peerIds.slice(-50));
  }, [convId, meId, messages]);

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
      const effectiveReplyToId = replyToId ?? replyTo?.id ?? null;
      const messageType: MessageType = attachments.length ? inferOptimisticType(attachments) : "text";
      const clientId = newClientId();

      // Optimistic: show the bubble immediately and clear the composer.
      addOptimisticMessage({
        clientId,
        senderId: meId,
        content,
        attachments,
        messageType,
        replyToId: effectiveReplyToId,
      });
      setDraft("");
      setReplyTo(null);
      setError(null);
      setSending(true);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      try {
        const inserted = await sendMessage(convId, meId, content, attachments, {
          replyToId: effectiveReplyToId,
          clientId,
        });
        mergeIncomingMessage(inserted);
        void recordDmFirstOutreachIfNeeded(hadMineBeforeSend);
      } catch (e: unknown) {
        markOptimisticFailed(clientId);
        setError(e instanceof Error ? e.message : t("chat.view.sendFailed"));
      } finally {
        setSending(false);
      }
    },
    [
      convId,
      meId,
      draft,
      replyTo,
      sending,
      mergeIncomingMessage,
      addOptimisticMessage,
      markOptimisticFailed,
      messages,
      recordDmFirstOutreachIfNeeded,
      t,
    ]
  );

  /** Retry a previously failed optimistic message. */
  const handleRetrySend = useCallback(
    async (failed: Message) => {
      if (!meId) return;
      const clientId = failed.client_id ?? newClientId();
      // Flip the existing bubble back to pending in place.
      removeOptimisticMessage(clientId);
      addOptimisticMessage({
        clientId,
        senderId: meId,
        content: failed.content,
        attachments: failed.attachments,
        messageType: failed.message_type,
        replyToId: failed.reply_to_id,
      });
      try {
        const inserted = await sendMessage(convId, meId, failed.content, failed.attachments, {
          messageType: failed.message_type,
          replyToId: failed.reply_to_id,
          clientId,
        });
        mergeIncomingMessage(inserted);
      } catch (e: unknown) {
        markOptimisticFailed(clientId);
        setError(e instanceof Error ? e.message : t("chat.view.sendFailed"));
      }
    },
    [convId, meId, addOptimisticMessage, removeOptimisticMessage, markOptimisticFailed, mergeIncomingMessage, t]
  );

  const onSendText = useCallback(() => {
    handleSend([], replyTo?.id);
  }, [handleSend, replyTo]);

  const onSendImages = useCallback(async () => {
    if (!meId || !convId) return;
    const attachments = await pickImages(convId, meId);
    if (attachments.length > 0) {
      await handleSend(attachments, replyTo?.id);
    }
  }, [meId, convId, handleSend, replyTo]);

  const onSendVoice = useCallback(
    async (uri: string, durationMs: number) => {
      if (!meId || !convId || sending) return;
      const hadMineBeforeSend = messages.some((m) => m.sender_id === meId);
      const clientId = newClientId();
      const replyToId = replyTo?.id ?? null;
      setError(null);
      addOptimisticMessage({
        clientId,
        senderId: meId,
        content: t("chat.voiceMessage"),
        messageType: "audio",
        attachments: [{ type: "audio", url: uri, name: String(durationMs) }],
        replyToId,
      });
      setReplyTo(null);
      try {
        const att = await uploadChatVoiceFromUri(convId, meId, uri);
        if (!att) {
          markOptimisticFailed(clientId);
          return;
        }
        const inserted = await sendMessage(convId, meId, " ", [att], {
          replyToId,
          clientId,
        });
        mergeIncomingMessage(inserted);
        void recordDmFirstOutreachIfNeeded(hadMineBeforeSend);
      } catch (e: unknown) {
        markOptimisticFailed(clientId);
        setError(e instanceof Error ? e.message : t("chat.view.voiceSendFailed"));
      }
    },
    [
      meId,
      convId,
      sending,
      messages,
      replyTo?.id,
      mergeIncomingMessage,
      addOptimisticMessage,
      removeOptimisticMessage,
      markOptimisticFailed,
      recordDmFirstOutreachIfNeeded,
      t,
    ]
  );

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
      setError(t("chat.view.muteFailed"));
    }
  }, [convId, muted, t]);

  const handleBlock = useCallback(() => {
    if (!otherUser) return;
    Alert.alert(t("chat.view.blockUser"), t("chat.view.blockConfirm", { name: formatName(otherUser) }), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("chat.block"),
        style: "destructive",
        onPress: async () => {
          try {
            await blockUser(otherUser.id);
            backToModeChats();
          } catch {
            setError(t("chat.view.blockFailed"));
          }
        },
      },
    ]);
    setShowMenu(false);
  }, [otherUser, backToModeChats, t]);

  const handleReportMessage = useCallback(
    (messageId: string) => {
      Alert.alert(t("chat.report.title"), t("chat.report.selectReason"), [
        ...REPORT_REASONS.map((reason) => ({
          text: t(`chat.report.reason.${reason}`),
          onPress: async () => {
            try {
              await reportMessage(messageId, reason, "User reported");
              refetch();
              showReportReceivedNotice("Report: message");
            } catch {
              setError(t("chat.report.failed"));
            }
          },
        })),
        { text: t("common.cancel"), style: "cancel" },
      ]);
      setShowMenu(false);
    },
    [refetch, t]
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
      setError(t("chat.view.icebreakerFailed"));
    } finally {
      setSending(false);
    }
  }, [convId, meId, messages, mergeIncomingMessage, recordDmFirstOutreachIfNeeded, t]);

  const onVideoCall = useCallback(async () => {
    if (!convId) return;
    setVideoCallLoading(true);
    try {
      const session = await startVideoCallForConversation(convId);
      await openVideoCallRoom(session);
    } catch (e) {
      Alert.alert(t("chat.view.videoCall"), e instanceof Error ? e.message : t("chat.view.videoCallFailed"));
    } finally {
      setVideoCallLoading(false);
    }
  }, [convId, t]);

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
        Alert.alert(t("chat.bridge.missingTimeTitle"), t("chat.bridge.missingTimeBody"));
        return;
      }
      try {
        const inviteTitle = p.place?.trim()
          ? p.activity_theme === "coffee"
            ? t("chat.bridge.coffeeAt", { place: p.place.trim() })
            : t("chat.bridge.dateAt", { place: p.place.trim() })
          : p.title;
        const { planner_item_id, planner_invitation_id } = await createPlannerInvite(meId, otherUser.id, convId, {
          title: inviteTitle,
          source_mode: "romance",
          starts_at: p.starts_at,
          ends_at: p.ends_at ?? undefined,
          activity: p.activity_theme ?? t("chat.cta.dateFallback"),
          location: p.location || undefined,
          place: p.place || undefined,
        });
        const ctaPayload = JSON.stringify({
          type: "planner_invite",
          planner_item_id,
          planner_invitation_id,
          title: inviteTitle,
          activity: p.activity_theme ?? t("chat.cta.dateFallback"),
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
        Alert.alert(t("chat.bridge.createInviteFailed"), e instanceof Error ? e.message : t("chat.tryAgain"));
      }
    },
    [meId, otherUser, convId, mergeIncomingMessage, t]
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
      const ownStatus: OwnMessageStatus = peerSeenIds.has(item.id)
        ? "seen"
        : peerDeliveredIds.has(item.id)
          ? "delivered"
          : "sent";

      const senderLabel =
        !isDm && !mine && !isCenteredCta
          ? formatName(participants.find((p) => p.id === item.sender_id))
          : null;

      return (
        <View
          style={{
            alignSelf: isCenteredCta ? "center" : mine ? "flex-end" : "flex-start",
            maxWidth: isCenteredCta ? "96%" : "84%",
            marginBottom: 8,
            opacity: item.pending ? 0.6 : 1,
          }}
        >
          {senderLabel ? (
            <Text style={{ fontSize: 11, fontWeight: "700", color: theme.colors.textSecondary, marginBottom: 2, marginLeft: 4 }}>
              {senderLabel}
            </Text>
          ) : null}
          {deletedForMe ? (
            <View
              style={{
                paddingVertical: 8,
                paddingHorizontal: 12,
                borderRadius: 14,
                backgroundColor: theme.colors.backgroundMuted,
              }}
            >
              <Text style={{ fontSize: 13, color: theme.colors.textSecondary, fontStyle: "italic" }}>
                {t("chat.view.youDeleted")}
              </Text>
            </View>
          ) : deletedForEveryone ? (
            <View
              style={{
                paddingVertical: 8,
                paddingHorizontal: 12,
                borderRadius: 14,
                backgroundColor: theme.colors.backgroundMuted,
              }}
            >
              <Text style={{ fontSize: 13, color: theme.colors.textSecondary, fontStyle: "italic" }}>
                {t("chat.view.deletedForEveryone")}
              </Text>
            </View>
          ) : (
            <>
              {item.message_type === "cta" ? (() => {
                try {
                  const p = JSON.parse(item.content);
                  if (p.type === "match_bridge") {
                    const accent = theme.modeAccent("romance").primary;
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
                          <Text style={{ fontSize: 12, fontWeight: "800", color: accent }}>{t("chat.bridge.label")}</Text>
                        </View>
                        <Text style={{ fontSize: 15, lineHeight: 22, marginBottom: 8 }}>{p.bridge_message}</Text>
                        {p.disclaimer ? (
                          <Text style={{ fontSize: 11, color: theme.colors.textSecondary, marginBottom: 10 }}>{p.disclaimer}</Text>
                        ) : null}
                        <Pressable
                          onPress={() => {
                            onConfirmMatchBridge({
                              title: typeof p.title === "string" ? p.title : t("chat.cta.dateFallback"),
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
                          <Text style={{ fontSize: 14, fontWeight: "700", color: "#FFFFFF", textAlign: "center" }}>{t("chat.bridge.tapToConfirm")}</Text>
                        </Pressable>
                      </View>
                    );
                  }
                  if (p.type === "romance_invite_declined") {
                    return (
                      <View
                        style={{
                          padding: 14,
                          borderRadius: 14,
                          borderWidth: 1,
                          borderColor: theme.colors.border,
                          backgroundColor: theme.colors.backgroundMuted,
                          minWidth: 240,
                        }}
                      >
                        <Text style={{ fontSize: 15, lineHeight: 22, color: theme.colors.textPrimary }}>
                          {typeof p.body === "string"
                            ? p.body
                            : t("chat.cta.inviteDeclined")}
                        </Text>
                      </View>
                    );
                  }
                  if (p.type === "match_agent") {
                    const pma = p as MatchAgentCtaPayload;
                    const accentMa =
                      conversationMode === "romance"
                        ? theme.modeAccent("romance").primary
                        : conversationMode === "friends"
                          ? theme.modeAccent("friends").primary
                          : theme.colors.primary;
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
                          <Text style={{ fontSize: 12, fontWeight: "800", color: accentMa }}>{t("chat.matchAgent.title")}</Text>
                        </View>
                        <Text style={{ fontSize: 15, lineHeight: 22, marginBottom: 8 }}>{pma.agent_message}</Text>
                        {venue ? (
                          <Text style={{ fontSize: 13, color: theme.colors.textSecondary, marginBottom: 4 }}>
                            {venue}
                            {timeCap ? ` · ${timeCap}` : ""}
                          </Text>
                        ) : null}
                        <FitReasonLine
                          reason={resolveFitReason(draft)}
                          accentColor={accentMa}
                          style={{ marginBottom: 10 }}
                        />
                        {privacyLine ? (
                          <Text style={{ fontSize: 11, color: theme.colors.textSecondary, marginBottom: 10 }}>{privacyLine}</Text>
                        ) : null}
                        {proposalId && stage === "confirmed" ? (
                          <Text style={{ fontSize: 13, fontWeight: "600", color: theme.colors.success }}>
                            {t("chat.matchAgent.bothConfirmed")}
                          </Text>
                        ) : null}
                        {proposalId && stage === "waiting_other" ? (
                          <Text style={{ fontSize: 13, color: theme.colors.textSecondary, textAlign: "center" }}>
                            {t("chat.matchAgent.waitingOther")}
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
                            <Text style={{ fontSize: 14, fontWeight: "700", color: "#FFFFFF", textAlign: "center" }}>{t("chat.matchAgent.imIn")}</Text>
                          </Pressable>
                        ) : null}
                        {!proposalId ? (
                          <Text style={{ fontSize: 11, color: theme.colors.textSecondary, marginTop: 4 }}>
                            {t("chat.matchAgent.draftOnly")}
                          </Text>
                        ) : null}
                      </View>
                    );
                  }
                  if (p.type === "pending_plan") {
                    const pendingPlanId = typeof p.pending_plan_id === "string" ? p.pending_plan_id : null;
                    const status = pendingPlanId ? pendingPlanStatusMap[pendingPlanId] : undefined;
                    const imInvitee = !mine;
                    // Group plans get the consensus card: per-option reactions +
                    // host-confirm once an option has more 👍 than 👎 (TB-2.6).
                    if (isGroup && pendingPlanId && Array.isArray(p.plan_options) && p.plan_options.length >= 1) {
                      return (
                        <GroupPlanConsensusCard
                          pendingPlanId={pendingPlanId}
                          options={p.plan_options as Parameters<typeof GroupPlanConsensusCard>[0]["options"]}
                          isHost={!!mine}
                        />
                      );
                    }
                    const dateStr =
                      typeof p.date_time === "string" && p.date_time
                        ? formatAppDateTime(new Date(p.date_time))
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
                          borderColor: theme.colors.primary + "55",
                          backgroundColor: theme.colors.primary + "0A",
                          minWidth: 240,
                        }}
                      >
                        <Text style={{ fontSize: 12, fontWeight: "800", color: theme.colors.primary, marginBottom: 6 }}>
                          {t("chat.pendingPlan.label")}
                        </Text>
                        <Text style={{ fontWeight: "700", fontSize: 15, marginBottom: 4 }}>
                          {String(p.topic ?? t("groups.consensus.planFallback"))}
                        </Text>
                        {dateStr ? <Text style={{ fontSize: 13, color: theme.colors.textSecondary, marginBottom: 2 }}>{dateStr}</Text> : null}
                        {loc ? <Text style={{ fontSize: 13, color: theme.colors.textSecondary, marginBottom: 10 }}>{loc}</Text> : null}

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
                                  Alert.alert(t("groups.consensus.confirmFailed"), (e as Error)?.message ?? t("common.tryAgain"));
                                });
                            }}
                            style={{
                              paddingVertical: 10,
                              alignItems: "center",
                              backgroundColor:
                                status === "confirming" ? theme.colors.border : theme.colors.primary,
                              borderRadius: 10,
                            }}
                          >
                            <Text style={{ fontSize: 14, fontWeight: "700", color: "#FFFFFF" }}>
                              {status === "confirming" ? t("groups.consensus.confirming") : t("chat.pendingPlan.confirm")}
                            </Text>
                          </Pressable>
                        ) : null}
                        {pendingPlanId && imInvitee && status === "waiting_other" ? (
                          <Text style={{ fontSize: 12, color: theme.colors.textSecondary, marginTop: 8, textAlign: "center" }}>
                            {t("chat.pendingPlan.waitingOther")}
                          </Text>
                        ) : null}
                        {pendingPlanId && status === "confirmed" ? (
                          <Text style={{ fontSize: 12, color: theme.colors.success, marginTop: 8, textAlign: "center" }}>
                            {t("chat.pendingPlan.bothConfirmed")}
                          </Text>
                        ) : null}
                      </View>
                    );
                  }
                  if (p.type === "planner_invite") {
                    const status = invitationStatusMap[p.planner_invitation_id];
                    const imInvitee = !mine;
                    // A proactive first-date proposal renders as a clean Accept / Swap
                    // card (place + time + why); regular invites keep Decline / Reschedule.
                    const isProactive = !!p.proactive;
                    const canSwap = isProactive && !!p.swap_option;
                    const whyLine =
                      typeof p.why === "string" && p.why.trim() ? p.why.trim() : resolveFitReason(p);
                    const dateStr = p.starts_at
                      ? formatAppDateTime(new Date(p.starts_at))
                      : "";
                    const locationLine =
                      [p.place, p.location ? fmtLocationLine(String(p.location)) : ""].filter(Boolean).join(" • ") || null;
                    const acceptInvite = () => {
                      acceptPlannerInvite(p.planner_invitation_id).then((result) => {
                        setInvitationStatusMap((prev) => ({ ...prev, [p.planner_invitation_id]: "accepted" }));
                        refetch();
                        if (result.source_mode === "romance") {
                          void requestDateSafetyPrompt({
                            plannerItemId: result.planner_item_id,
                            partnerUserId: result.partner_user_id,
                            scheduledAt: result.starts_at,
                          });
                        }
                      });
                    };
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
                        {isProactive ? (
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 6 }}>
                            <SparklesIcon size={14} color={accentColor} />
                            <Text style={{ fontSize: 11, fontWeight: "800", color: accentColor }}>
                              {t("chat.cta.readyDate")}
                            </Text>
                          </View>
                        ) : null}
                        <Text style={{ fontWeight: "600", fontSize: 15, marginBottom: 4 }}>{p.title}</Text>
                        {dateStr ? (
                          <Text style={{ fontSize: 13, color: theme.colors.textSecondary, marginBottom: 2 }}>{dateStr}</Text>
                        ) : null}
                        {locationLine ? (
                          <Text style={{ fontSize: 13, color: theme.colors.textSecondary, marginBottom: whyLine ? 8 : 10 }}>{locationLine}</Text>
                        ) : null}
                        {whyLine ? (
                          <FitReasonLine reason={whyLine} accentColor={accentColor} style={{ marginBottom: 10 }} />
                        ) : null}
                        {imInvitee && status === "pending" && canSwap && (
                          <View style={{ flexDirection: "row", gap: 8, marginTop: 4 }}>
                            <Pressable
                              onPress={() => onSwapProposal(p)}
                              style={{ flex: 1, paddingVertical: 8, alignItems: "center", backgroundColor: theme.colors.backgroundMuted, borderRadius: 10 }}
                            >
                              <Text style={{ fontSize: 13, fontWeight: "600", textAlign: "center" }}>{t("chat.cta.swap")}</Text>
                            </Pressable>
                            <Pressable
                              onPress={acceptInvite}
                              style={{ flex: 1, paddingVertical: 8, alignItems: "center", backgroundColor: accentColor, borderRadius: 10 }}
                            >
                              <Text style={{ fontSize: 13, fontWeight: "600", color: "#FFFFFF", textAlign: "center" }}>{t("planner.accept")}</Text>
                            </Pressable>
                          </View>
                        )}
                        {imInvitee && status === "pending" && !canSwap && (
                          <View style={{ flexDirection: "row", gap: 8, marginTop: 4 }}>
                            <Pressable
                              onPress={() => {
                                declinePlannerInvite(p.planner_invitation_id).then(() => {
                                  setInvitationStatusMap((prev) => ({ ...prev, [p.planner_invitation_id]: "declined" }));
                                  refetch();
                                });
                              }}
                              style={{ flex: 1, paddingVertical: 8, alignItems: "center", backgroundColor: theme.colors.backgroundMuted, borderRadius: 10 }}
                            >
                              <Text style={{ fontSize: 13, fontWeight: "600", textAlign: "center" }}>{t("planner.decline")}</Text>
                            </Pressable>
                            <Pressable
                              onPress={() => {
                                reschedulePlannerInvite(p.planner_invitation_id).then(() => {
                                  setInvitationStatusMap((prev) => ({ ...prev, [p.planner_invitation_id]: "reschedule" }));
                                  refetch();
                                });
                              }}
                              style={{ flex: 1, paddingVertical: 8, alignItems: "center", backgroundColor: theme.colors.backgroundMuted, borderRadius: 10 }}
                            >
                              <Text style={{ fontSize: 13, fontWeight: "600", textAlign: "center" }}>{t("chat.cta.reschedule")}</Text>
                            </Pressable>
                            <Pressable
                              onPress={acceptInvite}
                              style={{ flex: 1, paddingVertical: 8, alignItems: "center", backgroundColor: accentColor, borderRadius: 10 }}
                            >
                              <Text style={{ fontSize: 13, fontWeight: "600", color: "#FFFFFF", textAlign: "center" }}>{t("planner.accept")}</Text>
                            </Pressable>
                          </View>
                        )}
                        {!imInvitee && isProactive && !status ? (
                          <Text style={{ fontSize: 12, color: theme.colors.textSecondary, marginTop: 4 }}>
                            {t("chat.cta.sentAcceptOrSwap")}
                          </Text>
                        ) : null}
                        {imInvitee && status === "accepted" && (
                          <Text style={{ fontSize: 12, color: theme.colors.success, marginTop: 4 }}>{t("chat.cta.youAccepted")}</Text>
                        )}
                        {imInvitee && status === "declined" && (
                          <Text style={{ fontSize: 12, color: theme.colors.textSecondary, marginTop: 4 }}>{t("chat.cta.youDeclined")}</Text>
                        )}
                        {imInvitee && status === "reschedule" && (
                          <Text style={{ fontSize: 12, color: theme.colors.textSecondary, marginTop: 4 }}>{t("chat.cta.youRescheduled")}</Text>
                        )}
                      </View>
                    );
                  }
                } catch {}
                return (
                  <View style={{ paddingVertical: 8, paddingHorizontal: 12, borderRadius: 14, backgroundColor: theme.colors.backgroundMuted }}>
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
                        borderColor: theme.colors.primary + "55",
                        backgroundColor: theme.colors.primary + "12",
                        maxWidth: 300,
                      }}
                    >
                      <Text style={{ fontSize: 11, fontWeight: "800", color: theme.colors.primary, marginBottom: 6 }}>
                        {t("chat.icebreaker.label")}
                      </Text>
                      <Text style={{ fontSize: 15, lineHeight: 22 }}>{prompt}</Text>
                    </View>
                  );
                } catch {
                  return (
                    <View style={{ paddingVertical: 8, paddingHorizontal: 12, borderRadius: 14, backgroundColor: theme.colors.backgroundMuted }}>
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
                  <Text numberOfLines={1} style={{ fontSize: 12, color: theme.colors.textSecondary }}>
                    {t("chat.view.replyToMessage")}
                  </Text>
                </View>
              ) : null}

              {item.message_type !== "cta" && item.message_type !== "icebreaker" && item.message_type === "audio" ? (
                item.attachments?.[0]?.url ? (
                  <VoiceMessageBubble
                    audioUrl={item.attachments[0].url}
                    mine={!!mine}
                    accentColor={accentColor}
                    pending={!!item.pending}
                    durationMs={
                      item.attachments[0].name
                        ? Number(item.attachments[0].name) || undefined
                        : undefined
                    }
                  />
                ) : (
                  <Text style={{ fontSize: 13, color: theme.colors.textSecondary }}>{t("chat.view.voiceUnavailable")}</Text>
                )
              ) : item.message_type !== "cta" && item.message_type !== "icebreaker" && (item.message_type === "image" || item.message_type === "gif") ? (
                <View style={{ borderRadius: 14, overflow: "hidden" }}>
                  <ModeratedChatImage
                    uri={(item.attachments?.[0]?.url ?? item.content) || ""}
                    attachment={item.attachments?.[0]}
                    mine={!!mine}
                    onReport={() => handleReportMessage(item.id)}
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
                    borderColor: mine ? accentColor + "40" : theme.colors.border,
                    backgroundColor: mine ? accentColor + "12" : theme.colors.background,
                  }}
                >
                  <Text style={{ fontSize: 15 }}>{item.content}</Text>
                </View>
              ) : null}

              <View style={{ flexDirection: "row", alignItems: "center", marginTop: 4, gap: 8 }}>
                <Text style={{ fontSize: 11, color: theme.colors.textMuted }}>
                  {new Date(item.created_at).toLocaleTimeString(getAppLocaleTag(), { hour: "2-digit", minute: "2-digit" })}
                </Text>
                {mine && item.pending ? (
                  <Text style={{ fontSize: 11, fontWeight: "600", color: theme.colors.textMuted }}>
                    {t("chat.view.sending")}
                  </Text>
                ) : mine && item.failed ? (
                  <Pressable onPress={() => handleRetrySend(item)} hitSlop={6}>
                    <Text style={{ fontSize: 11, fontWeight: "700", color: theme.colors.error }}>
                      {t("chat.view.notDelivered")}
                    </Text>
                  </Pressable>
                ) : mine && item.message_type !== "cta" && item.message_type !== "system" && !item.pending ? (
                  <Text
                    style={{
                      fontSize: 11,
                      fontWeight: "600",
                      color: ownStatus === "seen" ? accentColor : theme.colors.textMuted,
                    }}
                  >
                    {ownStatus === "seen" ? t("chat.view.seen") : ownStatus === "delivered" ? t("chat.view.delivered") : t("common.sent")}
                  </Text>
                ) : null}
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
                          backgroundColor: theme.colors.backgroundMuted,
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
                  <Ionicons name="arrow-undo-outline" size={16} color={theme.colors.textSecondary} />
                </Pressable>
                {!mine && (
                  <Pressable onPress={() => handleReportMessage(item.id)} style={{ padding: 4 }} hitSlop={8}>
                    <Ionicons name="flag-outline" size={16} color={theme.colors.textSecondary} />
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
      isDm,
      participants,
      accentColor,
      reactionsByMessage,
      invitationStatusMap,
      pendingPlanStatusMap,
      refetch,
      onAddReaction,
      onRemoveReaction,
      handleReportMessage,
      peerDeliveredIds,
      peerSeenIds,
      onConfirmMatchBridge,
      fmtLocationLine,
      conversationMode,
      matchAgentApprovalStage,
      onMatchAgentApprove,
      handleRetrySend,
      isGroup,
      onSwapProposal,
      t,
    ]
  );

  if (loading) {
    return (
      <SafeScreenView style={{ flex: 1, padding: 16, justifyContent: "center" }}>
        <ActivityIndicator size="large" color={accentColor} />
        <Text style={{ textAlign: "center", marginTop: 8 }}>{t("chat.view.loading")}</Text>
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
          borderBottomColor: theme.colors.border,
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
        }}
      >
        <Pressable
          onPress={backToModeChats}
          accessibilityRole="button"
          accessibilityLabel={t("common.back")}
          style={{
            width: 44,
            height: 44,
            borderRadius: 22,
            backgroundColor: theme.colors.backgroundMuted,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Ionicons name="arrow-back" size={24} color={theme.colors.textPrimary} />
        </Pressable>

        <ChatConversationHeader
          isGroup={!!isGroup}
          displayName={peerDisplayName}
          subtitle={headerSubtitle}
          peerAvatarUri={peerAvatarUri}
          peerInitials={nameInitials(peerDisplayName)}
          groupAvatarUri={groupAvatarUrl}
          participantAvatars={groupParticipantAvatars}
          onPress={handleHeaderPress}
          accessibilityLabel={
            isGroup
              ? t("chat.view.groupDetailsA11y", { name: peerDisplayName })
              : t("chat.view.profileA11y", { name: peerDisplayName })
          }
        />

        {isDm && otherUser ? (
          <Pressable
            onPress={openPlanTogether}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 4,
              paddingHorizontal: 10,
              paddingVertical: 8,
              borderRadius: 20,
              backgroundColor: theme.colors.primary + "18",
              maxWidth: 130,
            }}
            accessibilityLabel={t("chat.view.planTogether")}
          >
            <Ionicons name="calendar-outline" size={18} color={theme.colors.primary} />
            <Text style={{ fontWeight: "700", fontSize: 12, color: theme.colors.primary, flexShrink: 1 }} numberOfLines={1} adjustsFontSizeToFit>
              {t("chat.view.planTogether")}
            </Text>
          </Pressable>
        ) : null}

        <Pressable
          onPress={() => setShowMenu(!showMenu)}
          accessibilityRole="button"
          accessibilityLabel={t("chat.view.menuA11y")}
          style={{
            width: 44,
            height: 44,
            borderRadius: 22,
            backgroundColor: theme.colors.backgroundMuted,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Ionicons name="ellipsis-vertical" size={24} color={theme.colors.textPrimary} />
        </Pressable>
      </View>

      {showMatchContextBar && matchContext && otherUser ? (
        <MatchContextBar
          myPhotoUrl={peerPhotoUrl(meUser, "romance")}
          myInitials={nameInitials(formatName(meUser, t("chat.view.you")))}
          partnerPhotoUrl={peerAvatarUri}
          partnerInitials={nameInitials(peerDisplayName)}
          sharedInterestCount={matchContext.sharedInterestCount}
          distanceLabel={matchContext.distanceLabel}
        />
      ) : null}

      {staleNudgeVisible && isDm && (conversationMode === "business" || conversationMode === "friends") ? (
        <View
          style={{
            marginHorizontal: 14,
            marginTop: 8,
            padding: 12,
            borderRadius: 12,
            backgroundColor: theme.colors.primary + "14",
            borderWidth: 1,
            borderColor: theme.colors.primary + "44",
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <SparklesIcon size={18} color={theme.colors.primary} />
            <Text style={{ fontWeight: "800", fontSize: 13, color: theme.colors.primary, flexShrink: 1 }}>{t("chat.nudge.title")}</Text>
          </View>
          <Text style={{ fontSize: 14, color: theme.colors.textPrimary, marginBottom: 10, lineHeight: 20 }}>
            {staleNudgeHint
              ? t("chat.nudge.bodyWithHint", { hint: staleNudgeHint })
              : t("chat.nudge.body")}
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
                backgroundColor: theme.colors.primary,
                borderRadius: 10,
              }}
            >
              <Text style={{ fontWeight: "700", color: theme.colors.onPrimary, textAlign: "center" }}>{t("chat.nudge.findSpot")}</Text>
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
                backgroundColor: theme.colors.backgroundMuted,
                borderRadius: 10,
              }}
            >
              <Text style={{ fontWeight: "600", color: theme.colors.textSecondary }}>{t("chat.nudge.later")}</Text>
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
            backgroundColor: theme.colors.surface,
            borderRadius: 12,
            padding: 8,
            ...theme.elevation(2),
            zIndex: 100,
            minWidth: 180,
          }}
        >
          <Pressable onPress={toggleReadReceipts} style={{ padding: 12, flexDirection: "row", alignItems: "center" }}>
            <Ionicons name={readReceiptsOn ? "checkmark-circle" : "checkmark-circle-outline"} size={20} color={theme.colors.textPrimary} />
            <Text style={{ marginLeft: 8, flexShrink: 1 }}>{readReceiptsOn ? t("chat.menu.readReceiptsOn") : t("chat.menu.readReceiptsOff")}</Text>
          </Pressable>
          {isDm && otherUser && (
            <Pressable
              onPress={() => { setShowMenu(false); setShowInviteModal(true); }}
              style={{ padding: 12, flexDirection: "row", alignItems: "center" }}
            >
              <Ionicons name="calendar-outline" size={20} color={theme.colors.primary} />
              <Text style={{ marginLeft: 8, color: theme.colors.primary, flexShrink: 1 }}>
                {t(`chat.invite.title.${conversationMode}`)}
              </Text>
            </Pressable>
          )}
          <Pressable onPress={handleMute} style={{ padding: 12, flexDirection: "row", alignItems: "center" }}>
            <Ionicons name={muted ? "notifications-off" : "notifications-outline"} size={20} color={theme.colors.textPrimary} />
            <Text style={{ marginLeft: 8, flexShrink: 1 }}>{muted ? t("chat.menu.unmute") : t("chat.menu.mute")}</Text>
          </Pressable>
          {isGroup ? (
            <Pressable
              onPress={() => {
                setShowMenu(false);
                router.push(chatRoutes.conversationInfo(chatHub, convId) as Parameters<typeof router.push>[0]);
              }}
              style={{ padding: 12, flexDirection: "row", alignItems: "center" }}
            >
              <Ionicons name="people-outline" size={20} color={theme.colors.textPrimary} />
              <Text style={{ marginLeft: 8, flexShrink: 1 }}>{t("chat.groupInfo")}</Text>
            </Pressable>
          ) : null}
          {isDm && otherUser ? (
            <Pressable onPress={handleBlock} style={{ padding: 12, flexDirection: "row", alignItems: "center" }}>
              <Ionicons name="remove-circle-outline" size={20} color={theme.colors.error} />
              <Text style={{ marginLeft: 8, color: theme.colors.error, flexShrink: 1 }}>{t("chat.view.blockUser")}</Text>
            </Pressable>
          ) : null}
          <Pressable onPress={() => setShowMenu(false)} style={{ padding: 12 }}>
            <Text style={{ color: theme.colors.textSecondary }}>{t("common.close")}</Text>
          </Pressable>
        </View>
      )}

      <InviteToPlanModal
        visible={showInviteModal}
        mode={conversationMode}
        initialActivity={inviteInitialActivity}
        onClose={() => {
          setShowInviteModal(false);
          setInviteInitialActivity(undefined);
        }}
        partnerUserId={otherUser?.id}
        partnerDisplayName={otherUser ? formatName(otherUser) : undefined}
        onSubmit={async (values: InviteFormValues) => {
          if (!meId || !otherUser) throw new Error(t("chat.view.missingUser"));
          const title = values.place.trim()
            ? t("chat.invite.activityAtPlace", { activity: values.activity, place: values.place.trim() })
            : values.activity;
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
            setError(e instanceof Error ? e.message : t("chat.gif.sendFailed"));
          } finally {
            setSending(false);
          }
        }}
      />

      <Modal visible={showStrategicHost} transparent animationType="fade">
        <Pressable
          style={{ flex: 1, backgroundColor: theme.colors.overlay, justifyContent: "center", padding: 18 }}
          onPress={() => setShowStrategicHost(false)}
        >
          <Pressable
            onPress={(e) => e.stopPropagation()}
            style={{
              backgroundColor: theme.colors.surface,
              borderRadius: 18,
              padding: 16,
              maxHeight: "80%",
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <SparklesIcon size={18} color={theme.colors.primary} />
                <Text style={{ fontWeight: "900", fontSize: 14, color: theme.colors.textPrimary }}>
                  {t("chat.host.title")}
                </Text>
              </View>
              <Pressable onPress={() => setShowStrategicHost(false)} hitSlop={10} accessibilityRole="button" accessibilityLabel={t("common.close")}>
                <Ionicons name="close" size={22} color={theme.colors.textMuted} />
              </Pressable>
            </View>

            {strategicLoading ? (
              <View style={{ paddingVertical: 18, alignItems: "center" }}>
                <ActivityIndicator color={theme.colors.primary} />
                <Text style={{ marginTop: 8, color: theme.colors.textSecondary }}>{t("chat.host.loading")}</Text>
              </View>
            ) : (
              <ScrollView showsVerticalScrollIndicator={false}>
                {strategicPlanOptions?.length ? (
                  <>
                    <Pressable
                      onPress={() => { setStrategicSelectedTopic(null); setStrategicPlanOptions(null); }}
                      style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 10 }}
                    >
                      <Ionicons name="arrow-back" size={18} color={theme.colors.primary} />
                      <Text style={{ fontSize: 13, fontWeight: "700", color: theme.colors.primary }}>{t("chat.host.backToTopics")}</Text>
                    </Pressable>
                    {strategicSelectedTopic ? (
                      <View style={{ marginBottom: 10 }}>
                        <Text style={{ fontSize: 12, color: theme.colors.textMuted, fontWeight: "700" }}>{t("chat.host.topic")}</Text>
                        <Text style={{ fontSize: 14, fontWeight: "900", color: theme.colors.textPrimary }}>{strategicSelectedTopic.title}</Text>
                      </View>
                    ) : null}
                    {strategicPlanOptions.slice(0, 2).map((p, idx) => (
                      <Pressable
                        key={`${p.title}-${idx}`}
                        onPress={() => draftPendingPlanFromStructuredOption(p)}
                        style={{
                          padding: 12,
                          borderRadius: 14,
                          borderWidth: 1,
                          borderColor: theme.colors.border,
                          backgroundColor: theme.colors.background,
                          marginBottom: 10,
                        }}
                      >
                        <Text style={{ fontSize: 11, fontWeight: "800", color: theme.colors.primary, marginBottom: 6 }}>
                          {t("chat.host.planOption", { number: idx + 1 })}
                        </Text>
                        <Text style={{ fontSize: 14, fontWeight: "900", color: theme.colors.textPrimary, marginBottom: 4 }}>
                          {p.title}
                        </Text>
                        <Text style={{ fontSize: 12, color: theme.colors.textSecondary, lineHeight: 17, marginBottom: 8 }}>
                          {[p.venue.name, p.venue.address].filter(Boolean).join(" • ")}
                        </Text>
                        <FitReasonLine reason={resolveFitReason(p)} />
                        <Text style={{ marginTop: 10, fontSize: 12, fontWeight: "800", color: theme.colors.primary }}>
                          {t("chat.host.draftPending")}
                        </Text>
                      </Pressable>
                    ))}
                  </>
                ) : (
                  <>
                    {(strategicTopics ?? []).map((topic, idx) => (
                      <Pressable
                        key={`${topic.title}-${idx}`}
                        onPress={() => loadStructuredPlansForTopic(topic)}
                        style={{
                          padding: 12,
                          borderRadius: 14,
                          borderWidth: 1,
                          borderColor: theme.colors.border,
                          backgroundColor: theme.colors.background,
                          marginBottom: 10,
                        }}
                      >
                        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                          <View style={{ flex: 1 }}>
                            <Text style={{ fontSize: 14, fontWeight: "800", color: theme.colors.textPrimary, marginBottom: 4 }}>
                              {topic.title}
                            </Text>
                            <Text style={{ fontSize: 12, color: theme.colors.textSecondary, lineHeight: 17 }}>
                              {topic.pitch}
                            </Text>
                          </View>
                          <View style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: theme.colors.primary + "12" }}>
                            <Text style={{ fontSize: 11, fontWeight: "800", color: theme.colors.primary }}>
                              {topic.type}
                            </Text>
                          </View>
                        </View>
                        <Text style={{ marginTop: 10, fontSize: 12, fontWeight: "700", color: theme.colors.primary }}>
                          {t("chat.host.seeOptions", { count: 2 })}
                        </Text>
                      </Pressable>
                    ))}
                    {(strategicTopics ?? []).length === 0 ? (
                      <Text style={{ color: theme.colors.textSecondary, textAlign: "center", paddingVertical: 14 }}>
                        {t("chat.host.noTopics")}
                      </Text>
                    ) : null}
                  </>
                )}
              </ScrollView>
            )}
          </Pressable>
        </Pressable>
      </Modal>

      <KeyboardAvoidingView style={{ flex: 1 }} {...keyboardAvoidingProps(90)}>
        {isRomanceInviteRecipient ? (
          <RomanceChatInviteBanner
            conversationId={convId}
            partnerName={peerDisplayName}
            previewMessage={invitePreviewMessage}
            onAccepted={() => {
              void loadMeta();
            }}
            onDeclined={() => {
              backToModeChats();
            }}
          />
        ) : null}

        <View style={{ flex: 1, paddingHorizontal: 14 }}>
          {messagesLoadError && messages.length === 0 ? (
            <Text style={{ color: theme.colors.error, marginBottom: 10 }}>{messagesLoadError}</Text>
          ) : null}
          {error ? <Text style={{ color: theme.colors.error, marginBottom: 10 }}>{error}</Text> : null}

          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(m) => m.id}
            renderItem={renderMessage}
            inverted
            contentContainerStyle={{ paddingVertical: 10 }}
            ListFooterComponent={
              bridgeLoading || proactiveProposalLoading ? (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8, padding: 12 }}>
                  <ActivityIndicator size="small" color={theme.modeAccent("romance").primary} />
                  <Text style={{ fontSize: 13, color: theme.colors.textMuted }}>
                    {t("chat.view.firstDateLoading")}
                  </Text>
                </View>
              ) : null
            }
            ListEmptyComponent={
              !messagesLoadError ? (
                <Text style={styles.emptyHistory}>
                  {t("chat.view.emptyHistory")}
                </Text>
              ) : null
            }
            onEndReached={loadMore}
            onEndReachedThreshold={0.5}
          />

          {showDateIdeas && (
            <DateIdeasSuggestions
              ideas={dateIdeas}
              accent={accentColor}
              onPick={onPickDateIdea}
              onDismiss={() => setDateIdeasDismissed(true)}
            />
          )}

          {showChatExperienceCard && (loadingExperienceSuggestion ? (
            <View style={{ paddingHorizontal: 14, paddingVertical: 12, alignItems: "center" }}>
              <ActivityIndicator size="small" color={accentColor} />
              <Text style={{ fontSize: 13, color: theme.colors.textMuted, marginTop: 6 }}>{t("chat.view.preparingSuggestion")}</Text>
            </View>
          ) : chatExperienceSuggestion ? (
            <ChatExperienceSuggestionCard
              suggestion={chatExperienceSuggestion}
              mode={conversationMode as "romance" | "friends" | "business"}
              onPlanDate={openConciergeFromChat}
              onSuggestAnother={fetchChatExperienceSuggestion}
            />
          ) : null)}
        </View>

        {showRomanceInviteComposer ? (
        <>
        <ChatComposer
          draft={draft}
          onChangeDraft={(text) => {
            setDraft(text);
            if (text.trim()) void setTyping(true);
          }}
          onFocus={() => setTyping(true)}
          onBlur={() => setTyping(false)}
          accentColor={accentColor}
          sending={sending}
          replyPreview={replyTo ? `${replyTo.content.slice(0, 48)}${replyTo.content.length > 48 ? "…" : ""}` : null}
          onClearReply={() => setReplyTo(null)}
          onSendText={onSendText}
          onSendVoice={onSendVoice}
          onAttachPress={() => setShowAttachMenu(true)}
          inputRef={inputRef}
        />

        <ChatAttachmentSheet
          visible={showAttachMenu && showRomanceInviteComposer}
          onClose={() => setShowAttachMenu(false)}
        >
          <Text style={styles.attachSheetTitle}>{t("chat.attach.title")}</Text>
          <View style={styles.attachGrid}>
            <Pressable
              style={styles.attachItem}
              onPress={() => {
                setShowAttachMenu(false);
                void onSendImages();
              }}
            >
              <Ionicons name="image-outline" size={26} color={theme.colors.primary} />
              <Text style={styles.attachLabel}>{t("chat.photo")}</Text>
            </Pressable>
            <Pressable
              style={styles.attachItem}
              onPress={() => {
                setShowAttachMenu(false);
                setShowGifSheet(true);
              }}
            >
              <Ionicons name="happy-outline" size={26} color={theme.colors.primary} />
              <Text style={styles.attachLabel}>{t("chat.attach.gif")}</Text>
            </Pressable>
            {isDm && otherUser ? (
              <Pressable
                style={styles.attachItem}
                onPress={() => {
                  setShowAttachMenu(false);
                  setInviteInitialActivity(undefined);
                  setShowInviteModal(true);
                }}
              >
                <Ionicons name="calendar-outline" size={26} color={theme.colors.primary} />
                <Text style={styles.attachLabel}>{t("chat.attach.plan")}</Text>
              </Pressable>
            ) : null}
            {isDm && otherUser ? (
              <Pressable
                style={styles.attachItem}
                onPress={() => {
                  setShowAttachMenu(false);
                  void onVideoCall();
                }}
              >
                <Ionicons name="videocam-outline" size={26} color={theme.colors.primary} />
                <Text style={styles.attachLabel}>{t("chat.attach.video")}</Text>
              </Pressable>
            ) : null}
            {isDm && otherUser ? (
              <Pressable
                style={styles.attachItem}
                onPress={() => {
                  setShowAttachMenu(false);
                  void onSendIcebreaker();
                }}
              >
                <Ionicons name="game-controller-outline" size={26} color={theme.colors.primary} />
                <Text style={styles.attachLabel}>{t("chat.icebreaker.label")}</Text>
              </Pressable>
            ) : null}
            {showMatchAgentButton ? (
              <Pressable
                style={styles.attachItem}
                onPress={() => {
                  setShowAttachMenu(false);
                  void onRunMatchAgent();
                }}
              >
                <SparklesIcon size={26} color={theme.colors.primary} />
                <Text style={styles.attachLabel}>{t("chat.attach.matchAi")}</Text>
              </Pressable>
            ) : null}
            {showChatExperienceCard ? (
              <Pressable
                style={styles.attachItem}
                onPress={() => {
                  setShowAttachMenu(false);
                  openStrategicHost();
                }}
              >
                <Ionicons name="star-outline" size={26} color={theme.colors.primary} />
                <Text style={styles.attachLabel}>{t("chat.attach.topics")}</Text>
              </Pressable>
            ) : null}
            {showGroupPlanningCard ? (
              <Pressable
                style={styles.attachItem}
                onPress={() => {
                  setShowAttachMenu(false);
                  openGroupPlanning();
                }}
              >
                <Ionicons name="people-circle-outline" size={26} color={theme.colors.primary} />
                <Text style={styles.attachLabel}>{t("chat.attach.planWithGroup")}</Text>
              </Pressable>
            ) : null}
          </View>
        </ChatAttachmentSheet>
        </>
        ) : isPendingRomanceInvite && !isRomanceInviteRecipient ? (
          <View style={{ padding: 16, alignItems: "center" }}>
            <Text style={{ textAlign: "center", color: theme.colors.textSecondary, fontSize: 14 }}>
              {t("chat.view.waitingInviteAccept")}
            </Text>
          </View>
        ) : null}
      </KeyboardAvoidingView>

      <GroupVibeSheet
        visible={showVibeSheet}
        onClose={() => setShowVibeSheet(false)}
        onSubmit={(picked) => void proceedAfterVibe(picked)}
        onSkip={() => void proceedAfterVibe()}
      />
    </SafeScreenView>
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
    emptyHistory: {
      opacity: 0.75,
      textAlign: "center",
      paddingVertical: 24,
      fontSize: 15,
      color: theme.colors.textSecondary,
    },
    attachSheetTitle: {
      fontWeight: "800",
      fontSize: 15,
      color: theme.colors.textPrimary,
      marginBottom: 14,
    },
    attachGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 16,
    },
    attachItem: {
      width: 72,
      alignItems: "center",
      gap: 6,
    },
    attachLabel: {
      fontSize: 12,
      color: theme.colors.textSecondary,
      textAlign: "center",
    },
  });
}
