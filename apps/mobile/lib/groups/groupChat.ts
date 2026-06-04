/**
 * Group ↔ conversation bridge — ensures a `conversations` row exists per Winkly group.
 */

import { supabase } from "@/lib/supabase";

/** Create or sync the group conversation; returns conversation id for `/chats/[conversationId]`. */
export async function ensureGroupConversation(groupId: string): Promise<string> {
  const { data, error } = await supabase.rpc("ensure_group_conversation", {
    p_group_id: groupId,
  });
  if (error) throw error;
  if (typeof data !== "string" || !data) {
    throw new Error("Could not open group chat");
  }
  return data;
}

/** Read existing conversation id without syncing members (may be null). */
export async function getGroupConversationId(groupId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("conversations")
    .select("id")
    .eq("type", "group")
    .eq("related_group_id", groupId)
    .maybeSingle();
  if (error) throw error;
  return (data as { id?: string } | null)?.id ?? null;
}
