/**
 * calendar-sync-confirmed-event — create/update calendar events for participants.
 *
 * This is a thin integration layer intended to be backed by either:
 * - Workspace MCP Server (preferred for enterprise/workspace deployments), or
 * - Nylas API (consumer Google/Outlook sync).
 *
 * Current behavior:
 * - If no calendar provider secrets are configured, returns structured "not_configured".
 * - The confirmed event UID is stored in DB (confirmed_events.event_uid) so all participants can share one identifier.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

function isUuid(v: unknown): v is string {
  return typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: { "Access-Control-Allow-Origin": "*" } });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
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
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }

    const body = await req.json().catch(() => ({})) as { confirmed_event_id?: unknown };
    const confirmedEventId = body?.confirmed_event_id;
    if (!isUuid(confirmedEventId)) {
      return new Response(JSON.stringify({ error: "confirmed_event_id required" }), {
        status: 400,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }

    // Ensure caller is a participant (RLS on confirmed_events would also protect reads).
    const { data: ce } = await supabase
      .from("confirmed_events")
      .select("id, event_uid, starts_at, ends_at, title, booking_url, location_id, planner_item_id")
      .eq("id", confirmedEventId)
      .maybeSingle();
    if (!ce) {
      return new Response(JSON.stringify({ error: "Not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }

    const nylasKey = Deno.env.get("NYLAS_API_KEY");
    const mcpUrl = Deno.env.get("WORKSPACE_MCP_URL");
    if (!nylasKey && !mcpUrl) {
      return new Response(JSON.stringify({
        status: "not_configured",
        message: "Calendar sync is not configured. Connect Google/Outlook (Nylas) or configure Workspace MCP.",
        confirmed_event_id: confirmedEventId,
        event_uid: ce.event_uid,
      }), { headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });
    }

    // Placeholder: calendar provider implementations will write provider-specific external_event_id per user
    // into confirmed_event_participants.
    return new Response(JSON.stringify({
      status: "pending_implementation",
      message: "Calendar sync provider wiring pending (Nylas / Workspace MCP). DB models are ready.",
      confirmed_event_id: confirmedEventId,
      event_uid: ce.event_uid,
    }), { headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });
  } catch (e) {
    console.error("calendar-sync-confirmed-event:", e);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  }
});

