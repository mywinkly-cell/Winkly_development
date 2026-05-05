/**
 * Planner invitations — create, accept, decline, list
 * Used for "Invite on date/meet-up/meeting" from 1:1 chat.
 */

import { supabase } from "@/lib/supabase";
import type { Mode } from "@/types";

export type PlannerInvitationStatus = "pending" | "accepted" | "declined" | "reschedule";

export type PlannerInvitePayload = {
  title: string;
  description?: string;
  source_mode: Mode;
  starts_at: string; // ISO
  ends_at?: string; // ISO
  activity?: string;
  location?: string;
  place?: string;
};

export type PlannerInvitationRow = {
  id: string;
  planner_item_id: string;
  inviter_id: string;
  invitee_id: string;
  status: PlannerInvitationStatus;
  created_at: string;
  updated_at: string;
};

export type PlannerInvitationWithItem = PlannerInvitationRow & {
  planner_item: {
    id: string;
    title: string;
    description: string | null;
    starts_at: string;
    ends_at: string | null;
    source_mode: string;
    meta: Record<string, unknown> | null;
    created_by: string;
  };
  inviter?: { id: string; first_name: string | null };
};

/** Create a planner item for self only (no invite). Used when user adds a concierge-suggested plan without inviting anyone. */
export async function createPlannerItemForSelf(
  userId: string,
  payload: Omit<PlannerInvitePayload, "source_mode"> & { source_mode: Mode }
): Promise<string> {
  const { data: item, error: itemError } = await supabase
    .from("planner_items")
    .insert({
      created_by: userId,
      source_mode: payload.source_mode,
      title: payload.title,
      description: payload.description ?? null,
      starts_at: payload.starts_at,
      ends_at: payload.ends_at ?? null,
      meta: payload.activity || payload.location || payload.place
        ? { activity: payload.activity, location: payload.location, place: payload.place }
        : null,
    })
    .select("id")
    .single();

  if (itemError || !item) throw new Error(itemError?.message ?? "Failed to create planner item");

  const { error: partError } = await supabase.from("planner_participants").insert({
    planner_item_id: item.id,
    user_id: userId,
    role: "owner",
  });
  if (partError) throw new Error(partError.message);

  return item.id;
}

/** Create a planner item and invitation; add inviter as participant. Returns item id and invitation id for CTA message. */
export async function createPlannerInvite(
  inviterId: string,
  inviteeId: string,
  conversationId: string,
  payload: PlannerInvitePayload
): Promise<{ planner_item_id: string; planner_invitation_id: string }> {
  const { data: item, error: itemError } = await supabase
    .from("planner_items")
    .insert({
      created_by: inviterId,
      source_mode: payload.source_mode,
      related_user_id: inviteeId,
      title: payload.title,
      description: payload.description ?? null,
      starts_at: payload.starts_at,
      ends_at: payload.ends_at ?? null,
      meta: payload.activity || payload.location || payload.place
        ? { activity: payload.activity, location: payload.location, place: payload.place }
        : null,
    })
    .select("id")
    .single();

  if (itemError || !item) throw new Error(itemError?.message ?? "Failed to create planner item");

  const { error: partError } = await supabase.from("planner_participants").insert({
    planner_item_id: item.id,
    user_id: inviterId,
    role: "owner",
  });
  if (partError) throw new Error(partError.message);

  const { data: inv, error: invError } = await supabase
    .from("planner_invitations")
    .insert({
      planner_item_id: item.id,
      inviter_id: inviterId,
      invitee_id: inviteeId,
      status: "pending",
    })
    .select("id")
    .single();

  if (invError || !inv) throw new Error(invError?.message ?? "Failed to create invitation");

  return { planner_item_id: item.id, planner_invitation_id: inv.id };
}

/** Accept: add invitee to planner_participants and set invitation status. */
export async function acceptPlannerInvite(invitationId: string): Promise<void> {
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) throw new Error("Not signed in");

  const { data: inv, error: fetchErr } = await supabase
    .from("planner_invitations")
    .select("planner_item_id, invitee_id, status")
    .eq("id", invitationId)
    .single();

  if (fetchErr || !inv) throw new Error("Invitation not found");
  if (inv.invitee_id !== uid) throw new Error("You are not the invitee");
  if (inv.status !== "pending") throw new Error("Invitation is no longer pending");

  const { error: updateErr } = await supabase
    .from("planner_invitations")
    .update({ status: "accepted", updated_at: new Date().toISOString() })
    .eq("id", invitationId);

  if (updateErr) throw new Error(updateErr.message);

  const { error: insertErr } = await supabase.from("planner_participants").insert({
    planner_item_id: inv.planner_item_id,
    user_id: uid,
    role: "attendee",
  });
  if (insertErr) throw new Error(insertErr.message);
}

/** Decline: set invitation status only. */
export async function declinePlannerInvite(invitationId: string): Promise<void> {
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) throw new Error("Not signed in");

  const { data: inv } = await supabase
    .from("planner_invitations")
    .select("invitee_id, status")
    .eq("id", invitationId)
    .single();

  if (!inv || inv.invitee_id !== uid) throw new Error("Invitation not found or not yours");
  if (inv.status !== "pending") return;

  const { error } = await supabase
    .from("planner_invitations")
    .update({ status: "declined", updated_at: new Date().toISOString() })
    .eq("id", invitationId);

  if (error) throw new Error(error.message);
}

/** Propose reschedule: set status so inviter sees; details can be discussed in chat. */
export async function reschedulePlannerInvite(invitationId: string): Promise<void> {
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) throw new Error("Not signed in");

  const { data: inv } = await supabase
    .from("planner_invitations")
    .select("invitee_id, status")
    .eq("id", invitationId)
    .single();

  if (!inv || inv.invitee_id !== uid) throw new Error("Invitation not found or not yours");
  if (inv.status !== "pending") return;

  const { error } = await supabase
    .from("planner_invitations")
    .update({ status: "reschedule", updated_at: new Date().toISOString() })
    .eq("id", invitationId);

  if (error) throw new Error(error.message);
}

/** List invitations for the current user (as invitee). Pending first. */
export async function getPlannerInvitationsForUser(): Promise<PlannerInvitationWithItem[]> {
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) return [];

  const { data: rows, error } = await supabase
    .from("planner_invitations")
    .select(
      `
      id, planner_item_id, inviter_id, invitee_id, status, created_at, updated_at,
      planner_item:planner_items(id, title, description, starts_at, ends_at, source_mode, meta, created_by)
    `
    )
    .eq("invitee_id", uid)
    .order("created_at", { ascending: false });

  if (error) return [];

  const withInviter = await Promise.all(
    (rows ?? []).map(async (r: Record<string, unknown>) => {
      const inviterId = r.inviter_id as string;
      const { data: profile } = await supabase
        .from("user_profiles")
        .select("first_name")
        .eq("id", inviterId)
        .single();
      return {
        ...r,
        inviter: profile ? { id: inviterId, first_name: (profile as { first_name: string | null }).first_name } : undefined,
      };
    })
  );

  return withInviter as PlannerInvitationWithItem[];
}
