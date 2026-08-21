/**
 * calendar-freebusy — merges busy blocks from every cloud calendar the user has connected
 * (Google / Microsoft) so the Concierge can avoid suggesting times the user is actually busy
 * on their real calendar, not just their device's local white-space read.
 *
 * "not_configured": the user hasn't connected any cloud calendar — client keeps using
 * device calendar white space only (apps/mobile/lib/integrations/calendarWhiteSpace.ts).
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, withCorsEmpty } from "../_shared/cors.ts";
import { getValidAccessToken, type CalendarConnectionRow } from "../_shared/calendarSync.ts";
import { getGoogleFreeBusy } from "../_shared/googleCalendar.ts";
import { getMicrosoftFreeBusy } from "../_shared/microsoftGraph.ts";

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

    const body = await req.json().catch(() => ({})) as { time_min?: unknown; time_max?: unknown };
    const timeMin = typeof body.time_min === "string" ? body.time_min : new Date().toISOString();
    const timeMax = typeof body.time_max === "string"
      ? body.time_max
      : new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();

    const { data: connections } = await supabase
      .from("calendar_connections")
      .select("user_id, provider, token_encrypted, token_expires_at")
      .eq("user_id", user.id)
      .in("provider", ["google", "microsoft"]);

    if (!connections?.length) {
      return new Response(
        JSON.stringify({
          status: "not_configured",
          message: "Connect Google or Outlook Calendar in Planner settings to merge cloud busy times with device white space.",
          busy_blocks: [],
        }),
        { headers: jsonHeaders },
      );
    }

    const busyBlocks: { start: string; end: string; provider: string }[] = [];
    for (const conn of connections as CalendarConnectionRow[]) {
      try {
        const accessToken = await getValidAccessToken(supabase, conn);
        if (!accessToken) continue;

        const blocks = conn.provider === "google"
          ? await getGoogleFreeBusy(accessToken, timeMin, timeMax)
          : await getMicrosoftFreeBusy(accessToken, timeMin, timeMax);

        for (const b of blocks ?? []) busyBlocks.push({ ...b, provider: conn.provider });
      } catch (e) {
        console.warn(`calendar-freebusy (${conn.provider}):`, e);
      }
    }

    return new Response(
      JSON.stringify({ status: "ok", busy_blocks: busyBlocks }),
      { headers: jsonHeaders },
    );
  } catch (e) {
    console.error("calendar-freebusy:", e);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...Object.fromEntries(corsHeaders(req)) },
    });
  }
});
