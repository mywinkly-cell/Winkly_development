// lib/access/conversations.ts — Mode-keyed, participant-only access

import { supabase } from "@/lib/supabase";
import type { Mode } from "@/types";

/** List conversations for user, filtered by mode */
export async function getConversations(
  userId: string,
  mode?: Mode | "all",
  limit = 50
) {
  // RLS ensures only member conversations; we filter by mode in query
  let query = supabase
    .from("conversations")
    .select("id, type, mode, created_by, created_at, updated_at")
    .limit(limit)
    .order("updated_at", { ascending: false });

  if (mode && mode !== "all") {
    query = query.eq("mode", mode);
  }

  const { data, error } = await query;
  if (error) {
    console.warn("getConversations error", error);
    return [];
  }
  return data ?? [];
}

/** Get messages for a conversation — RLS enforces membership */
export async function getMessages(conversationId: string, limit = 50) {
  const { data, error } = await supabase
    .from("messages")
    .select("*, sender:sender_id")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) return [];
  return (data ?? []).reverse();
}
