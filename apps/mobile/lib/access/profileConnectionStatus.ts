import { supabase } from "@/lib/supabase";
import { getBusinessConnectionStatus } from "@/lib/access/businessConnections";
import type { AppMode } from "@/lib/chats/types";

export type ProfileConnectionInfo = {
  isConnected: boolean;
  chatId: string | null;
};

async function findActiveDmChatId(
  viewerId: string,
  targetUserId: string,
  mode: AppMode
): Promise<string | null> {
  const { data: myMemberships } = await supabase
    .from("conversation_members")
    .select("conversation_id, conversations!inner(id, type, mode)")
    .eq("user_id", viewerId)
    .is("left_at", null);

  const myConvIds = (myMemberships ?? [])
    .filter((row) => {
      const conv = row.conversations as { type?: string; mode?: string } | null;
      return conv?.type === "dm" && conv?.mode === mode;
    })
    .map((row) => row.conversation_id as string);

  if (myConvIds.length === 0) return null;

  const { data: shared } = await supabase
    .from("conversation_members")
    .select("conversation_id")
    .in("conversation_id", myConvIds)
    .eq("user_id", targetUserId)
    .is("left_at", null)
    .limit(1)
    .maybeSingle();

  return (shared?.conversation_id as string | undefined) ?? null;
}

export async function getRomanceMatchStatus(
  viewerId: string,
  targetUserId: string
): Promise<ProfileConnectionInfo> {
  const [{ data: a }, { data: b }] = await Promise.all([
    supabase
      .from("romance_likes")
      .select("liker_id")
      .eq("liker_id", viewerId)
      .eq("liked_id", targetUserId)
      .maybeSingle(),
    supabase
      .from("romance_likes")
      .select("liker_id")
      .eq("liker_id", targetUserId)
      .eq("liked_id", viewerId)
      .maybeSingle(),
  ]);

  const isConnected = !!a && !!b;
  const chatId = isConnected ? await findActiveDmChatId(viewerId, targetUserId, "romance") : null;
  return { isConnected, chatId };
}

export async function getFriendsConnectionStatus(
  viewerId: string,
  targetUserId: string
): Promise<ProfileConnectionInfo> {
  const [{ data: a }, { data: b }] = await Promise.all([
    supabase
      .from("follows")
      .select("follower_id")
      .eq("follower_id", viewerId)
      .eq("followee_id", targetUserId)
      .maybeSingle(),
    supabase
      .from("follows")
      .select("follower_id")
      .eq("follower_id", targetUserId)
      .eq("followee_id", viewerId)
      .maybeSingle(),
  ]);

  const isConnected = !!a && !!b;
  const chatId = isConnected ? await findActiveDmChatId(viewerId, targetUserId, "friends") : null;
  return { isConnected, chatId };
}

export async function getBusinessConnectionInfo(
  viewerId: string,
  targetUserId: string
): Promise<ProfileConnectionInfo> {
  const status = await getBusinessConnectionStatus(targetUserId);
  const isConnected = status === "accepted";
  const chatId = isConnected ? await findActiveDmChatId(viewerId, targetUserId, "business") : null;
  return { isConnected, chatId };
}

export async function getProfileConnectionStatus(
  mode: AppMode,
  viewerId: string,
  targetUserId: string
): Promise<ProfileConnectionInfo> {
  if (mode === "romance") return getRomanceMatchStatus(viewerId, targetUserId);
  if (mode === "friends") return getFriendsConnectionStatus(viewerId, targetUserId);
  if (mode === "business") return getBusinessConnectionInfo(viewerId, targetUserId);
  return { isConnected: false, chatId: null };
}
