/**
 * Winkly Chat System — React Hooks
 * Reusable logic for conversations, messages, typing, blocks
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { AppMode, Conversation, ConversationMember, Message, UserMini } from "./types";
import { normalizeMessageRow } from "./normalizeMessage";

/** Fetch conversations for current user, filtered by mode */
export function useConversations(mode: AppMode | "all") {
  const [data, setData] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) {
        setData([]);
        return;
      }

      let q = supabase
        .from("conversations")
        .select(
          "id,type,mode,created_by,created_at,updated_at,last_message_at,archived,name,related_event_id,related_group_id,is_system,system_type,expires_at,dm_source,dm_initiator"
        )
        .eq("archived", false)
        .order("last_message_at", { ascending: false, nullsFirst: false })
        .limit(200);

      if (mode !== "all") q = q.eq("mode", mode);

      const { data: rows, error: err } = await q;
      if (err) throw err;
      setData((rows ?? []) as Conversation[]);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load conversations");
      setData([]);
    } finally {
      setLoading(false);
    }
  }, [mode]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { data, loading, error, refetch };
}

/** Fetch participants for a set of conversations */
export function useParticipants(conversationIds: string[]) {
  const [byConv, setByConv] = useState<Record<string, ConversationMember[]>>({});
  const [userIds, setUserIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (conversationIds.length === 0) {
      setByConv({});
      setUserIds(new Set());
      return;
    }

    (async () => {
      const { data: rows } = await supabase
        .from("conversation_members")
        .select("id,conversation_id,user_id,role,joined_at,left_at,invited_by")
        .in("conversation_id", conversationIds)
        .is("left_at", null);

      const list = (rows ?? []) as ConversationMember[];
      const map: Record<string, ConversationMember[]> = {};
      const ids = new Set<string>();
      for (const p of list) {
        if (!map[p.conversation_id]) map[p.conversation_id] = [];
        map[p.conversation_id].push(p);
        ids.add(p.user_id);
      }
      setByConv(map);
      setUserIds(ids);
    })();
  }, [conversationIds.join(",")]);

  return { byConv, userIds: Array.from(userIds) };
}

/** Fetch user mini profiles by IDs */
export function useUserMinis(userIds: string[]) {
  const [byId, setById] = useState<Record<string, UserMini>>({});

  useEffect(() => {
    if (userIds.length === 0) {
      setById({});
      return;
    }

    (async () => {
      const { data } = await supabase
        .from("user_profiles")
        .select("id,first_name,last_name,city,main_photo_url")
        .in("id", userIds);
      const map: Record<string, UserMini> = {};
      for (const u of (data ?? []) as UserMini[]) map[u.id] = u;
      setById(map);
    })();
  }, [userIds.join(",")]);

  return byId;
}

/** Fetch messages for a conversation with pagination */
export function useMessages(conversationId: string | null, pageSize = 50) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);

  const load = useCallback(
    async (append: boolean, beforeTs?: string) => {
      if (!conversationId) return;
      if (!append) setLoading(true);
      setError(null);

      try {
        let q = supabase
          .from("messages")
          .select(
            "id,conversation_id,sender_id,content,message_type,attachments,reply_to_id,edited_at,deleted_at,delete_type,status,created_at"
          )
          .eq("conversation_id", conversationId)
          .order("created_at", { ascending: false })
          .limit(pageSize);

        if (append && beforeTs) q = q.lt("created_at", beforeTs);

        const { data: rows, error: err } = await q;
        if (err) throw err;

        const list = (rows ?? []) as Message[];
        if (list.length < pageSize) setHasMore(false);

        setMessages((prev) => {
          const next = [...list].reverse();
          return append ? [...prev, ...next] : next;
        });
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Failed to load messages");
        if (!append) setMessages([]);
      } finally {
        setLoading(false);
      }
    },
    [conversationId, pageSize]
  );

  const messagesRef = useRef<Message[]>([]);
  messagesRef.current = messages;

  const refetch = useCallback(() => load(false), [load]);
  const loadMore = useCallback(() => {
    const msgs = messagesRef.current;
    const oldest = msgs[msgs.length - 1]?.created_at;
    if (oldest) load(true, oldest);
  }, [load]);

  /** Merge one row from realtime or sendMessage — dedupes by id, keeps chronological order. */
  const mergeIncomingMessage = useCallback((raw: Record<string, unknown> | Message) => {
    const normalized = normalizeMessageRow(raw);
    setMessages((prev) => {
      if (prev.some((m) => m.id === normalized.id)) return prev;
      const next = [...prev, normalized];
      next.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      return next;
    });
  }, []);

  useEffect(() => {
    if (!conversationId) {
      setMessages([]);
      setLoading(false);
      setHasMore(true);
      return;
    }
    setHasMore(true);
    load(false);
  }, [conversationId]);

  return { messages, loading, error, hasMore, refetch, loadMore, mergeIncomingMessage };
}

/** Subscribe to new messages in a conversation */
export function useMessageSubscription(
  conversationId: string | null,
  onInsert: (message: Message) => void
) {
  const onInsertRef = useRef(onInsert);
  onInsertRef.current = onInsert;

  useEffect(() => {
    if (!conversationId) return;

    const channel = supabase
      .channel(`chat:${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const msg = normalizeMessageRow(payload.new as Record<string, unknown>);
          onInsertRef.current(msg);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId]);
}

/** Typing indicator — set/clear and subscribe */
export function useTypingIndicator(conversationId: string | null, meId: string | null) {
  const [typingUserIds, setTypingUserIds] = useState<Set<string>>(new Set());

  const setTyping = useCallback(
    async (isTyping: boolean) => {
      if (!conversationId || !meId) return;
      if (isTyping) {
        await supabase.from("typing_indicators").upsert(
          { conversation_id: conversationId, user_id: meId, updated_at: new Date().toISOString() },
          { onConflict: "conversation_id,user_id" }
        );
      } else {
        await supabase
          .from("typing_indicators")
          .delete()
          .eq("conversation_id", conversationId)
          .eq("user_id", meId);
      }
    },
    [conversationId, meId]
  );

  useEffect(() => {
    if (!conversationId) return;

    const channel = supabase
      .channel(`typing:${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "typing_indicators",
          filter: `conversation_id=eq.${conversationId}`,
        },
        () => {
          supabase
            .from("typing_indicators")
            .select("user_id")
            .eq("conversation_id", conversationId)
            .gt("updated_at", new Date(Date.now() - 5000).toISOString())
            .then(({ data }) => {
              const ids = new Set((data ?? []).map((r: { user_id: string }) => r.user_id));
              ids.delete(meId ?? "");
              setTypingUserIds(ids);
            });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      setTyping(false);
    };
  }, [conversationId, meId, setTyping]);

  return { typingUserIds, setTyping };
}

/** Fetch reactions for a set of messages */
export function useMessageReactions(messageIds: string[]) {
  const [byMessage, setByMessage] = useState<Record<string, { emoji: string; user_id: string; count?: number }[]>>({});

  useEffect(() => {
    if (messageIds.length === 0) {
      setByMessage({});
      return;
    }

    (async () => {
      const { data } = await supabase
        .from("message_reactions")
        .select("message_id,user_id,emoji")
        .in("message_id", messageIds);

      const rows = (data ?? []) as { message_id: string; user_id: string; emoji: string }[];
      const map: Record<string, { emoji: string; user_id: string }[]> = {};
      for (const r of rows) {
        if (!map[r.message_id]) map[r.message_id] = [];
        map[r.message_id].push({ emoji: r.emoji, user_id: r.user_id });
      }
      setByMessage(map);
    })();
  }, [messageIds.join(",")]);

  return byMessage;
}
