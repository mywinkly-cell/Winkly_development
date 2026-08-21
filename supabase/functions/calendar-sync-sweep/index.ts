/**
 * calendar-sync-sweep — durability net for cloud calendar sync.
 *
 * calendar-sync-confirmed-event fires once, fire-and-forget, right when a plan is confirmed.
 * If that single attempt fails (transient Google/Microsoft error, the user's device losing
 * connectivity mid-confirm, a token refresh hiccup), nothing retries it — this cron does.
 * It re-runs the same shared sync logic for every confirmed_event_participants row still
 * 'pending' or 'failed' for a future plan.
 *
 * Invocation: pg_cron → pg_net, header `x-cron-secret` (CRON_SECRET), same shape as
 * weather-pivot-cron. verify_jwt = false in config.toml (no Bearer JWT from a cron caller).
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, withCorsEmpty } from "../_shared/cors.ts";
import { syncConfirmedEventToCloud } from "../_shared/calendarSync.ts";

const MAX_EVENTS_PER_SWEEP = 50;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return withCorsEmpty(req, { status: 204 });
  }

  const cors = corsHeaders(req);
  const jsonHeaders = { "Content-Type": "application/json", ...Object.fromEntries(cors) };

  const secret = Deno.env.get("CRON_SECRET") ?? "";
  const got = req.headers.get("x-cron-secret") ?? "";
  // Fail closed: a missing CRON_SECRET must reject (not bypass) — this function runs with
  // the service-role key. Matches weather-pivot-cron / notify-fanout's secret check.
  if (!secret || got !== secret) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: jsonHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    // Deliberately not pre-filtered by confirmed_event_participants.sync_status: a sync that
    // never got attempted at all (device went offline right as the plan was confirmed, before
    // the fire-and-forget POST landed) has no row yet, not a 'pending' one, so a status filter
    // would miss it. syncConfirmedEventToCloud is cheap to re-run for already-'synced' pairs
    // (a lookup, no provider API calls) — soonest-starting plans first, bounded per sweep so a
    // large backlog drains gradually across runs instead of timing out one request.
    const { data: futureEvents } = await supabase
      .from("confirmed_events")
      .select("id")
      .gte("starts_at", new Date().toISOString())
      .order("starts_at", { ascending: true })
      .limit(MAX_EVENTS_PER_SWEEP);

    let synced = 0;
    let failed = 0;
    for (const ev of futureEvents ?? []) {
      const result = await syncConfirmedEventToCloud(supabase, (ev as { id: string }).id);
      synced += result.synced;
      failed += result.failed;
    }

    return new Response(
      JSON.stringify({ status: "ok", swept: (futureEvents ?? []).length, synced, failed }),
      { headers: jsonHeaders },
    );
  } catch (e) {
    console.error("calendar-sync-sweep:", e);
    return new Response(JSON.stringify({ error: "Internal error" }), { status: 500, headers: jsonHeaders });
  }
});
