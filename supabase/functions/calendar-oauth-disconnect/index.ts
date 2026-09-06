/**
 * calendar-oauth-disconnect — revoke (best-effort) and remove a user's cloud calendar connection.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, withCorsEmpty } from "../_shared/cors.ts";
import { decryptCalendarTokens } from "../_shared/calendarTokenCrypto.ts";
import { revokeGoogleToken } from "../_shared/googleCalendar.ts";
import type { CalendarOAuthProvider } from "../_shared/calendarOAuthState.ts";

function isProvider(v: unknown): v is CalendarOAuthProvider {
  return v === "google" || v === "microsoft";
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return withCorsEmpty(req, { status: 204 });
  }

  try {
    const cors = corsHeaders(req);
    const jsonHeaders = { "Content-Type": "application/json", ...Object.fromEntries(cors) };

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: jsonHeaders });
    }

    const token = authHeader.replace("Bearer ", "");
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Invalid session" }), { status: 401, headers: jsonHeaders });
    }

    const body = await req.json().catch(() => ({})) as { provider?: unknown };
    if (!isProvider(body.provider)) {
      return new Response(JSON.stringify({ error: "provider must be 'google' or 'microsoft'" }), {
        status: 400,
        headers: jsonHeaders,
      });
    }
    const provider = body.provider;

    const { data: row } = await supabase
      .from("calendar_connections")
      .select("token_encrypted")
      .eq("user_id", user.id)
      .eq("provider", provider)
      .maybeSingle();

    if (row?.token_encrypted) {
      const tokens = await decryptCalendarTokens(row.token_encrypted, user.id);
      // Google supports self-service revoke; Microsoft doesn't offer an equivalent for
      // consumer delegated tokens (see _shared/microsoftGraph.ts comment) — dropping our
      // stored copy below is what actually matters for "Winkly no longer has access".
      if (tokens && provider === "google") {
        await revokeGoogleToken(tokens.refresh_token);
      }
    }

    const { error: deleteErr } = await supabase
      .from("calendar_connections")
      .delete()
      .eq("user_id", user.id)
      .eq("provider", provider);

    if (deleteErr) {
      return new Response(JSON.stringify({ error: deleteErr.message }), { status: 500, headers: jsonHeaders });
    }

    return new Response(JSON.stringify({ status: "disconnected", provider }), { headers: jsonHeaders });
  } catch (e) {
    console.error("calendar-oauth-disconnect:", e);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...Object.fromEntries(corsHeaders(req)) },
    });
  }
});
