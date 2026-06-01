/**
 * expo-push-notify — authenticated client asks server to notify another user (anti-spam checks).
 *
 * Body: { kind, recipient_user_id, title, body, data?, conversation_id?, planner_invitation_id?, pending_plan_id? }
 * Secrets: EXPO_ACCESS_TOKEN optional but recommended for production Expo Push API.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, withCorsJson } from "../_shared/cors.ts";
import { sendExpoPushMessages } from "../_shared/expoPush.ts";

type PushKind = "new_match" | "chat_message" | "planner_invitation" | "planner_response" | "plan_confirmed";

function isUuid(v: unknown): v is string {
  return typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

async function hasMutualRomanceLike(supabase: SupabaseClient, a: string, b: string): Promise<boolean> {
  const { count: ab } = await supabase
    .from("romance_likes")
    .select("*", { count: "exact", head: true })
    .eq("liker_id", a)
    .eq("liked_id", b);
  const { count: ba } = await supabase
    .from("romance_likes")
    .select("*", { count: "exact", head: true })
    .eq("liker_id", b)
    .eq("liked_id", a);
  return (ab ?? 0) > 0 && (ba ?? 0) > 0;
}

async function bothActiveMembers(
  supabase: SupabaseClient,
  conversationId: string,
  u1: string,
  u2: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("conversation_members")
    .select("user_id")
    .eq("conversation_id", conversationId)
    .is("left_at", null)
    .in("user_id", [u1, u2]);
  if (error || !data) return false;
  const ids = new Set(data.map((r: { user_id: string }) => r.user_id));
  return ids.has(u1) && ids.has(u2);
}

async function verifyPlannerInvite(
  supabase: SupabaseClient,
  caller: string,
  recipient: string,
  invitationId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("planner_invitations")
    .select("inviter_id, invitee_id, status")
    .eq("id", invitationId)
    .maybeSingle();
  if (error || !data) return false;
  return (
    data.inviter_id === caller &&
    data.invitee_id === recipient &&
    data.status === "pending"
  );
}

/**
 * The invitee responded (accept/decline/reschedule) and is notifying the
 * original inviter. Caller must be the invitee, recipient the inviter, and the
 * invitation must no longer be pending.
 */
async function verifyPlannerResponse(
  supabase: SupabaseClient,
  caller: string,
  recipient: string,
  invitationId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("planner_invitations")
    .select("inviter_id, invitee_id, status")
    .eq("id", invitationId)
    .maybeSingle();
  if (error || !data) return false;
  return (
    data.invitee_id === caller &&
    data.inviter_id === recipient &&
    ["accepted", "declined", "reschedule"].includes(data.status)
  );
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(req) });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return withCorsJson(req, { error: "Unauthorized" }, { status: 401 });
    }

    const token = authHeader.replace("Bearer ", "");
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabase = createClient(supabaseUrl, serviceKey);

    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return withCorsJson(req, { error: "Invalid session" }, { status: 401 });
    }

    const callerId = user.id;
    const body = await req.json().catch(() => ({})) as {
      kind?: unknown;
      recipient_user_id?: unknown;
      title?: unknown;
      body?: unknown;
      data?: unknown;
      conversation_id?: unknown;
      planner_invitation_id?: unknown;
      pending_plan_id?: unknown;
    };

    const kind = body.kind as PushKind;
    const recipientId = body.recipient_user_id;
    const title = typeof body.title === "string" ? body.title : "";
    const notifyBody = typeof body.body === "string" ? body.body : "";
    const data = typeof body.data === "object" && body.data != null ? (body.data as Record<string, unknown>) : {};

    if (!isUuid(recipientId) || recipientId === callerId) {
      return withCorsJson(req, { error: "Invalid recipient" }, { status: 400 });
    }
    if (!["new_match", "chat_message", "planner_invitation", "planner_response"].includes(kind)) {
      return withCorsJson(req, { error: "Invalid kind" }, { status: 400 });
    }
    if (!title.trim() || !notifyBody.trim()) {
      return withCorsJson(req, { error: "title and body required" }, { status: 400 });
    }

    let allowed = false;

    if (kind === "new_match") {
      allowed = await hasMutualRomanceLike(supabase, callerId, recipientId);
    } else if (kind === "chat_message") {
      const convId = body.conversation_id;
      if (!isUuid(convId)) {
        return withCorsJson(req, { error: "conversation_id required" }, { status: 400 });
      }
      allowed = await bothActiveMembers(supabase, convId, callerId, recipientId);
    } else if (kind === "planner_invitation") {
      const invId = body.planner_invitation_id;
      if (!isUuid(invId)) {
        return withCorsJson(req, { error: "planner_invitation_id required" }, { status: 400 });
      }
      allowed = await verifyPlannerInvite(supabase, callerId, recipientId, invId);
    } else if (kind === "planner_response") {
      const invId = body.planner_invitation_id;
      if (!isUuid(invId)) {
        return withCorsJson(req, { error: "planner_invitation_id required" }, { status: 400 });
      }
      allowed = await verifyPlannerResponse(supabase, callerId, recipientId, invId);
    }

    if (!allowed) {
      return withCorsJson(req, { error: "Not allowed" }, { status: 403 });
    }

    const { data: tokens, error: tokErr } = await supabase
      .from("user_push_tokens")
      .select("expo_push_token")
      .eq("user_id", recipientId);

    if (tokErr) {
      return withCorsJson(req, { error: "Token lookup failed" }, { status: 500 });
    }

    const uniq = [...new Set((tokens ?? []).map((t: { expo_push_token: string }) => t.expo_push_token))];
    const pushResult = await sendExpoPushMessages(
      uniq.map((to) => ({
        to,
        title,
        body: notifyBody,
        data: { ...data, winkly_kind: kind },
      })),
    );

    return withCorsJson(req, {
      sent: uniq.length,
      expo_ok: pushResult.ok,
      detail: pushResult.detail,
    });
  } catch (e) {
    console.error("expo-push-notify:", e);
    return withCorsJson(req, { error: "Internal error" }, { status: 500 });
  }
});
