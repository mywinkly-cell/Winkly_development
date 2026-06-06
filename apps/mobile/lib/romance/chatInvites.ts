import { supabase } from "@/lib/supabase";

export type RomancePendingChatInvite = {
  id: string;
  conversation_id: string;
  first_name: string | null;
  last_name: string | null;
  age: number | null;
  city: string | null;
  occupation: string | null;
  romance_photos: string[];
  core_photos: string[];
  preview_message: string | null;
  super_like: boolean;
};

export async function fetchRomancePendingChatInvites(
  userId: string
): Promise<RomancePendingChatInvite[]> {
  const { data, error } = await supabase.rpc("romance_pending_chat_invites", {
    p_user_id: userId,
  });
  if (error) throw error;
  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    id: row.id as string,
    conversation_id: row.conversation_id as string,
    first_name: (row.first_name as string) ?? null,
    last_name: (row.last_name as string) ?? null,
    age: (row.age as number) ?? null,
    city: (row.city as string) ?? null,
    occupation: (row.occupation as string) ?? null,
    romance_photos: (row.romance_photos as string[]) ?? [],
    core_photos: (row.core_photos as string[]) ?? [],
    preview_message: (row.preview_message as string) ?? null,
    super_like: Boolean(row.super_like),
  }));
}

export async function acceptRomanceChatInvite(conversationId: string): Promise<{
  ok: boolean;
  is_match?: boolean;
  chat_id?: string;
  error?: string;
}> {
  const { data, error } = await supabase.rpc("accept_romance_chat_invite", {
    p_conversation_id: conversationId,
  });
  if (error) throw error;
  const row = data as { ok?: boolean; is_match?: boolean; chat_id?: string; error?: string };
  return {
    ok: Boolean(row?.ok),
    is_match: row?.is_match,
    chat_id: row?.chat_id,
    error: row?.error,
  };
}

export async function declineRomanceChatInvite(conversationId: string): Promise<{
  ok: boolean;
  error?: string;
}> {
  const { data, error } = await supabase.rpc("decline_romance_chat_invite", {
    p_conversation_id: conversationId,
  });
  if (error) throw error;
  const row = data as { ok?: boolean; error?: string };
  return { ok: Boolean(row?.ok), error: row?.error };
}

export function formatRomanceInviteName(inv: RomancePendingChatInvite): string {
  const fn = (inv.first_name ?? "").trim();
  const ln = (inv.last_name ?? "").trim();
  return `${fn} ${ln}`.trim() || "Someone";
}
