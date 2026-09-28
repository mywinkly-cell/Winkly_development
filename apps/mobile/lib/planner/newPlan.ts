// apps/mobile/lib/planner/newPlan.ts
// "+ New plan" — add something to the Planner yourself, like in any calendar, with or
// without Winkly AI. Also the landing point for ideas from elsewhere: an event from the
// Events catalogue, a sponsored venue, a place from the wishlist, or "Plan together" in a
// chat — each opens the same form, pre-filled, where you choose who it's for.

import type { Href } from "expo-router";
import { supabase } from "@/lib/supabase";
import { createPlannerInvite, createPlannerItemForSelf } from "@/lib/plannerInvitations";
import { sendMessage } from "@/lib/chats/api";
import type { Mode } from "@/types";

/** Who the plan is for → planner_items.source_mode. "self" = just me (Events tab). */
export type PlanAudience = "self" | "romance" | "friends" | "business";

export function audienceToSourceMode(a: PlanAudience): Mode {
  return a === "self" ? "events" : a;
}

export type NewPlanPrefill = {
  title?: string;
  /** ISO start; the form rounds a missing/past start to the next full hour. */
  startsAt?: string | null;
  endsAt?: string | null;
  location?: string | null;
  notes?: string | null;
  imageUrl?: string | null;
  placeId?: string | null;
  /** Events catalogue item id (booking options are copied into the plan). */
  catalogId?: string | null;
  wishlistId?: string | null;
  sponsoredOfferId?: string | null;
  audience?: PlanAudience;
  partnerUserId?: string | null;
  partnerName?: string | null;
  conversationId?: string | null;
  /** Where the form was opened from (analytics + meta). */
  source?: "manual" | "catalog" | "sponsored" | "wishlist" | "chat";
};

type Params = Record<string, string>;

/** Route to the form with a prefill (strings only — expo-router params). */
export function newPlanHref(p: NewPlanPrefill = {}): Href {
  const params: Params = {};
  const put = (k: string, v: string | null | undefined) => {
    if (typeof v === "string" && v.trim()) params[k] = v.trim().slice(0, 500);
  };
  put("title", p.title);
  put("starts_at", p.startsAt);
  put("ends_at", p.endsAt);
  put("location", p.location);
  put("notes", p.notes);
  put("image_url", p.imageUrl);
  put("place_id", p.placeId);
  put("catalog_id", p.catalogId);
  put("wishlist_id", p.wishlistId);
  put("sponsored_offer_id", p.sponsoredOfferId);
  put("audience", p.audience);
  put("partner_user_id", p.partnerUserId);
  put("partner_name", p.partnerName);
  put("conversation_id", p.conversationId);
  put("source", p.source);
  return { pathname: "/plan/new", params } as Href;
}

/** Parse route params back into a prefill (defensive: params are user-controllable deep links). */
export function parseNewPlanParams(raw: Record<string, string | string[] | undefined>): NewPlanPrefill {
  const get = (k: string): string | null => {
    const v = raw[k];
    const s = Array.isArray(v) ? v[0] : v;
    return typeof s === "string" && s.trim() ? s.trim().slice(0, 500) : null;
  };
  const audience = get("audience");
  const source = get("source");
  const iso = (v: string | null) => (v && !Number.isNaN(Date.parse(v)) ? v : null);
  return {
    title: get("title") ?? undefined,
    startsAt: iso(get("starts_at")),
    endsAt: iso(get("ends_at")),
    location: get("location"),
    notes: get("notes"),
    imageUrl: get("image_url")?.startsWith("https://") ? get("image_url") : null,
    placeId: get("place_id"),
    catalogId: get("catalog_id"),
    wishlistId: get("wishlist_id"),
    sponsoredOfferId: get("sponsored_offer_id"),
    audience:
      audience === "self" || audience === "romance" || audience === "friends" || audience === "business"
        ? audience
        : undefined,
    partnerUserId: get("partner_user_id"),
    partnerName: get("partner_name"),
    conversationId: get("conversation_id"),
    source:
      source === "catalog" || source === "sponsored" || source === "wishlist" || source === "chat" ? source : "manual",
  };
}

/** Next full hour from now (the default start for a new plan). */
export function nextFullHour(now = new Date()): Date {
  const d = new Date(now);
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + 1);
  return d;
}

export type SaveNewPlanInput = {
  title: string;
  audience: PlanAudience;
  startsAt: Date;
  endsAt: Date | null;
  location: string;
  notes: string;
  /** Extra planner_items.meta (photo, place id, booking options, origin). */
  meta: Record<string, unknown>;
  /** Invite this person (needs the 1:1 conversation it's sent in). */
  invite?: { userId: string; conversationId: string } | null;
};

export type SaveNewPlanResult = { plannerItemId: string; invitationId: string | null };

/** Validation errors are i18n keys so the screen can show them translated. */
export function validateNewPlan(input: Pick<SaveNewPlanInput, "title" | "startsAt" | "endsAt">): string | null {
  if (!input.title.trim()) return "newPlan.errorTitle";
  if (Number.isNaN(input.startsAt.getTime())) return "newPlan.errorStart";
  if (input.endsAt && input.endsAt.getTime() <= input.startsAt.getTime()) return "newPlan.errorEnd";
  return null;
}

/** Create the planner item (and invitation) — calendar sync is handled by the helpers. */
export async function saveNewPlan(input: SaveNewPlanInput): Promise<SaveNewPlanResult> {
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) throw new Error("not_signed_in");

  const location = input.location.trim();
  const meta: Record<string, unknown> = {
    ...input.meta,
    ...(location ? { location } : {}),
    created_manually: true,
  };
  const payload = {
    title: input.title.trim().slice(0, 140),
    description: input.notes.trim() || undefined,
    source_mode: audienceToSourceMode(input.audience),
    starts_at: input.startsAt.toISOString(),
    ends_at: input.endsAt ? input.endsAt.toISOString() : undefined,
    location: location || undefined,
    item_meta: meta,
  };

  if (input.invite?.userId && input.invite.conversationId) {
    const res = await createPlannerInvite(uid, input.invite.userId, input.invite.conversationId, payload);
    // Same invitation card the chat's own "Invite to plan" posts, so the other person can accept there.
    await sendMessage(
      input.invite.conversationId,
      uid,
      JSON.stringify({
        type: "planner_invite",
        planner_item_id: res.planner_item_id,
        planner_invitation_id: res.planner_invitation_id,
        title: payload.title,
        activity: payload.title,
        location: location || null,
        place: null,
        starts_at: payload.starts_at,
        ends_at: payload.ends_at ?? null,
        source_mode: payload.source_mode,
      }),
      [],
      { messageType: "cta" }
    ).catch(() => undefined);
    return { plannerItemId: res.planner_item_id, invitationId: res.planner_invitation_id };
  }
  const id = await createPlannerItemForSelf(uid, payload);
  return { plannerItemId: id, invitationId: null };
}
