/**
 * pending-plan-confirm — confirm a pending concierge plan and finalize when all participants confirmed.
 *
 * Flow:
 * - Authenticated participant calls with { pending_plan_id }.
 * - Server records confirmation via RPC confirm_pending_plan(p_plan_id).
 * - If all confirmed: create planner_items + planner_participants for all participant_ids; mark pending_plans.confirmed.
 *
 * Calendar injection (Nylas / Cal.com) is intentionally best-effort + optional:
 * - If CALCOM_API_KEY / NYLAS_API_KEY is not configured, we still finalize in Winkly Planner.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, withCorsEmpty } from "../_shared/cors.ts";
import { sendExpoPushMessages } from "../_shared/expoPush.ts";

function isUuid(v: unknown): v is string {
  return typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

function addMinutesIso(iso: string, minutes: number): string {
  const d = new Date(iso);
  d.setMinutes(d.getMinutes() + minutes);
  return d.toISOString();
}

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

    const body = await req.json().catch(() => ({})) as { pending_plan_id?: unknown };
    const pendingPlanId = body?.pending_plan_id;
    if (!isUuid(pendingPlanId)) {
      return new Response(JSON.stringify({ error: "pending_plan_id required" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...Object.fromEntries(cors) },
      });
    }

    const { data: confirmRows, error: confirmErr } = await supabase.rpc("confirm_pending_plan", { p_plan_id: pendingPlanId });
    if (confirmErr) {
      return new Response(JSON.stringify({ error: confirmErr.message }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...Object.fromEntries(cors) },
      });
    }
    const confirmRow = Array.isArray(confirmRows) ? confirmRows[0] as { all_participants_confirmed?: boolean } : null;
    const allConfirmed = !!confirmRow?.all_participants_confirmed;

    const { data: pRow, error: pErr } = await supabase
      .from("pending_plans")
      .select("id, created_by, source_mode, participant_ids, plan_json, status, planner_item_id, conversation_id")
      .eq("id", pendingPlanId)
      .maybeSingle();
    if (pErr || !pRow) {
      return new Response(JSON.stringify({ error: "Pending plan not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json", ...Object.fromEntries(cors) },
      });
    }

    // Finalize once, idempotently.
    if (allConfirmed && !pRow.planner_item_id && (pRow.status === "pending" || pRow.status === "pivot_pending")) {
      const plan = pRow.plan_json as Record<string, unknown>;
      const topic = typeof plan.topic === "string" ? plan.topic : "Plan";
      const dt = typeof plan.date_time === "string" ? plan.date_time : new Date().toISOString();
      const duration = typeof plan.duration === "number" && isFinite(plan.duration) ? Math.round(plan.duration) : 120;
      const endsAt = addMinutesIso(dt, Math.min(24 * 60, Math.max(30, duration)));

      const { data: item, error: itemErr } = await supabase
        .from("planner_items")
        .insert({
          created_by: pRow.created_by,
          source_mode: pRow.source_mode,
          title: topic,
          description: typeof plan.logic_reasoning === "string" ? plan.logic_reasoning : null,
          starts_at: dt,
          ends_at: endsAt,
          meta: { winkly_plan: plan },
        })
        .select("id")
        .single();
      if (itemErr || !item) {
        return new Response(JSON.stringify({ error: itemErr?.message ?? "Failed to create planner item" }), {
          status: 500,
          headers: { "Content-Type": "application/json", ...Object.fromEntries(cors) },
        });
      }

      const partIds = Array.isArray(pRow.participant_ids) ? (pRow.participant_ids as string[]) : [];
      for (const uid of partIds) {
        if (!isUuid(uid)) continue;
        await supabase.from("planner_participants").insert({
          planner_item_id: item.id,
          user_id: uid,
          role: uid === pRow.created_by ? "owner" : "attendee",
        }).then(() => {}).catch(() => {});
      }

      // Create a canonical confirmed_event (shared UID) for cross-calendar linking.
      // Provider-specific event IDs (Google/Outlook/etc) can be written into confirmed_event_participants later.
      const locationDetails = (plan.location_details ?? {}) as Record<string, unknown>;
      const mapsLink = typeof locationDetails.google_maps_link === "string" ? locationDetails.google_maps_link : "";
      const m = mapsLink.match(/place_id:([A-Za-z0-9_-]+)/);
      const locationId = m?.[1] ?? null;
      const eventUid = `winkly:${item.id}`;
      const { data: ce } = await supabase.from("confirmed_events").insert({
        created_by: pRow.created_by,
        pending_plan_id: pendingPlanId,
        planner_item_id: item.id,
        conversation_id: (pRow as { conversation_id?: string | null }).conversation_id ?? null,
        event_uid: eventUid,
        starts_at: dt,
        ends_at: endsAt,
        title: topic,
        location_id: locationId,
        booking_url: null,
        meta: { source: "pending-plan-confirm" },
      }).select("id").single();

      if (ce?.id) {
        for (const uid of partIds) {
          if (!isUuid(uid)) continue;
          await supabase.from("confirmed_event_participants").insert({
            confirmed_event_id: ce.id,
            user_id: uid,
            provider: "winkly",
            external_event_id: null,
            sync_status: "pending",
          }).then(() => {}).catch(() => {});
        }
      }

      await supabase.from("pending_plans").update({
        status: pRow.status === "pivot_pending" ? "pivot_confirmed" : "confirmed",
        planner_item_id: item.id,
        updated_at: new Date().toISOString(),
      }).eq("id", pendingPlanId);

      // Notify participants (best-effort): plan fully confirmed and planner item created.
      try {
        const notifyIds = partIds.filter(isUuid);
        if (notifyIds.length > 0) {
          const { data: tokRows } = await supabase
            .from("user_push_tokens")
            .select("expo_push_token")
            .in("user_id", notifyIds);
          const uniqTok = [...new Set((tokRows ?? []).map((t: { expo_push_token: string }) => t.expo_push_token))];
          if (uniqTok.length > 0) {
            await sendExpoPushMessages(
              uniqTok.map((to) => ({
                to,
                title: "Plan confirmed",
                body: `${topic} is on your planner.`,
                data: {
                  winkly_kind: "plan_confirmed",
                  planner_item_id: item.id,
                  pending_plan_id: pendingPlanId,
                },
              })),
            );
          }
        }
      } catch (pushErr) {
        console.warn("pending-plan-confirm push:", pushErr);
      }
    }

    const { data: refreshed } = await supabase
      .from("pending_plans_with_confirmation_counts")
      .select("id, status, planner_item_id, confirmed_count, participant_count, all_participants_confirmed")
      .eq("id", pendingPlanId)
      .maybeSingle();

    return new Response(JSON.stringify({
      pending_plan_id: pendingPlanId,
      all_participants_confirmed: (refreshed as { all_participants_confirmed?: boolean } | null)?.all_participants_confirmed ?? allConfirmed,
      status: (refreshed as { status?: string } | null)?.status ?? pRow.status,
      planner_item_id: (refreshed as { planner_item_id?: string | null } | null)?.planner_item_id ?? pRow.planner_item_id ?? null,
      counts: {
        confirmed: (refreshed as { confirmed_count?: number } | null)?.confirmed_count,
        participants: (refreshed as { participant_count?: number } | null)?.participant_count,
      },
    }), { headers: { "Content-Type": "application/json", ...Object.fromEntries(cors) } });
  } catch (e) {
    console.error("pending-plan-confirm:", e);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...Object.fromEntries(corsHeaders(req)) },
    });
  }
});

