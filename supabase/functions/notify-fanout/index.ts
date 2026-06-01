/**
 * notify-fanout — server-side push fan-out triggered by the database.
 *
 * Unlike `expo-push-notify` (called by an authenticated client *after* it sends),
 * this function is invoked by Postgres triggers via pg_net the moment a row is
 * written. That makes delivery reliable even when the sender's app is killed or
 * loses connectivity right after the INSERT.
 *
 * Auth: not a user-facing endpoint. It is protected by a shared secret header
 *   `x-webhook-secret` that must equal the `WEBHOOK_SECRET` function env var.
 *   (verify_jwt is disabled for this function — see supabase/config.toml.)
 *
 * Body (from DB triggers):
 *   { type: "message", record: { id, conversation_id, sender_id, content, message_type } }
 *   { type: "match",   liker_id, liked_id, chat_id? }
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendExpoPushMessages } from "../_shared/expoPush.ts";

type MessageRecord = {
  id?: string;
  conversation_id?: string;
  sender_id?: string;
  content?: string;
  message_type?: string;
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function pushPreviewForMessage(content: string, messageType: string): string {
  if (messageType === "cta") return "New suggestion in chat";
  if (messageType === "image") return "📷 Photo";
  if (messageType === "gif") return "GIF";
  if (messageType === "audio") return "🎤 Voice message";
  if (messageType === "video") return "🎥 Video";
  if (messageType === "file") return "📎 Attachment";
  const t = (content ?? "").trim();
  if (t.startsWith("{")) return "Update in your chat";
  return t.length > 0 ? t.slice(0, 120) : "New message";
}

/** Recipients of a conversation message: active members minus the sender minus muters. */
async function resolveMessageRecipients(
  supabase: SupabaseClient,
  conversationId: string,
  senderId: string,
): Promise<string[]> {
  const { data: members, error } = await supabase
    .from("conversation_members")
    .select("user_id")
    .eq("conversation_id", conversationId)
    .is("left_at", null);
  if (error || !members) return [];

  const candidates = members
    .map((m: { user_id: string }) => m.user_id)
    .filter((id: string) => id && id !== senderId);
  if (candidates.length === 0) return [];

  // Respect per-member mute settings (server-side; clients can't be trusted to suppress).
  const { data: muted } = await supabase
    .from("conversation_member_settings")
    .select("user_id, muted")
    .eq("conversation_id", conversationId)
    .in("user_id", candidates);

  const mutedSet = new Set(
    (muted ?? [])
      .filter((r: { muted: boolean | null }) => r.muted === true)
      .map((r: { user_id: string }) => r.user_id),
  );

  return candidates.filter((id) => !mutedSet.has(id));
}

async function pushToUsers(
  supabase: SupabaseClient,
  recipientIds: string[],
  title: string,
  body: string,
  data: Record<string, unknown>,
): Promise<number> {
  if (recipientIds.length === 0) return 0;

  const { data: tokens } = await supabase
    .from("user_push_tokens")
    .select("expo_push_token")
    .in("user_id", recipientIds);

  const uniq = [...new Set((tokens ?? []).map((t: { expo_push_token: string }) => t.expo_push_token))].filter(
    Boolean,
  );
  if (uniq.length === 0) return 0;

  await sendExpoPushMessages(uniq.map((to) => ({ to, title, body, data })));
  return uniq.length;
}

serve(async (req) => {
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const expected = Deno.env.get("WEBHOOK_SECRET") ?? "";
  const provided = req.headers.get("x-webhook-secret") ?? "";
  if (!expected || provided !== expected) {
    return json({ error: "Unauthorized" }, 401);
  }

  let payload: { type?: string; record?: MessageRecord; liker_id?: string; liked_id?: string; chat_id?: string };
  try {
    payload = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    if (payload.type === "message") {
      const rec = payload.record ?? {};
      const conversationId = rec.conversation_id;
      const senderId = rec.sender_id;
      if (!conversationId || !senderId) {
        return json({ error: "conversation_id and sender_id required" }, 400);
      }

      const recipients = await resolveMessageRecipients(supabase, conversationId, senderId);
      const preview = pushPreviewForMessage(rec.content ?? "", rec.message_type ?? "text");
      const sent = await pushToUsers(supabase, recipients, "New message", preview, {
        winkly_kind: "chat_message",
        conversation_id: conversationId,
        message_id: rec.id ?? null,
      });
      return json({ ok: true, recipients: recipients.length, tokens: sent });
    }

    if (payload.type === "match") {
      const recipientId = payload.liked_id;
      if (!recipientId) {
        return json({ error: "liked_id required" }, 400);
      }
      const sent = await pushToUsers(
        supabase,
        [recipientId],
        "New match 💖",
        "You matched on Winkly — open the app to chat and plan together.",
        {
          winkly_kind: "new_match",
          chat_id: payload.chat_id ?? null,
        },
      );
      return json({ ok: true, recipients: 1, tokens: sent });
    }

    return json({ error: "Unknown type" }, 400);
  } catch (e) {
    console.error("notify-fanout:", e);
    return json({ error: "Internal error" }, 500);
  }
});
