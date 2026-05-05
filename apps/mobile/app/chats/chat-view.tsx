/**
 * Winkly 1:1 Direct Chat View
 * Full-featured: text, emoji, images, GIF, voice, reactions, reply, read receipts,
 * typing indicator, block, report, mute, delete for self
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  FlatList,
  TextInput,
  Pressable,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Image,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeScreenView } from "@/components/SafeScreenView";
import { Colors } from "@/constants/tokens";
import { useRouter } from "expo-router";
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
import { pickAndUploadChatImages as pickImages } from "@/lib/uploadMedia";

type ConversationRow = {
  id: string;
  type: string;
  mode: string;
  related_event_id: string | null;
};

type Props = { conversationId: string };

function formatName(u?: UserMini | null) {
  if (!u) return "Unknown";
  const fn = (u.first_name ?? "").trim();
  const ln = (u.last_name ?? "").trim();
  return `${fn} ${ln}`.trim() || "Unknown";
}

const QUICK_REACTIONS = ["❤️", "👍", "😊", "😂", "😮", "🔥"];

const REPORT_REASONS: Array<{ key: string; label: string }> = [
  { key: "spam", label: "Spam" },
  { key: "harassment", label: "Harassment" },
  { key: "inappropriate", label: "Inappropriate content" },
  { key: "fake", label: "Fake profile" },
  { key: "other", label: "Other" },
];

export default function ChatView({ conversationId }: Props) {
  const router = useRouter();
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
  const listRef = useRef<FlatList<Message>>(null);
  const inputRef = useRef<TextInput>(null);

  const { messages, loading, error: loadErr, refetch, loadMore } = useMessages(convId);
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

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      setMeId(data.user?.id ?? null);
      const on = await getReadReceiptsPreference();
      setReadReceiptsOn(on);
    })();
  }, []);

  const loadMeta = useCallback(async () => {
    const { data: conv } = await supabase
      .from("conversations")
      .select("id,type,mode,related_event_id")
      .eq("id", convId)
      .single();
    setConversation(conv as ConversationRow);

    const { data: cps } = await supabase
      .from("conversation_participants")
      .select("user_id")
      .eq("conversation_id", convId);
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

  useMessageSubscription(convId, (msg) => {
    refetch();
    if (readReceiptsOn && meId && msg.sender_id !== meId) {
      markMessagesAsRead([msg.id]);
      markConversationRead(convId, msg.created_at);
    }
  });

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

      setSending(true);
      setError(null);
      try {
        await sendMessage(convId, content, attachments, {
          replyToId: replyToId ?? replyTo?.id ?? null,
        });
        setDraft("");
        setReplyTo(null);
        refetch();
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Failed to send");
      } finally {
        setSending(false);
      }
    },
    [convId, draft, replyTo, sending, refetch]
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

  const renderMessage = useCallback(
    ({ item }: { item: Message }) => {
      const mine = meId && item.sender_id === meId;
      const deletedForMe = item.delete_type === "for_me" && mine;
      const deletedForEveryone = item.delete_type === "for_everyone";
      const reactions = reactionsByMessage[item.id] ?? [];

      return (
        <View
          style={{
            alignSelf: mine ? "flex-end" : "flex-start",
            maxWidth: "84%",
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
              {item.reply_to_id ? (
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

              {(item.message_type === "image" || item.message_type === "gif") ? (
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
              ) : (
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
              )}

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
    [meId, accentColor, reactionsByMessage, onAddReaction, onRemoveReaction, onDeleteForSelf, onDeleteForEveryone, handleReportMessage]
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

        <View style={{ flex: 1 }}>
          <Text style={{ fontWeight: "900", fontSize: 16 }}>{otherPartyLabel}</Text>
          <Text style={{ opacity: 0.65, fontSize: 12 }}>
            {typingUserIds.size > 0 ? "typing…" : conversation ? `${conversation.mode} • direct` : ""}
          </Text>
        </View>

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
          <Pressable onPress={handleMute} style={{ padding: 12, flexDirection: "row", alignItems: "center" }}>
            <Ionicons name={muted ? "notifications-off" : "notifications-outline"} size={20} color={Colors.textPrimary} />
            <Text style={{ marginLeft: 8 }}>{muted ? "Unmute chat" : "Mute chat"}</Text>
          </Pressable>
          <Pressable onPress={handleBlock} style={{ padding: 12, flexDirection: "row", alignItems: "center" }}>
            <Ionicons name="ban-outline" size={20} color={Colors.errorRed} />
            <Text style={{ marginLeft: 8, color: Colors.errorRed }}>Block user</Text>
          </Pressable>
          <Pressable onPress={() => setShowMenu(false)} style={{ padding: 12 }}>
            <Text style={{ color: Colors.gray600 }}>Close</Text>
          </Pressable>
        </View>
      )}

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
