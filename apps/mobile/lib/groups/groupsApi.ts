/**
 * Group data access: list my groups, members, remove/leave, invite links, and
 * the ephemeral "Vibe Check" used by AI group planning.
 *
 * RLS notes:
 *  - `groups` SELECT is allowed for members; co-member visibility on
 *    `group_members` is granted by the `group_members_select_comembers` policy
 *    (migration 20260626120000) via the `is_group_member` SECURITY DEFINER fn.
 *  - The member cap is enforced by a DB trigger; we also surface a friendly
 *    "group is full" message client-side.
 */

import { supabase } from "@/lib/supabase";
import { getPartnersForConcierge } from "@/lib/ai/conciergePartners";
import type { Mode } from "@/types";

export type GroupSummary = {
  id: string;
  name: string;
  mode: Mode;
  description: string | null;
  avatar_url: string | null;
  created_by: string;
  max_members: number;
  member_count: number;
  conversation_id: string | null;
  last_message_preview: string | null;
  last_message_at: string | null;
};

export type GroupMember = {
  user_id: string;
  role: string;
  joined_at: string;
  display_name: string;
  avatar_url: string | null;
  city: string | null;
};

export type GroupDetails = {
  id: string;
  name: string;
  mode: Mode;
  description: string | null;
  avatar_url: string | null;
  created_by: string;
  max_members: number;
  member_count: number;
  is_admin: boolean;
  invite_code: string | null;
};

const FULL_HINT = "This group is full.";

function isGroupFullError(e: unknown): boolean {
  const msg = (e as { message?: string } | null)?.message ?? "";
  return msg.includes("GROUP_FULL");
}

/** Groups the current user is a member of, with last-message preview for the inbox-style row. */
export async function getMyGroups(mode?: Mode): Promise<GroupSummary[]> {
  const { data: auth } = await supabase.auth.getUser();
  const me = auth.user?.id;
  if (!me) return [];

  const { data: memberships, error } = await supabase
    .from("group_members")
    .select("group_id")
    .eq("user_id", me);
  if (error || !memberships?.length) return [];

  const groupIds = [...new Set(memberships.map((m: { group_id: string }) => m.group_id))];

  let groupsQuery = supabase
    .from("groups")
    .select("id, name, mode, description, avatar_url, created_by, max_members")
    .in("id", groupIds);
  if (mode) groupsQuery = groupsQuery.eq("mode", mode);

  const [groupsRes, membersRes, convRes] = await Promise.all([
    groupsQuery,
    supabase.from("group_members").select("group_id").in("group_id", groupIds),
    supabase
      .from("conversations")
      .select("id, related_group_id, last_message_at")
      .eq("type", "group")
      .in("related_group_id", groupIds),
  ]);

  const counts: Record<string, number> = {};
  (membersRes.data ?? []).forEach((r: { group_id: string }) => {
    counts[r.group_id] = (counts[r.group_id] ?? 0) + 1;
  });

  const convByGroup: Record<string, { id: string; last_message_at: string | null }> = {};
  (convRes.data ?? []).forEach((c: { id: string; related_group_id: string; last_message_at: string | null }) => {
    convByGroup[c.related_group_id] = { id: c.id, last_message_at: c.last_message_at };
  });

  // Last message preview per conversation (best-effort, single query).
  const convIds = Object.values(convByGroup).map((c) => c.id);
  const lastMsgByConv: Record<string, string> = {};
  if (convIds.length > 0) {
    const { data: msgs } = await supabase
      .from("messages")
      .select("conversation_id, content, message_type, created_at")
      .in("conversation_id", convIds)
      .order("created_at", { ascending: false })
      .limit(200);
    (msgs ?? []).forEach((m: { conversation_id: string; content: string | null; message_type: string | null }) => {
      if (lastMsgByConv[m.conversation_id]) return;
      lastMsgByConv[m.conversation_id] =
        m.message_type === "cta"
          ? "Shared a plan"
          : m.message_type === "image"
            ? "Photo"
            : (m.content ?? "").slice(0, 80);
    });
  }

  const rows: GroupSummary[] = (groupsRes.data ?? []).map((g: Record<string, unknown>) => {
    const gid = g.id as string;
    const conv = convByGroup[gid];
    return {
      id: gid,
      name: (g.name as string) ?? "Group",
      mode: (g.mode as Mode) ?? "friends",
      description: (g.description as string) ?? null,
      avatar_url: (g.avatar_url as string) ?? null,
      created_by: g.created_by as string,
      max_members: (g.max_members as number) ?? 8,
      member_count: counts[gid] ?? 1,
      conversation_id: conv?.id ?? null,
      last_message_preview: conv ? (lastMsgByConv[conv.id] ?? null) : null,
      last_message_at: conv?.last_message_at ?? null,
    };
  });

  rows.sort((a, b) => {
    const ta = a.last_message_at ? Date.parse(a.last_message_at) : 0;
    const tb = b.last_message_at ? Date.parse(b.last_message_at) : 0;
    return tb - ta;
  });
  return rows;
}

/** Members of a group, joined to user_profiles for display. */
export async function getGroupMembers(groupId: string): Promise<GroupMember[]> {
  const { data: rows, error } = await supabase
    .from("group_members")
    .select("user_id, role, joined_at")
    .eq("group_id", groupId)
    .order("joined_at", { ascending: true });
  if (error || !rows?.length) return [];

  const ids = [...new Set(rows.map((r: { user_id: string }) => r.user_id))];
  const { data: profiles } = await supabase
    .from("user_profiles")
    .select("id, first_name, last_name, main_photo_url, city")
    .in("id", ids);

  const byId: Record<string, { first_name?: string; last_name?: string; main_photo_url?: string; city?: string }> = {};
  (profiles ?? []).forEach((p: Record<string, unknown>) => {
    byId[p.id as string] = {
      first_name: p.first_name as string | undefined,
      last_name: p.last_name as string | undefined,
      main_photo_url: p.main_photo_url as string | undefined,
      city: p.city as string | undefined,
    };
  });

  return rows.map((r: { user_id: string; role: string; joined_at: string }) => {
    const p = byId[r.user_id] ?? {};
    const name = [p.first_name, p.last_name].filter(Boolean).join(" ").trim() || "Member";
    return {
      user_id: r.user_id,
      role: r.role,
      joined_at: r.joined_at,
      display_name: name,
      avatar_url: p.main_photo_url ?? null,
      city: p.city ?? null,
    };
  });
}

/** Group details + whether the current user is the admin (creator). */
export async function getGroupDetails(groupId: string): Promise<GroupDetails | null> {
  const { data: auth } = await supabase.auth.getUser();
  const me = auth.user?.id;

  const { data: g, error } = await supabase
    .from("groups")
    .select("id, name, mode, description, avatar_url, created_by, max_members, invite_code")
    .eq("id", groupId)
    .single();
  if (error || !g) return null;

  const { count } = await supabase
    .from("group_members")
    .select("user_id", { count: "exact", head: true })
    .eq("group_id", groupId);

  return {
    id: g.id as string,
    name: (g.name as string) ?? "Group",
    mode: (g.mode as Mode) ?? "friends",
    description: (g.description as string) ?? null,
    avatar_url: (g.avatar_url as string) ?? null,
    created_by: g.created_by as string,
    max_members: (g.max_members as number) ?? 8,
    member_count: count ?? 1,
    is_admin: !!me && g.created_by === me,
    invite_code: (g.invite_code as string) ?? null,
  };
}

/** Remove a member (admin/creator only — enforced by RLS). */
export async function removeGroupMember(groupId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from("group_members")
    .delete()
    .eq("group_id", groupId)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);

  // keep the chat membership in sync
  const { data: conv } = await supabase
    .from("conversations")
    .select("id")
    .eq("type", "group")
    .eq("related_group_id", groupId)
    .maybeSingle();
  if (conv?.id) {
    await supabase
      .from("conversation_members")
      .update({ left_at: new Date().toISOString() })
      .eq("conversation_id", conv.id)
      .eq("user_id", userId);
  }
}

/** Leave a group (removes the current user's membership + chat membership). */
export async function leaveGroup(groupId: string): Promise<void> {
  const { data: auth } = await supabase.auth.getUser();
  const me = auth.user?.id;
  if (!me) throw new Error("Not signed in");
  await removeGroupMember(groupId, me);
}

/** Ensure a shareable invite code exists for the group (creator only). */
export async function ensureGroupInviteCode(groupId: string): Promise<string> {
  const { data, error } = await supabase.rpc("ensure_group_invite_code", { p_group_id: groupId });
  if (error) throw new Error(error.message);
  return String(data);
}

/** Join a group via its shareable code. Throws a friendly error when full. */
export async function joinGroupByCode(code: string): Promise<string> {
  const { data, error } = await supabase.rpc("join_group_by_code", { p_code: code });
  if (error) {
    if (isGroupFullError(error)) throw new Error(FULL_HINT);
    throw new Error(error.message);
  }
  return String(data);
}

// ---------------------------------------------------------------------------
// Vibe Check (TB-2.2)
// ---------------------------------------------------------------------------

export type GroupVibeMood = "chill" | "active" | "foodie" | "social" | "budget" | "fancy";

export type GroupVibeSnapshot = {
  mood_counts: Record<string, number>;
  notes: string[];
  responders: number;
};

/** Upsert the current user's vibe for a conversation (used right before group planning). */
export async function setGroupVibe(params: {
  conversationId: string;
  mood: GroupVibeMood;
  energy?: number | null;
  note?: string | null;
}): Promise<void> {
  const { data: auth } = await supabase.auth.getUser();
  const me = auth.user?.id;
  if (!me) throw new Error("Not signed in");

  const { error } = await supabase
    .from("group_plan_vibes")
    .upsert(
      {
        conversation_id: params.conversationId,
        user_id: me,
        mood: params.mood,
        energy: params.energy ?? null,
        note: params.note?.trim() || null,
        created_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString(),
      },
      { onConflict: "conversation_id,user_id" }
    );
  if (error) throw new Error(error.message);
}

/** Aggregate the (non-expired) vibes for a conversation into a small snapshot. */
export async function getGroupVibeSnapshot(conversationId: string): Promise<GroupVibeSnapshot> {
  const { data, error } = await supabase
    .from("group_plan_vibes")
    .select("mood, note, expires_at")
    .eq("conversation_id", conversationId)
    .gt("expires_at", new Date().toISOString());

  const snapshot: GroupVibeSnapshot = { mood_counts: {}, notes: [], responders: 0 };
  if (error || !data?.length) return snapshot;

  for (const row of data as { mood: string; note: string | null }[]) {
    snapshot.responders += 1;
    snapshot.mood_counts[row.mood] = (snapshot.mood_counts[row.mood] ?? 0) + 1;
    if (row.note && row.note.trim()) snapshot.notes.push(row.note.trim());
  }
  return snapshot;
}

// ---------------------------------------------------------------------------
// "Bring a friend" smart suggestion (TB-3.2)
// ---------------------------------------------------------------------------

export type BringAFriendSuggestion = {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  shared_interest: string;
};

/**
 * Suggest 1–2 of the current user's Friends connections who share interests with
 * the group's aggregate interest set but aren't members yet.
 */
export async function getBringAFriendSuggestions(groupId: string, limit = 2): Promise<BringAFriendSuggestion[]> {
  const { data: auth } = await supabase.auth.getUser();
  const me = auth.user?.id;
  if (!me) return [];

  const { data: members } = await supabase.from("group_members").select("user_id").eq("group_id", groupId);
  const memberIds = new Set((members ?? []).map((m: { user_id: string }) => m.user_id));
  if (memberIds.size === 0) return [];

  // Group's aggregate interest set (from members' friend profiles).
  const { data: memberProfiles } = await supabase
    .from("friend_profiles")
    .select("user_id, interests")
    .in("user_id", [...memberIds]);
  const groupInterests = new Set<string>();
  (memberProfiles ?? []).forEach((p: { interests?: string[] | null }) => {
    (p.interests ?? []).forEach((i) => i && groupInterests.add(i.toLowerCase()));
  });
  if (groupInterests.size === 0) return [];

  // Candidate pool: my Friends connections who aren't already members.
  const connections = await getPartnersForConcierge("friends");
  const candidateIds = connections.map((c) => c.id).filter((id) => !memberIds.has(id));
  if (candidateIds.length === 0) return [];

  const { data: myConns } = await supabase
    .from("friend_profiles")
    .select("user_id, display_name, first_name, last_name, main_photo_url, avatar_url, interests")
    .in("user_id", candidateIds)
    .limit(80);

  const scored: BringAFriendSuggestion[] = [];
  (myConns ?? []).forEach((c: Record<string, unknown>) => {
    const uid = c.user_id as string;
    if (!uid || memberIds.has(uid)) return;
    const interests = (c.interests as string[] | null) ?? [];
    const shared = interests.find((i) => i && groupInterests.has(i.toLowerCase()));
    if (!shared) return;
    const name =
      (c.display_name as string) ||
      [c.first_name, c.last_name].filter(Boolean).join(" ").trim() ||
      "Friend";
    scored.push({
      user_id: uid,
      display_name: name,
      avatar_url: ((c.main_photo_url as string) ?? (c.avatar_url as string)) ?? null,
      shared_interest: shared,
    });
  });

  return scored.slice(0, limit);
}

/** Render a short prose summary of a vibe snapshot for injection into the planning prompt. */
export function formatVibeSnapshotForPrompt(snapshot: GroupVibeSnapshot): string | null {
  if (snapshot.responders === 0) return null;
  const moods = Object.entries(snapshot.mood_counts)
    .sort((a, b) => b[1] - a[1])
    .map(([mood, n]) => `${mood} (${n})`)
    .join(", ");
  let out = `Group vibe today (${snapshot.responders} responded): ${moods}.`;
  if (snapshot.notes.length > 0) {
    out += ` Notes: ${snapshot.notes.slice(0, 5).join("; ")}.`;
  }
  return out;
}
