/**
 * video-call-session — Returns a short-lived room URL for WebRTC (Daily.co / custom).
 * Body: { conversation_id: string }
 * Set DAILY_API_KEY for real Daily rooms; otherwise returns a placeholder + instructions.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

serve(async (req) => {
  const cors = corsHeaders(req, {
    methods: "POST, OPTIONS",
    headers: "authorization, x-client-info, apikey, content-type",
  });
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...Object.fromEntries(cors), "Content-Type": "application/json" },
    });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...Object.fromEntries(cors), "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const userClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData.user) {
    return new Response(JSON.stringify({ error: "Invalid session" }), {
      status: 401,
      headers: { ...Object.fromEntries(cors), "Content-Type": "application/json" },
    });
  }
  const uid = userData.user.id;

  let body: { conversation_id?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { ...Object.fromEntries(cors), "Content-Type": "application/json" },
    });
  }

  const convId = body.conversation_id?.trim();
  if (!convId) {
    return new Response(JSON.stringify({ error: "conversation_id required" }), {
      status: 400,
      headers: { ...Object.fromEntries(cors), "Content-Type": "application/json" },
    });
  }

  const { data: mem, error: mErr } = await userClient
    .from("conversation_members")
    .select("conversation_id")
    .eq("conversation_id", convId)
    .eq("user_id", uid)
    .maybeSingle();

  if (mErr || !mem) {
    return new Response(JSON.stringify({ error: "Not a member of this chat" }), {
      status: 403,
      headers: { ...Object.fromEntries(cors), "Content-Type": "application/json" },
    });
  }

  const dailyKey = Deno.env.get("DAILY_API_KEY");
  const roomName = `winkly-${convId.replace(/[^a-zA-Z0-9]/g, "-").slice(0, 24)}-${Date.now()}`.slice(0, 64);

  if (dailyKey) {
    const createRoom = await fetch("https://api.daily.co/v1/rooms", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${dailyKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: roomName,
        privacy: "private",
        properties: { max_participants: 2, enable_chat: false, exp: Math.floor(Date.now() / 1000) + 3600 },
      }),
    });

    if (createRoom.ok) {
      const room = await createRoom.json();
      const tokenRes = await fetch("https://api.daily.co/v1/meeting-tokens", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${dailyKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          properties: { room_name: room.name, user_name: "Winkly user", is_owner: true },
        }),
      });
      const tok = tokenRes.ok ? await tokenRes.json() : null;
      return new Response(
        JSON.stringify({
          provider: "daily",
          room_url: room.url,
          token: tok?.token ?? null,
        }),
        { status: 200, headers: { ...cors, "Content-Type": "application/json" } }
      );
    }
  }

  return new Response(
    JSON.stringify({
      provider: "placeholder",
      room_url: `https://winkly.app/video-placeholder?conversation=${encodeURIComponent(convId)}`,
      message: "Set DAILY_API_KEY in Supabase secrets for in-app Daily.co rooms.",
    }),
    { status: 200, headers: { ...cors, "Content-Type": "application/json" } }
  );
});
