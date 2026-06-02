/**
 * Shared chat inbox loader — conversations + messages preview + unread counts.
 * Used by ChatsInboxContent and /chats index.
 */

import { supabase } from "@/lib/supabase";
import type { AppMode, Conversation, ConversationMember, Message, UserMini } from "./types";

export type ChatInboxTab = "all" | AppMode;

export type MemberSettingsByConv = Record<string, { pinned: boolean; last_read_at: string | null }>;

export type ChatInboxData = {
  conversations: Conversation[];
  participantsByConv: Record<string, ConversationMember[]>;
  usersById: Record<string, UserMini>;
  lastMessageByConv: Record<string, Message>;
  memberSettingsByConv: MemberSettingsByConv;
  unreadByConv: Record<string, number>;
};

const EMPTY_INBOX: ChatInboxData = {
  conversations: [],
  participantsByConv: {},
  usersById: {},
  lastMessageByConv: {},
  memberSettingsByConv: {},
  unreadByConv: {},
};

/** Load inbox rows for the active tab (RLS limits to the current user's conversations). */
export async function loadChatInbox(activeTab: ChatInboxTab): Promise<ChatInboxData> {
  let q = supabase
    .from("conversations")
    .select("id,type,mode,name,last_message_at,archived,related_event_id,created_at")
    .eq("archived", false)
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .limit(200);

  if (activeTab !== "all") q = q.eq("mode", activeTab);

  const { data: convs, error: convErr } = await q;
  if (convErr) throw convErr;

  const conversations = (convs ?? []) as Conversation[];
  const convIds = conversations.map((c) => c.id);
  if (convIds.length === 0) return EMPTY_INBOX;

  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id ?? null;

  const [partsRes, msgsRes, settingsRes, unreadRes] = await Promise.all([
    supabase
      .from("conversation_members")
      .select("conversation_id,user_id,role")
      .in("conversation_id", convIds)
      .is("left_at", null),
    supabase
      .from("messages")
      .select(
        "id,conversation_id,sender_id,content,message_type,attachments,reply_to_id,edited_at,deleted_at,delete_type,status,created_at"
      )
      .in("conversation_id", convIds)
      .order("created_at", { ascending: false })
      .limit(300),
    uid
      ? supabase
          .from("conversation_member_settings")
          .select("conversation_id,pinned,last_read_at")
          .in("conversation_id", convIds)
          .eq("user_id", uid)
      : Promise.resolve({
          data: [] as { conversation_id: string; pinned: boolean; last_read_at: string | null }[],
          error: null,
        }),
    uid
      ? supabase.rpc("get_conversation_unread_counts", {
          p_conv_ids: convIds,
          p_user_id: uid,
        })
      : Promise.resolve({ data: [] as { conversation_id: string; unread_count: number }[], error: null }),
  ]);

  if (partsRes.error) throw partsRes.error;
  if (msgsRes.error) throw msgsRes.error;
  if (settingsRes.error) throw settingsRes.error;
  if (unreadRes.error) throw unreadRes.error;

  const partsList = (partsRes.data ?? []) as ConversationMember[];
  const participantsByConv: Record<string, ConversationMember[]> = {};
  for (const p of partsList) {
    participantsByConv[p.conversation_id] = participantsByConv[p.conversation_id] ?? [];
    participantsByConv[p.conversation_id].push(p);
  }

  const memberSettingsByConv: MemberSettingsByConv = {};
  const unreadByConv: Record<string, number> = {};
  if (uid && settingsRes.data) {
    for (const s of settingsRes.data as {
      conversation_id: string;
      pinned: boolean;
      last_read_at: string | null;
    }[]) {
      memberSettingsByConv[s.conversation_id] = { pinned: s.pinned, last_read_at: s.last_read_at };
    }
    for (const r of (unreadRes.data ?? []) as { conversation_id: string; unread_count: number }[]) {
      unreadByConv[r.conversation_id] = Number(r.unread_count) || 0;
    }
  }

  const userIds = Array.from(new Set(partsList.map((p) => p.user_id)));
  const usersById: Record<string, UserMini> = {};
  if (userIds.length > 0) {
    const [minisRes, modeProfilesRes] = await Promise.all([
      supabase.from("user_profiles").select("id,first_name,last_name,city,main_photo_url").in("id", userIds),
      supabase
        .from("profiles_mode")
        .select("user_id,mode,photos")
        .in("user_id", userIds)
        .in("mode", ["romance", "friends", "business"]),
    ]);

    if (minisRes.error) throw minisRes.error;
    if (modeProfilesRes.error) throw modeProfilesRes.error;

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
  }

  const lastMessageByConv: Record<string, Message> = {};
  for (const m of (msgsRes.data ?? []) as Message[]) {
    if (!lastMessageByConv[m.conversation_id]) lastMessageByConv[m.conversation_id] = m;
  }

  return {
    conversations,
    participantsByConv,
    usersById,
    lastMessageByConv,
    memberSettingsByConv,
    unreadByConv,
  };
}

/** Pinned first, then most recent activity. */
export function sortChatInboxItems(
  items: Conversation[],
  lastMessageByConv: Record<string, Message>,
  memberSettingsByConv: MemberSettingsByConv
): Conversation[] {
  return [...items].sort((a, b) => {
    const pinA = memberSettingsByConv[a.id]?.pinned ? 1 : 0;
    const pinB = memberSettingsByConv[b.id]?.pinned ? 1 : 0;
    if (pinA !== pinB) return pinB - pinA;

    const tsA = lastMessageByConv[a.id]?.created_at ?? a.last_message_at ?? a.created_at ?? "";
    const tsB = lastMessageByConv[b.id]?.created_at ?? b.last_message_at ?? b.created_at ?? "";
    return tsB.localeCompare(tsA);
  });
}

export function formatChatInboxTimestamp(ts: string | null | undefined): string {
  if (!ts) return "—";
  const d = new Date(ts);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffMins < 1) return "Now";
  if (diffMins < 60) return `${diffMins}m`;
  if (diffHours < 24) return `${diffHours}h`;
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
