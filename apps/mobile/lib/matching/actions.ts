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

/**
 * Number of super-connects the current user has sent today (UTC-day window).
 * Used to persist the daily super-like budget server-side so it can't be reset
 * by simply reopening the app (TB-4.1).
 */
export async function getSuperConnectsUsedToday(): Promise<number> {
  const uid = await requireUserId();
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const { count, error } = await supabase
    .from("friends_requests")
    .select("*", { count: "exact", head: true })
    .eq("requester_id", uid)
    .eq("kind", "super_connect")
    .gte("created_at", start.toISOString());
  if (error) return 0;
  return count ?? 0;
}

export type IncomingFriendsRequestRow = {
  requester_id: string;
  kind: FriendsRequestKind;
  message: string | null;
  created_at: string;
  display_name: string;
  photo_url: string | null;
};

export async function countIncomingFriendsRequests(): Promise<number> {
  const uid = await requireUserId();
  const { count, error } = await supabase
    .from("friends_requests")
    .select("*", { count: "exact", head: true })
    .eq("requested_id", uid);
  if (error) throw error;
  return count ?? 0;
}

export async function listIncomingFriendsRequests(): Promise<IncomingFriendsRequestRow[]> {
  const uid = await requireUserId();
  const { data: rows, error } = await supabase
    .from("friends_requests")
    .select("requester_id, kind, message, created_at")
    .eq("requested_id", uid)
    .order("created_at", { ascending: false });
  if (error) throw error;

  const ids = [...new Set((rows ?? []).map((r) => r.requester_id as string))];
  if (ids.length === 0) return [];

  const { data: fp } = await supabase
    .from("friend_profiles")
    .select("user_id, display_name, main_photo_url")
    .in("user_id", ids);

  const fpMap = new Map(
    (fp ?? []).map((x) => [
      (x as { user_id: string }).user_id,
      x as { display_name: string; main_photo_url: string | null },
    ]),
  );

  const missing = ids.filter((id) => !fpMap.has(id));
  const upMap = new Map<string, { display_name: string; photo: string | null }>();
  if (missing.length > 0) {
    const { data: up } = await supabase
      .from("user_profiles")
      .select("id, first_name, last_name, main_photo_url, core_photos")
      .in("id", missing);
    for (const u of up ?? []) {
      const row = u as {
        id: string;
        first_name: string | null;
        last_name: string | null;
        main_photo_url: string | null;
        core_photos: string[] | null;
      };
      const fn = (row.first_name ?? "").trim();
      const ln = (row.last_name ?? "").trim();
      const name = `${fn} ${ln}`.trim() || "Friend";
      upMap.set(row.id, {
        display_name: name,
        photo: row.main_photo_url ?? row.core_photos?.[0] ?? null,
      });
    }
  }

  return (rows ?? []).map((r) => {
    const requesterId = r.requester_id as string;
    const fp = fpMap.get(requesterId);
    const up = upMap.get(requesterId);
    return {
      requester_id: requesterId,
      kind: r.kind as FriendsRequestKind,
      message: (r.message as string | null) ?? null,
      created_at: r.created_at as string,
      display_name: fp?.display_name ?? up?.display_name ?? "Friend",
      photo_url: fp?.main_photo_url ?? up?.photo ?? null,
    };
  });
}

export async function acceptFriendsRequest(requesterId: string): Promise<{
  ok: boolean;
  chat_id?: string | null;
  error?: string;
}> {
  const { data, error } = await supabase.rpc("friends_accept_request", {
    p_requester_id: requesterId,
  });
  if (error) throw error;
  const j = data as { ok?: boolean; chat_id?: string | null; error?: string };
  return { ok: !!j?.ok, chat_id: j?.chat_id ?? undefined, error: j?.error };
}

export async function declineFriendsRequest(requesterId: string): Promise<{ ok: boolean; error?: string }> {
  const { data, error } = await supabase.rpc("friends_decline_request", {
    p_requester_id: requesterId,
  });
  if (error) throw error;
  const j = data as { ok?: boolean; error?: string };
  return { ok: !!j?.ok, error: j?.error };
}

