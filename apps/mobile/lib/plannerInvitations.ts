/**
 * Planner invitations — create, accept, decline, list
 * Used for "Invite on date/meet-up/meeting" from 1:1 chat.
 */

import { supabase } from "@/lib/supabase";
import { requestPeerPushNotification } from "@/lib/push/winklyPush";
import { recordPairBehaviorSignal } from "@/lib/matching/behaviorSignals";
import { syncPlannerItemToDeviceCalendar } from "@/lib/integrations/calendarSync";
import { ensureConfirmedEventForPlannerItem, triggerCloudCalendarSync } from "@/lib/integrations/confirmedEvents";
import type { Mode } from "@/types";

/** Fire-and-forget: register the confirmed-plan bookkeeping row, then ask the cloud sync
 * function to push it to whichever calendars (Google/Outlook) the participant has connected. */
function syncCloudCalendar(input: {
  plannerItemId: string;
  creatorId: string;
  participantUserId: string;
  title: string;
  startsAt: string;
  endsAt?: string | null;
}): void {
  void (async () => {
    const confirmedEventId = await ensureConfirmedEventForPlannerItem(input);
    if (confirmedEventId) await triggerCloudCalendarSync(confirmedEventId);
  })();
}

/** Pulls a best-guess location string out of a planner item's free-form payload/meta. */
function derivePlannerLocation(payload: {
  location?: string;
  place?: string;
  item_meta?: Record<string, unknown> | null;
}): string | null {
  if (payload.location) return payload.location;
  if (payload.place) return payload.place;
  const meta = payload.item_meta;
  if (meta && typeof meta === "object") {
    const loc = meta.location ?? meta.place ?? meta.venue_name;
    if (typeof loc === "string" && loc) return loc;
  }
  return null;
}

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
  /** When set, stored as `planner_items.meta` (e.g. per-day trip slots). */
  item_meta?: Record<string, unknown> | null;
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
      meta:
        payload.item_meta != null && Object.keys(payload.item_meta).length > 0
          ? payload.item_meta
          : payload.activity || payload.location || payload.place
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

  void syncPlannerItemToDeviceCalendar({
    plannerItemId: item.id,
    userId,
    title: payload.title,
    description: payload.description ?? null,
    location: derivePlannerLocation(payload),
    startsAt: payload.starts_at,
    endsAt: payload.ends_at ?? null,
  });
  syncCloudCalendar({
    plannerItemId: item.id,
    creatorId: userId,
    participantUserId: userId,
    title: payload.title,
    startsAt: payload.starts_at,
    endsAt: payload.ends_at ?? null,
  });

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
      meta:
        payload.item_meta != null && Object.keys(payload.item_meta).length > 0
          ? payload.item_meta
          : payload.activity || payload.location || payload.place
            ? { activity: payload.activity, location: payload.location, place: payload.place }
            : null,
    })
    .select("id")
    .single();

  if (itemError || !item) throw new Error(itemError?.message ?? "Failed to create planner item");

  // Seed participant rows for BOTH sides up front. The invitee gets the lightweight
  // "invitee" role (upgraded to "attendee" on accept) so the proposed item is readable
  // by the recipient immediately — RLS allows a participant (and, defensively, an
  // invitee on the invitation) to SELECT the planner_item.
  const { error: partError } = await supabase.from("planner_participants").insert([
    { planner_item_id: item.id, user_id: inviterId, role: "owner" },
    { planner_item_id: item.id, user_id: inviteeId, role: "invitee" },
  ]);
  if (partError) throw new Error(partError.message);

  // Only the inviter has a real commitment yet — the invitee's row is still "invitee"
  // (pending), so it isn't synced to their calendar until they accept.
  void syncPlannerItemToDeviceCalendar({
    plannerItemId: item.id,
    userId: inviterId,
    title: payload.title,
    description: payload.description ?? null,
    location: derivePlannerLocation(payload),
    startsAt: payload.starts_at,
    endsAt: payload.ends_at ?? null,
  });
  syncCloudCalendar({
    plannerItemId: item.id,
    creatorId: inviterId,
    participantUserId: inviterId,
    title: payload.title,
    startsAt: payload.starts_at,
    endsAt: payload.ends_at ?? null,
  });

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

  void requestPeerPushNotification({
    kind: "planner_invitation",
    recipientUserId: inviteeId,
    title: "Planner invitation",
    body: `${payload.title} — tap to respond.`,
    conversationId,
    plannerInvitationId: inv.id,
    data: {
      planner_invitation_id: inv.id,
      planner_item_id: item.id,
      conversation_id: conversationId,
    },
  });

  const mode = payload.source_mode;
  if (mode === "romance" || mode === "friends" || mode === "business") {
    void recordPairBehaviorSignal({
      partnerUserId: inviteeId,
      mode,
      kind: "planner_from_chat",
      payload: { conversation_id: conversationId },
    });
  }

  return { planner_item_id: item.id, planner_invitation_id: inv.id };
}

export type AcceptPlannerInviteResult = {
  planner_item_id: string;
  source_mode: string;
  starts_at: string;
  partner_user_id: string;
};

/** Accept: add invitee to planner_participants and set invitation status. */
export async function acceptPlannerInvite(invitationId: string): Promise<AcceptPlannerInviteResult> {
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) throw new Error("Not signed in");

  const { data: inv, error: fetchErr } = await supabase
    .from("planner_invitations")
    .select("planner_item_id, invitee_id, inviter_id, status")
    .eq("id", invitationId)
    .single();

  if (fetchErr || !inv) throw new Error("Invitation not found");
  if (inv.invitee_id !== uid) throw new Error("You are not the invitee");
  if (inv.status !== "pending") throw new Error("Invitation is no longer pending");

  const { data: itemRow } = await supabase
    .from("planner_items")
    .select("source_mode, title, description, starts_at, ends_at, meta")
    .eq("id", inv.planner_item_id)
    .maybeSingle();

  const { error: updateErr } = await supabase
    .from("planner_invitations")
    .update({ status: "accepted", updated_at: new Date().toISOString() })
    .eq("id", invitationId);

  if (updateErr) throw new Error(updateErr.message);

  // Upsert: createPlannerInvite already seeds an "invitee" row for the recipient, so
  // accepting upgrades that row to "attendee" rather than violating the
  // (planner_item_id, user_id) unique constraint.
  const { error: insertErr } = await supabase
    .from("planner_participants")
    .upsert(
      { planner_item_id: inv.planner_item_id, user_id: uid, role: "attendee" },
      { onConflict: "planner_item_id,user_id" }
    );
  if (insertErr) throw new Error(insertErr.message);

  const typedItemRow = itemRow as {
    title?: string;
    description?: string | null;
    starts_at?: string;
    ends_at?: string | null;
    meta?: Record<string, unknown> | null;
  } | null;

  if (typedItemRow?.starts_at) {
    void syncPlannerItemToDeviceCalendar({
      plannerItemId: inv.planner_item_id,
      userId: uid,
      title: typedItemRow.title ?? "Plan",
      description: typedItemRow.description ?? null,
      location: derivePlannerLocation({ item_meta: typedItemRow.meta ?? null }),
      startsAt: typedItemRow.starts_at,
      endsAt: typedItemRow.ends_at ?? null,
    });
    syncCloudCalendar({
      plannerItemId: inv.planner_item_id,
      creatorId: inv.inviter_id,
      participantUserId: uid,
      title: typedItemRow.title ?? "Plan",
      startsAt: typedItemRow.starts_at,
      endsAt: typedItemRow.ends_at ?? null,
    });
  }

  const itemTitle = (itemRow as { title?: string } | null)?.title ?? "your plan";
  let accepterName = "Someone";
  const { data: accepterProfile } = await supabase
    .from("user_profiles")
    .select("first_name")
    .eq("id", uid)
    .maybeSingle();
  if ((accepterProfile as { first_name?: string | null } | null)?.first_name) {
    accepterName = (accepterProfile as { first_name: string }).first_name;
  }

  void requestPeerPushNotification({
    kind: "planner_response",
    recipientUserId: inv.inviter_id,
    title: "Date confirmed 🎉",
    body: `${accepterName} accepted: ${itemTitle}`,
    plannerInvitationId: invitationId,
    data: {
      planner_invitation_id: invitationId,
      planner_item_id: inv.planner_item_id,
      response: "accepted",
    },
  });

  const sm = (itemRow as { source_mode?: string } | null)?.source_mode;
  if (sm === "romance" || sm === "friends" || sm === "business") {
    void recordPairBehaviorSignal({
      partnerUserId: inv.inviter_id,
      mode: sm,
      kind: "invite_accepted",
    });
  }

  const startsAt = (itemRow as { starts_at?: string } | null)?.starts_at ?? new Date().toISOString();
  return {
    planner_item_id: inv.planner_item_id,
    source_mode: sm ?? "romance",
    starts_at: startsAt,
    partner_user_id: inv.inviter_id,
  };
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
