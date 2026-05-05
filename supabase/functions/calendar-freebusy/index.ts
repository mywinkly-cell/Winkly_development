/**
 * calendar-freebusy — Future: Google Calendar FreeBusy using calendar_connections + refresh token.
 * v0 returns structured "not_configured" so clients keep using device calendar white space.
 *
 * Next steps: decrypt token_encrypted, OAuth refresh with GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET,
 * POST https://www.googleapis.com/calendar/v3/freeBusy with timeMin/timeMax.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, withCorsEmpty } from "../_shared/cors.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return withCorsEmpty(req, { status: 204 });
  }

  try {
    const cors = corsHeaders(req);
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json", ...Object.fromEntries(cors) },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Invalid session" }), {
        status: 401,
        headers: { "Content-Type": "application/json", ...Object.fromEntries(cors) },
      });
    }

    const { data: row } = await supabase
      .from("calendar_connections")
      .select("id, provider, token_encrypted, last_sync_at, scopes")
      .eq("user_id", user.id)
      .eq("provider", "google")
      .maybeSingle();

    if (!row?.token_encrypted) {
      return new Response(
        JSON.stringify({
          status: "not_configured",
          message: "Connect Google Calendar in app settings to merge cloud busy times with device white space.",
          busy_blocks: [],
        }),
        { headers: { "Content-Type": "application/json", ...Object.fromEntries(cors) } },
      );
    }

    return new Response(
      JSON.stringify({
        status: "pending_implementation",
        message: "Google FreeBusy will run here once OAuth refresh + KMS for tokens are wired.",
        busy_blocks: [],
      }),
      { headers: { "Content-Type": "application/json", ...Object.fromEntries(cors) } },
    );
  } catch (e) {
    console.error("calendar-freebusy:", e);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...Object.fromEntries(corsHeaders(req)) },
    });
  }
});
