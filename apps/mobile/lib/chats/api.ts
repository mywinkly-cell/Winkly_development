/**
 * Winkly Chat System — API Functions
 * Send messages, create DMs, block users, report, etc.
 */

import { supabase } from "@/lib/supabase";
import { normalizeMessageRow } from "./normalizeMessage";
import type { AppMode, DMSource, Message, MessageAttachment, MessageType } from "./types";

/** RPC name — use this constant to avoid typos (e.g. create_derect_chat). */
const RPC_CREATE_DIRECT_CHAT = "create_direct_chat";

export async function sendMessage(
  conversationId: string,
  userId: string,
  content: string,
  attachments: MessageAttachment[] = [],
  options?: { messageType?: MessageType; replyToId?: string | null; clientId?: string | null }
): Promise<Message> {
  const uid = userId;
  if (!uid) throw new Error("Not signed in");

  const messageType = options?.messageType ?? (attachments.length ? inferMessageType(attachments) : "text");

  const safeContent = content.trim() || (attachments.length ? " " : "");
  if (!safeContent && attachments.length === 0) throw new Error("Message cannot be empty");

  const { data, error } = await supabase
    .from("messages")
    .insert({
      conversation_id: conversationId,
      sender_id: uid,
      content: safeContent,
      message_type: messageType,
      attachments: attachments.length ? attachments : [],
      reply_to_id: options?.replyToId ?? null,
      client_id: options?.clientId ?? null,
    })
    .select("id,conversation_id,sender_id,content,message_type,attachments,reply_to_id,edited_at,deleted_at,delete_type,status,created_at,client_id")
    .single();

  if (error) throw error;

  // Push delivery for new messages is handled server-side by the `notify-fanout`
  // Edge Function (DB AFTER INSERT trigger). Doing it here would double-notify and
  // would silently drop notifications if the sender's app is backgrounded mid-send.
  return normalizeMessageRow(data as Message | Record<string, unknown>);
}

function inferMessageType(attachments: MessageAttachment[]): MessageType {
  const first = attachments[0];
  if (!first) return "text";
  if (first.type === "image" || first.type === "gif") return first.type === "gif" ? "gif" : "image";
  if (first.type === "video") return "video";
  if (first.type === "audio") return "audio";
  return "file";
}

export async function createDirectChat(
  otherUserId: string,
  mode: AppMode,
  source: DMSource,
  initiatorId: string
) {
  const { data, error } = await supabase.rpc(RPC_CREATE_DIRECT_CHAT, {
    p_user_a: initiatorId,
    p_user_b: otherUserId,
    p_mode: mode,
    p_source: source,
    p_initiator: initiatorId,
  });
  if (error) throw error;
  return data as string;
}

export async function createEventChat(eventId: string) {
  const { data, error } = await supabase.rpc("create_event_chat", {
    p_event_id: eventId,
  });
  if (error) throw error;
  return data as string;
}

export async function blockUser(blockedId: string) {
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) throw new Error("Not signed in");

  const { error } = await supabase.from("user_blocks").insert({
    blocker_id: uid,
    blocked_id: blockedId,
  });
  if (error) throw error;
}

/** Romance: remove our like (unmatch). Other party’s like remains but match is no longer mutual. */
export async function unmatchRomance(otherUserId: string) {
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) throw new Error("Not signed in");

  const { error } = await supabase
    .from("romance_likes")
    .delete()
    .eq("liker_id", uid)
    .eq("liked_id", otherUserId);
  if (error) throw error;
}

/** Friends/Business: remove our follow (disconnect). */
export async function unfollowConnection(otherUserId: string) {
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) throw new Error("Not signed in");

  const { error } = await supabase
    .from("follows")
    .delete()
    .eq("follower_id", uid)
    .eq("followee_id", otherUserId);
  if (error) throw error;
}

export async function unblockUser(blockedId: string) {
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) throw new Error("Not signed in");

  const { error } = await supabase
    .from("user_blocks")
    .delete()
    .eq("blocker_id", uid)
    .eq("blocked_id", blockedId);
  if (error) throw error;
}

export async function reportUser(reportedId: string, reason: string, details?: string) {
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) throw new Error("Not signed in");

  const { error } = await supabase.from("user_reports").insert({
    reporter_id: uid,
    reported_id: reportedId,
    reason,
    details,
  });
  if (error) throw error;
}

export async function reportMessage(messageId: string, reason: string, details?: string) {
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) throw new Error("Not signed in");

  const { error } = await supabase.from("message_reports").insert({
    message_id: messageId,
    reporter_id: uid,
    reason,
    details,
  });
  if (error) throw error;
}

export async function setConversationMuted(conversationId: string, muted: boolean) {
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) throw new Error("Not signed in");

  const { error } = await supabase
    .from("conversation_member_settings")
    .upsert(
      { conversation_id: conversationId, user_id: uid, muted, updated_at: new Date().toISOString() },
      { onConflict: "conversation_id,user_id" }
    );
  if (error) throw error;
}

export async function setConversationPinned(conversationId: string, pinned: boolean) {
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) throw new Error("Not signed in");

  const { error } = await supabase
    .from("conversation_member_settings")
    .upsert(
      { conversation_id: conversationId, user_id: uid, pinned, updated_at: new Date().toISOString() },
      { onConflict: "conversation_id,user_id" }
    );
  if (error) throw error;
}

export async function leaveConversation(conversationId: string) {
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) throw new Error("Not signed in");

  const { error } = await supabase
    .from("conversation_members")
    .update({ left_at: new Date().toISOString() })
    .eq("conversation_id", conversationId)
    .eq("user_id", uid);
  if (error) throw error;
}

export async function addReaction(messageId: string, emoji: string) {
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) throw new Error("Not signed in");

  const { error } = await supabase.from("message_reactions").insert({
    message_id: messageId,
    user_id: uid,
    emoji,
  });
  if (error) throw error;
}

export async function removeReaction(messageId: string, emoji: string) {
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) throw new Error("Not signed in");

  const { error } = await supabase
    .from("message_reactions")
    .delete()
    .eq("message_id", messageId)
    .eq("user_id", uid)
    .eq("emoji", emoji);
  if (error) throw error;
}

// NOTE: Messages are intentionally NOT deletable after send. The DB enforces
// immutability via RLS (no UPDATE/DELETE policy) plus a trigger, to preserve a
// safety / evidence trail. Misuse is handled through reporting + blocking, not
// deletion. See migration 20260611120000_messaging_match_rls_and_immutability.sql.

/** Mark received messages as DELIVERED (delivered half of read receipts). */
export async function markMessagesDelivered(messageIds: string[]) {
  const uniq = Array.from(new Set(messageIds)).filter(Boolean);
  if (uniq.length === 0) return;
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) return;

  // RPC fills conversation_id and skips the user's own messages.
  await supabase.rpc("mark_messages_delivered", { p_message_ids: uniq });
}

/** Delivery receipts for a set of messages (who has received them). */
export async function getDeliveryReceipts(messageIds: string[]) {
  const uniq = Array.from(new Set(messageIds)).filter(Boolean);
  if (uniq.length === 0) return [];
  const { data, error } = await supabase
    .from("message_delivery_receipts")
    .select("message_id,user_id,delivered_at")
    .in("message_id", uniq);
  if (error) throw error;
  return data ?? [];
}

/** Mark messages as read (read receipts) */
export async function markMessagesAsRead(messageIds: string[]) {
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  if (!uid || messageIds.length === 0) return;

  const rows = messageIds.map((message_id) => ({
    message_id,
    user_id: uid,
  }));

  await supabase.from("message_read_receipts").upsert(rows, {
    onConflict: "message_id,user_id",
  });
}

/** Mark last read at for conversation (for read receipts) */
export async function markConversationRead(conversationId: string, lastReadAt: string) {
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) throw new Error("Not signed in");

  const { error } = await supabase
    .from("conversation_member_settings")
    .upsert(
      {
        conversation_id: conversationId,
        user_id: uid,
        last_read_at: lastReadAt,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "conversation_id,user_id" }
    );
  if (error) throw error;
}

/** Get read receipts for a message */
export async function getReadReceipts(messageId: string) {
  const { data, error } = await supabase
    .from("message_read_receipts")
    .select("user_id,read_at")
    .eq("message_id", messageId);
  if (error) throw error;
  return data ?? [];
}

/** Romance: like or super-like profile; optionally create chat on match */
export async function romanceLikeProfile(
  targetUserId: string,
  options?: { superLike?: boolean; superLikeMessage?: string | null }
) {
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) throw new Error("Not signed in");

  const { data, error } = await supabase.rpc("romance_like_profile", {
    current_user_id: uid,
    target_user_id: targetUserId,
    p_super_like: options?.superLike ?? false,
    p_super_like_message: options?.superLikeMessage ?? null,
  });
  if (error) throw error;
  const result = data as { liked: boolean; is_match: boolean; chat_id?: string };

  // Match push is delivered server-side by the `notify-fanout` Edge Function
  // (DB AFTER INSERT trigger on romance_likes), so no client-side push here.
  return result;
}

/** Read receipts preference (on/off) — stored in user_preferences */
export async function getReadReceiptsPreference(): Promise<boolean> {
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) return true;

  const { data } = await supabase
    .from("user_preferences")
    .select("value")
    .eq("user_id", uid)
    .eq("key", "chat_read_receipts")
    .maybeSingle();

  const val = (data as { value?: { enabled?: boolean } } | null)?.value;
  return val?.enabled !== false; // default on
}

export async function setReadReceiptsPreference(enabled: boolean) {
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) throw new Error("Not signed in");

  await supabase.from("user_preferences").upsert(
    { user_id: uid, key: "chat_read_receipts", value: { enabled } },
    { onConflict: "user_id,key" }
  );
}
