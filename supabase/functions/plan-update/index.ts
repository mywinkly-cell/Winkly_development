// plan-update — change a plan for everyone involved, in one place:
//
//   POST { planner_item_id, action, reason?, starts_at?, ends_at? }
//     action = "cancel"      organiser: the plan is off for everyone
//                            participant: "can't make it" — only they drop out
//            | "reschedule"  organiser: new start (and end) for everyone
//            | "restore"     organiser: a cancelled plan is back on
//            | "notify"      anyone in the plan: a heads-up to the others (e.g. weather)
//
// For each change it: updates the plan, records it in plan_changes (with the optional
// reason), updates or removes the plan in connected Google / Outlook calendars, and tells
// the OTHER participants — push in their own language + a card in your shared chat.
// A plan with nobody else in it (e.g. a joined public event, which is each user's own copy)
// notifies nobody: event hosts and other attendees are never pinged.
// Phones' own calendars follow on the next app open (planner_items.revision).

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, withCorsEmpty } from "../_shared/cors.ts";
import { sendExpoPushMessages, type ExpoPushMessage } from "../_shared/expoPush.ts";
import {
  removeConfirmedEventFromCloud,
  syncConfirmedEventToCloud,
  updateConfirmedEventInCloud,
} from "../_shared/calendarSync.ts";
import { planChangePush, type PlanNoticeKind } from "../_shared/planNotify/messages.ts";

type Action = "cancel" | "reschedule" | "restore" | "notify";

function isUuid(v: unknown): v is string {
  return typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

function json(req: Request, status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...Object.fromEntries(corsHeaders(req)) },
  });
}

const MAX_NOTIFY_PER_DAY = 10;

/** The chat to post the change in: the plan's own conversation, else a DM between the two. */
async function conversationFor(
  supabase: SupabaseClient,
  meta: Record<string, unknown>,
  actorId: string,
  otherId: string,
  mode: string,
): Promise<string | null> {
  if (typeof meta.conversation_id === "string" && isUuid(meta.conversation_id)) return meta.conversation_id;
  const { data: mine } = await supabase
    .from("conversation_members")
    .select("conversation_id, conversations!inner(type, mode)")
    .eq("user_id", actorId)
    .is("left_at", null)
    .eq("conversations.type", "dm")
    .limit(500);
  const ids = ((mine ?? []) as Array<{ conversation_id: string; conversations: { mode: string } }>)
    .sort((a, b) => Number(b.conversations?.mode === mode) - Number(a.conversations?.mode === mode))
    .map((r) => r.conversation_id);
  if (!ids.length) return null;
  const { data: shared } = await supabase
    .from("conversation_members")
    .select("conversation_id")
    .in("conversation_id", ids)
    .eq("user_id", otherId)
    .is("left_at", null);
  const sharedIds = new Set(((shared ?? []) as Array<{ conversation_id: string }>).map((r) => r.conversation_id));
  return ids.find((id) => sharedIds.has(id)) ?? null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return withCorsEmpty(req, { status: 204 });
  if (req.method !== "POST") return json(req, 405, { error: "POST only" });

  try {
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer /, "");
    if (!token) return json(req, 401, { error: "Unauthorized" });
    const supabase = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");
    const { data: { user } } = await supabase.auth.getUser(token);
    if (!user) return json(req, 401, { error: "Invalid session" });

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const itemId = body.planner_item_id;
    const action = body.action as Action;
    if (!isUuid(itemId) || !["cancel", "reschedule", "restore", "notify"].includes(action)) {
      return json(req, 400, { error: "planner_item_id and a valid action are required" });
    }
    const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 500) || null : null;

    const { data: item } = await supabase
      .from("planner_items")
      .select("id, created_by, title, starts_at, ends_at, source_mode, related_event_id, meta, revision")
      .eq("id", itemId)
      .maybeSingle();
    if (!item) return json(req, 404, { error: "Not found" });
    const plan = item as {
      id: string; created_by: string; title: string; starts_at: string; ends_at: string | null;
      source_mode: string; related_event_id: string | null; meta: Record<string, unknown> | null; revision: number;
    };
    const meta = plan.meta ?? {};

    const { data: partRows } = await supabase
      .from("planner_participants")
      .select("user_id, role, cancelled_at")
      .eq("planner_item_id", plan.id);
    const parts = (partRows ?? []) as Array<{ user_id: string; role: string; cancelled_at: string | null }>;
    const me = parts.find((p) => p.user_id === user.id);
    if (!me && plan.created_by !== user.id) return json(req, 403, { error: "Not in this plan" });
    const isOrganiser = plan.created_by === user.id;

    let kind: PlanNoticeKind;
    let newStart: string | null = null;
    let newEnd: string | null = null;
    const nowIso = new Date().toISOString();

    const { data: ce } = await supabase.from("confirmed_events").select("id").eq("planner_item_id", plan.id).maybeSingle();
    const confirmedEventId = (ce as { id?: string } | null)?.id ?? null;

    if (action === "cancel") {
      if (isOrganiser) {
        kind = "cancelled";
        await supabase.from("planner_items").update({
          meta: { ...meta, cancelled_at: nowIso, cancel_reason: reason },
          updated_at: nowIso,
        }).eq("id", plan.id);
        if (confirmedEventId) {
          const everyone = parts.map((p) => p.user_id);
          await removeConfirmedEventFromCloud(supabase, confirmedEventId, everyone);
        }
      } else {
        kind = "cant_make_it";
        await supabase.from("planner_participants")
          .update({ cancelled_at: nowIso, cancel_reason: reason })
          .eq("planner_item_id", plan.id).eq("user_id", user.id);
        if (confirmedEventId) await removeConfirmedEventFromCloud(supabase, confirmedEventId, [user.id]);
      }
    } else if (action === "reschedule") {
      if (!isOrganiser) return json(req, 403, { error: "Only the organiser can move the plan" });
      const s = typeof body.starts_at === "string" ? Date.parse(body.starts_at) : NaN;
      const e = typeof body.ends_at === "string" ? Date.parse(body.ends_at) : NaN;
      if (Number.isNaN(s) || s < Date.now() - 5 * 60_000) return json(req, 400, { error: "starts_at must be in the future" });
      if (!Number.isNaN(e) && e <= s) return json(req, 400, { error: "ends_at must be after starts_at" });
      newStart = new Date(s).toISOString();
      // Keep the plan's length when only the start moves.
      const oldLen = plan.ends_at ? Date.parse(plan.ends_at) - Date.parse(plan.starts_at) : NaN;
      newEnd = !Number.isNaN(e) ? new Date(e).toISOString() : !Number.isNaN(oldLen) && oldLen > 0 ? new Date(s + oldLen).toISOString() : null;
      kind = "rescheduled";
      await supabase.from("planner_items").update({
        starts_at: newStart,
        ends_at: newEnd,
        revision: (plan.revision ?? 0) + 1,
        meta: { ...meta, rescheduled_at: nowIso, reschedule_reason: reason },
        updated_at: nowIso,
      }).eq("id", plan.id);
      // Stale alerts belong to the old time.
      await supabase.from("plan_alerts").delete().eq("planner_item_id", plan.id);
      if (confirmedEventId) {
        await supabase.from("confirmed_events").update({ starts_at: newStart, ends_at: newEnd }).eq("id", confirmedEventId);
        await updateConfirmedEventInCloud(supabase, confirmedEventId);
      }
    } else if (action === "restore") {
      if (!isOrganiser) return json(req, 403, { error: "Only the organiser can restore the plan" });
      const { cancelled_at: _c, cancel_reason: _r, ...rest } = meta;
      kind = "restored";
      newStart = plan.starts_at;
      await supabase.from("planner_items").update({ meta: rest, updated_at: nowIso }).eq("id", plan.id);
      if (confirmedEventId) await syncConfirmedEventToCloud(supabase, confirmedEventId);
    } else {
      kind = "heads_up";
      if (!reason) return json(req, 400, { error: "A message is required" });
      const since = new Date(Date.now() - 24 * 3600_000).toISOString();
      const { count } = await supabase.from("plan_changes").select("*", { count: "exact", head: true })
        .eq("planner_item_id", plan.id).eq("actor_id", user.id).eq("kind", "heads_up").gte("created_at", since);
      if ((count ?? 0) >= MAX_NOTIFY_PER_DAY) return json(req, 429, { error: "Too many messages for this plan today" });
    }

    await supabase.from("plan_changes").insert({
      planner_item_id: plan.id,
      actor_id: user.id,
      kind,
      reason,
      old_starts_at: plan.starts_at,
      new_starts_at: newStart,
      new_ends_at: newEnd,
    });

    // ── Tell the others (never for public events: nobody else is in the user's copy) ──
    const others = parts
      .filter((p) => p.user_id !== user.id && ["owner", "attendee", "invitee"].includes(p.role) && !p.cancelled_at)
      .map((p) => p.user_id);
    if (plan.created_by !== user.id && !others.includes(plan.created_by)) others.push(plan.created_by);
    const recipients = plan.related_event_id ? [] : Array.from(new Set(others));

    let notified = 0;
    if (recipients.length) {
      const { data: prof } = await supabase.from("user_profiles").select("first_name").eq("id", user.id).maybeSingle();
      const actorName = (prof as { first_name?: string | null } | null)?.first_name ?? null;
      const { data: tokens } = await supabase
        .from("user_push_tokens")
        .select("user_id, expo_push_token, locale, timezone")
        .in("user_id", recipients);
      const messages: ExpoPushMessage[] = ((tokens ?? []) as Array<{
        user_id: string; expo_push_token: string; locale: string | null; timezone: string | null;
      }>).map((t) => {
        const text = planChangePush({
          kind, locale: t.locale, timeZone: t.timezone, actorName, title: plan.title,
          newStartsAt: newStart, reason,
        });
        return {
          to: t.expo_push_token,
          title: text.title,
          body: text.body,
          data: { winkly_kind: "plan_change", planner_item_id: plan.id, change: kind },
        };
      });
      if (messages.length) await sendExpoPushMessages(messages).catch(() => ({ ok: false }));

      // A card in the chat you share, so the reason lives with the conversation.
      const card = JSON.stringify({
        type: "plan_change",
        kind,
        planner_item_id: plan.id,
        title: plan.title,
        actor_name: actorName,
        reason,
        new_starts_at: newStart,
      });
      const posted = new Set<string>();
      for (const rid of recipients) {
        const convId = await conversationFor(supabase, meta, user.id, rid, plan.source_mode);
        if (!convId || posted.has(convId)) continue;
        posted.add(convId);
        await supabase.from("messages").insert({
          conversation_id: convId,
          sender_id: user.id,
          message_type: "cta",
          content: card,
        });
      }
      notified = recipients.length;
    }

    return json(req, 200, { ok: true, kind, notified, starts_at: newStart ?? plan.starts_at, ends_at: newEnd ?? plan.ends_at });
  } catch (e) {
    console.error("[plan-update]", e);
    return json(req, 500, { error: "Internal error" });
  }
});
