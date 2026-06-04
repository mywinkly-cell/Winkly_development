import { supabase } from "@/lib/supabase";
import type {
  BusinessConnectionError,
  BusinessConnectionStatus,
  BusinessConnectResult,
  BusinessInvite,
} from "@/types/business";
import { mapProfilesBusinessRow, type BusinessPersonItem } from "@/lib/business/homeFeed";
import { getProfileForMode } from "@/lib/access/profiles";

async function requireUserId(): Promise<string> {
  const { data } = await supabase.auth.getUser();
  const uid = data?.user?.id;
  if (!uid) throw new Error("Not signed in");
  return uid;
}

export async function sendBusinessInvite(
  toUserId: string,
  note: string
): Promise<BusinessConnectResult> {
  const { data, error } = await supabase.rpc("business_connect", {
    p_to_user_id: toUserId,
    p_note: note.trim(),
  });
  if (error) throw error;
  const row = data as { ok?: boolean; error?: BusinessConnectionError; reset_at?: string };
  if (row?.ok) return { ok: true };
  return {
    ok: false,
    error: (row?.error ?? "NOTE_REQUIRED") as BusinessConnectionError,
    reset_at: row?.reset_at,
  };
}

export async function acceptBusinessConnection(connectionId: string): Promise<{
  ok: boolean;
  chat_id?: string;
  error?: string;
}> {
  const { data, error } = await supabase.rpc("business_accept_connection", {
    p_connection_id: connectionId,
  });
  if (error) throw error;
  const row = data as { ok?: boolean; chat_id?: string; error?: string };
  return { ok: !!row?.ok, chat_id: row?.chat_id, error: row?.error };
}

export async function declineBusinessConnection(connectionId: string): Promise<{ ok: boolean }> {
  const { data, error } = await supabase.rpc("business_decline_connection", {
    p_connection_id: connectionId,
  });
  if (error) throw error;
  return { ok: !!(data as { ok?: boolean })?.ok };
}

export async function countPendingBusinessInvites(): Promise<number> {
  const { data, error } = await supabase.rpc("business_pending_invites_count");
  if (error) {
    console.warn("countPendingBusinessInvites", error);
    return 0;
  }
  return typeof data === "number" ? data : 0;
}

export async function getBusinessConnectionStatus(
  targetUserId: string
): Promise<BusinessConnectionStatus> {
  const uid = await requireUserId();
  const { data, error } = await supabase
    .from("business_connections")
    .select("from_user_id, to_user_id, status, declined_until")
    .or(
      `and(from_user_id.eq.${uid},to_user_id.eq.${targetUserId}),and(from_user_id.eq.${targetUserId},to_user_id.eq.${uid})`
    )
    .maybeSingle();
  if (error || !data) return "none";

  const row = data as {
    from_user_id: string;
    to_user_id: string;
    status: string;
    declined_until: string | null;
  };

  if (row.status === "blocked") return "blocked";
  if (row.status === "declined") {
    if (row.declined_until && new Date(row.declined_until) > new Date()) return "declined";
    return "none";
  }
  if (row.status === "accepted") return "accepted";
  if (row.status === "pending") {
    return row.from_user_id === uid ? "pending_sent" : "pending_received";
  }
  return "none";
}

export async function listIncomingBusinessInvites(): Promise<BusinessInvite[]> {
  const uid = await requireUserId();
  const { data: rows, error } = await supabase
    .from("business_connections")
    .select("id, from_user_id, note, created_at")
    .eq("to_user_id", uid)
    .eq("status", "pending")
    .is("reported_at", null)
    .order("created_at", { ascending: false });
  if (error) throw error;

  const invites: BusinessInvite[] = [];
  for (const row of rows ?? []) {
    const fromId = row.from_user_id as string;
    const profileRow = await getProfileForMode("business", uid, fromId);
    const person = mapProfilesBusinessRow((profileRow ?? { id: fromId }) as Record<string, unknown>);
    invites.push({
      id: row.id as string,
      from_user_id: fromId,
      note: row.note as string,
      created_at: row.created_at as string,
      from_profile: {
        id: fromId,
        first_name: person.name.split(" ")[0] ?? "",
        last_name: person.name.split(" ").slice(1).join(" ") ?? "",
        role: person.subtitle?.split(" · ")[0] ?? "",
        business_name: person.subtitle?.split(" · ")[1] ?? "",
        area: "",
        bio: "",
        location: person.meta ?? "",
        logo_uri: person.photoUrl ?? null,
        networking_goals: person.tags ?? [],
        skills: [],
        tags: person.tags ?? [],
        linkedin: null,
        website: null,
        instagram: null,
        photo_verified_at: null,
      },
    });
  }
  return invites;
}

export function connectionErrorMessage(error: BusinessConnectionError): string {
  switch (error) {
    case "NOTE_REQUIRED":
      return "Please introduce yourself (min 20 characters).";
    case "DAILY_LIMIT_REACHED":
      return "You've reached your daily invite limit. Try again tomorrow.";
    case "PROFILE_INCOMPLETE":
      return "Complete your Business profile to connect.";
    case "PENDING_QUEUE_FULL":
      return "You have too many pending invites. Wait for responses or withdraw some.";
    case "BLOCKED_OR_COOLING_OFF":
      return "You can't connect with this person right now.";
    case "ACCOUNT_SUSPENDED":
      return "Invite sending is temporarily suspended on your account.";
    default:
      return "Could not send invite. Please try again.";
  }
}

export type { BusinessPersonItem };
