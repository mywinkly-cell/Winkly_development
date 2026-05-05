import { supabase } from "@/lib/supabase";
import type { Mode } from "@/types";

export type SwipeAction = "pass";
export type FriendsRequestKind = "connect" | "super_connect";

async function requireUserId() {
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) throw new Error("Not signed in");
  return uid;
}

export async function recordSwipe(params: {
  mode: Extract<Mode, "romance" | "friends">;
  targetUserId: string;
  action: SwipeAction;
  reason?: string | null;
}) {
  const uid = await requireUserId();
  const { error } = await supabase.from("user_swipes").upsert(
    {
      user_id: uid,
      target_user_id: params.targetUserId,
      mode: params.mode,
      action: params.action,
      reason: params.reason ?? null,
    },
    { onConflict: "user_id,target_user_id,mode,action" }
  );
  if (error) throw error;
}

export async function blockUser(params: { targetUserId: string; reason?: string | null }) {
  const uid = await requireUserId();
  const { error } = await supabase.from("user_blocks").upsert(
    {
      blocker_id: uid,
      blocked_id: params.targetUserId,
    },
    { onConflict: "blocker_id,blocked_id" }
  );
  if (error) throw error;
}

export async function reportUser(params: {
  targetUserId: string;
  reason: "inappropriate" | "fake_profile" | "harassment" | "spam" | "other";
  details?: string | null;
}) {
  const uid = await requireUserId();
  const row: {
    reporter_id: string;
    reported_id: string;
    reason: string;
    details: string | null;
  } = {
    reporter_id: uid,
    reported_id: params.targetUserId,
    reason: params.reason,
    details: params.details ?? null,
  };
  const { error } = await supabase.from("user_reports").upsert(
    row,
    { onConflict: "reporter_id,reported_id" }
  );
  if (error) throw error;
}

export async function sendFriendsRequest(params: {
  targetUserId: string;
  kind: FriendsRequestKind;
  message?: string | null;
}) {
  const uid = await requireUserId();
  const { error } = await supabase.from("friends_requests").upsert(
    {
      requester_id: uid,
      requested_id: params.targetUserId,
      kind: params.kind,
      message: params.message ?? null,
    },
    { onConflict: "requester_id,requested_id" }
  );
  if (error) throw error;
}

