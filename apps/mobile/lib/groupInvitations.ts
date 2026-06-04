/**
 * Group chat invitations: create group with invites; invitee Accept/Decline.
 * No one is auto-added to group chats — safe invite flow.
 */

import { supabase } from "@/lib/supabase";
import { ensureGroupConversation } from "@/lib/groups/groupChat";
import type { Mode } from "@/types";

export type GroupInvitationRow = {
  id: string;
  group_id: string;
  inviter_id: string;
  invitee_id: string;
  status: "pending" | "accepted" | "declined";
  created_at: string;
  group_name?: string;
  inviter_display_name?: string;
  invited_user_ids?: string[];
};

/**
 * Create a group and send invitations to selected user IDs.
 * Creator is added to group_members; invitees get group_invitations (pending).
 */
export async function createGroupWithInvites(params: {
  name: string;
  mode: Mode;
  description?: string;
  inviteeUserIds: string[];
}): Promise<{ groupId: string }> {
  const { data: auth } = await supabase.auth.getUser();
  const me = auth.user?.id;
  if (!me) throw new Error("Not signed in");

  const { data: group, error: groupErr } = await supabase
    .from("groups")
    .insert({
      created_by: me,
      name: params.name.trim(),
      mode: params.mode,
      ...(params.description != null && params.description !== "" && { description: params.description }),
    })
    .select("id")
    .single();

  if (groupErr || !group) throw new Error(groupErr?.message ?? "Could not create group");
  const groupId = group.id as string;

  await supabase.from("group_members").insert({
    group_id: groupId,
    user_id: me,
    role: "admin",
  });

  const uniqueInvitees = [...new Set(params.inviteeUserIds)].filter((id) => id !== me);
  if (uniqueInvitees.length > 0) {
    const { error: invErr } = await supabase.from("group_invitations").insert(
      uniqueInvitees.map((invitee_id) => ({
        group_id: groupId,
        inviter_id: me,
        invitee_id,
        status: "pending",
      }))
    );
    if (invErr) throw new Error(invErr.message);
  }

  await ensureGroupConversation(groupId);

  return { groupId };
}

/**
 * List pending group invitations for the current user (invitee).
 */
export async function getMyPendingGroupInvitations(): Promise<GroupInvitationRow[]> {
  const { data: auth } = await supabase.auth.getUser();
  const me = auth.user?.id;
  if (!me) return [];

  const { data: rows, error } = await supabase
    .from("group_invitations")
    .select("id, group_id, inviter_id, invitee_id, status, created_at")
    .eq("invitee_id", me)
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  if (error || !rows?.length) return [];

  const groupIds = [...new Set(rows.map((r) => r.group_id))];
  const inviterIds = [...new Set(rows.map((r) => r.inviter_id))];

  const [groupsRes, inviterProfilesRes] = await Promise.all([
    supabase.from("groups").select("id, name").in("id", groupIds),
    supabase.from("user_profiles").select("id, first_name, last_name").in("id", inviterIds),
  ]);

  const groupNames: Record<string, string> = {};
  (groupsRes.data ?? []).forEach((g: { id: string; name: string }) => {
    groupNames[g.id] = g.name ?? "Group";
  });
  const inviterNames: Record<string, string> = {};
  (inviterProfilesRes.data ?? []).forEach((p: { id: string; first_name?: string; last_name?: string }) => {
    const n = [p.first_name, p.last_name].filter(Boolean).join(" ").trim() || "Someone";
    inviterNames[p.id] = n;
  });

  const inviteeIdsByGroup: Record<string, string[]> = {};
  if (groupIds.length > 0) {
    const { data: allInvs } = await supabase
      .from("group_invitations")
      .select("group_id, invitee_id")
      .in("group_id", groupIds)
      .eq("status", "pending");
    (allInvs ?? []).forEach((row: { group_id: string; invitee_id: string }) => {
      if (!inviteeIdsByGroup[row.group_id]) inviteeIdsByGroup[row.group_id] = [];
      if (row.invitee_id !== me && !inviteeIdsByGroup[row.group_id].includes(row.invitee_id)) {
        inviteeIdsByGroup[row.group_id].push(row.invitee_id);
      }
    });
  }

  return rows.map((r: Record<string, unknown>) => ({
    id: r.id as string,
    group_id: r.group_id as string,
    inviter_id: r.inviter_id as string,
    invitee_id: r.invitee_id as string,
    status: r.status as "pending" | "accepted" | "declined",
    created_at: r.created_at as string,
    group_name: groupNames[r.group_id as string],
    inviter_display_name: inviterNames[r.inviter_id as string],
    invited_user_ids: inviteeIdsByGroup[r.group_id as string] ?? [],
  }));
}

/**
 * Accept a group invitation: add user to group_members and mark invitation accepted.
 */
export async function acceptGroupInvite(invitationId: string): Promise<void> {
  const { data: auth } = await supabase.auth.getUser();
  const me = auth.user?.id;
  if (!me) throw new Error("Not signed in");

  const { data: inv, error: fetchErr } = await supabase
    .from("group_invitations")
    .select("group_id, invitee_id")
    .eq("id", invitationId)
    .eq("invitee_id", me)
    .eq("status", "pending")
    .single();

  if (fetchErr || !inv) throw new Error("Invitation not found or already responded");

  const { error: updateErr } = await supabase
    .from("group_invitations")
    .update({ status: "accepted", updated_at: new Date().toISOString() })
    .eq("id", invitationId)
    .eq("invitee_id", me);

  if (updateErr) throw new Error(updateErr.message);

  const { error: memberErr } = await supabase.from("group_members").insert({
    group_id: inv.group_id,
    user_id: me,
    role: "member",
  });

  if (memberErr) throw new Error(memberErr.message);

  await ensureGroupConversation(inv.group_id as string);
}

/**
 * Decline a group invitation.
 */
export async function declineGroupInvite(invitationId: string): Promise<void> {
  const { data: auth } = await supabase.auth.getUser();
  const me = auth.user?.id;
  if (!me) throw new Error("Not signed in");

  const { error } = await supabase
    .from("group_invitations")
    .update({ status: "declined", updated_at: new Date().toISOString() })
    .eq("id", invitationId)
    .eq("invitee_id", me);

  if (error) throw new Error(error.message);
}
