/**
 * calendar-sync-confirmed-event — sync a confirmed plan to every participant's connected
 * cloud calendar (Google / Microsoft). Called fire-and-forget from the mobile app right
 * after a plan is confirmed (any of the planner-item creation paths) and, as a durability
 * net, retried by the calendar-sync-sweep cron for anything left pending/failed.
 *
 * The confirmed event UID is stored in DB (confirmed_events.event_uid) so all participants
 * can share one identifier; provider-specific event IDs live per participant in
 * confirmed_event_participants.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, withCorsEmpty } from "../_shared/cors.ts";
import { syncConfirmedEventToCloud } from "../_shared/calendarSync.ts";
import { isGoogleCalendarConfigured } from "../_shared/googleCalendar.ts";
import { isMicrosoftGraphConfigured } from "../_shared/microsoftGraph.ts";

function isUuid(v: unknown): v is string {
  return typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
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

    const body = await req.json().catch(() => ({})) as { confirmed_event_id?: unknown };
    const confirmedEventId = body?.confirmed_event_id;
    if (!isUuid(confirmedEventId)) {
      return new Response(JSON.stringify({ error: "confirmed_event_id required" }), { status: 400, headers: jsonHeaders });
    }

    // Ensure caller is a participant (RLS on confirmed_events would also protect reads; this
    // uses the service-role client so we check explicitly).
    const { data: ce } = await supabase
      .from("confirmed_events")
      .select("id, event_uid, planner_item_id")
      .eq("id", confirmedEventId)
      .maybeSingle();
    if (!ce) {
      return new Response(JSON.stringify({ error: "Not found" }), { status: 404, headers: jsonHeaders });
    }
    const { data: membership } = ce.planner_item_id
      ? await supabase
        .from("planner_participants")
        .select("user_id")
        .eq("planner_item_id", ce.planner_item_id)
        .eq("user_id", user.id)
        .maybeSingle()
      : { data: null };
    if (!membership) {
      return new Response(JSON.stringify({ error: "Not a participant of this plan" }), { status: 403, headers: jsonHeaders });
    }

    if (!isGoogleCalendarConfigured() && !isMicrosoftGraphConfigured()) {
      return new Response(JSON.stringify({
        status: "not_configured",
        message: "Cloud calendar sync is not configured. Connect Google or Outlook Calendar in Planner settings.",
        confirmed_event_id: confirmedEventId,
        event_uid: ce.event_uid,
      }), { headers: jsonHeaders });
    }

    const result = await syncConfirmedEventToCloud(supabase, confirmedEventId);

    return new Response(JSON.stringify({
      status: "ok",
      confirmed_event_id: confirmedEventId,
      event_uid: ce.event_uid,
      ...result,
    }), { headers: jsonHeaders });
  } catch (e) {
    console.error("calendar-sync-confirmed-event:", e);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...Object.fromEntries(corsHeaders(req)) },
    });
  }
});
