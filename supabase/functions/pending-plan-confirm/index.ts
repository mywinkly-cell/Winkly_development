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

function firstPlanOption(plan: Record<string, unknown>): Record<string, unknown> | null {
  const opts = plan.options;
  if (Array.isArray(opts) && opts[0] && typeof opts[0] === "object") {
    return opts[0] as Record<string, unknown>;
  }
  return null;
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

    const body = await req.json().catch(() => ({})) as {
      pending_plan_id?: unknown;
      as_host?: unknown;
      option_id?: unknown;
    };
    const pendingPlanId = body?.pending_plan_id;
    if (!isUuid(pendingPlanId)) {
      return new Response(JSON.stringify({ error: "pending_plan_id required" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...Object.fromEntries(cors) },
      });
    }

    const asHost = body?.as_host === true;
    const chosenOptionId = typeof body?.option_id === "string" ? body.option_id.trim().toUpperCase() : null;

    // Host finalize (group consensus): the creator locks in a chosen option for
    // everyone. We reorder plan_json.options so the chosen option is options[0]
    // (the finalize path below always uses the first option), then record
    // confirmations for all participants in one call.
    if (asHost) {
      const { data: hostRow } = await supabase
        .from("pending_plans")
        .select("created_by, plan_json, status")
        .eq("id", pendingPlanId)
        .maybeSingle();
      if (!hostRow || hostRow.created_by !== user.id) {
        return new Response(JSON.stringify({ error: "Only the host can confirm this plan" }), {
          status: 403,
          headers: { "Content-Type": "application/json", ...Object.fromEntries(cors) },
        });
      }
      if (chosenOptionId && (hostRow.status === "pending" || hostRow.status === "pivot_pending")) {
        const planJson = (hostRow.plan_json ?? {}) as Record<string, unknown>;
        const opts = Array.isArray(planJson.options) ? (planJson.options as Record<string, unknown>[]) : [];
        if (opts.length > 1) {
          const idx = opts.findIndex((o) => String(o?.option_id ?? "").toUpperCase() === chosenOptionId);
          if (idx > 0) {
            const reordered = [opts[idx], ...opts.filter((_, i) => i !== idx)];
            await supabase
              .from("pending_plans")
              .update({ plan_json: { ...planJson, options: reordered }, updated_at: new Date().toISOString() })
              .eq("id", pendingPlanId);
          }
        }
      }
    }

    const { data: confirmRows, error: confirmErr } = asHost
      ? await supabase.rpc("confirm_pending_plan_host", { p_plan_id: pendingPlanId })
      : await supabase.rpc("confirm_pending_plan", { p_plan_id: pendingPlanId });
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
      .select("id, created_by, source_mode, participant_ids, plan_json, status, planner_item_id, conversation_id, pivot_of")
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
      const primary = firstPlanOption(plan);
      const topic =
        (typeof primary?.title === "string" && primary.title.trim()) ||
        (typeof plan.topic === "string" && plan.topic.trim()) ||
        "Plan";
      const dt =
        (typeof plan.date_time === "string" && plan.date_time.trim()) ||
        new Date().toISOString();
      const durationFromPlan =
        typeof plan.duration === "number" && isFinite(plan.duration) ? Math.round(plan.duration) : null;
      const durationFromOpt =
        primary && typeof primary.duration_minutes === "number" && isFinite(primary.duration_minutes)
          ? Math.round(primary.duration_minutes as number)
          : null;
      const duration = durationFromPlan ?? durationFromOpt ?? 120;
      const endsAt = addMinutesIso(dt, Math.min(24 * 60, Math.max(30, duration)));

      const venue = primary?.venue as Record<string, unknown> | undefined;
      const fromVenue =
        venue && typeof venue === "object"
          ? {
            name: typeof venue.name === "string" ? venue.name : "",
            address: typeof venue.address === "string" ? venue.address : "",
            google_maps_link: typeof venue.google_maps_link === "string" ? venue.google_maps_link : "",
          }
          : null;
      const legacyLoc = plan.location_details as Record<string, unknown> | undefined;
      const locationDetails =
        fromVenue ??
        (legacyLoc && typeof legacyLoc === "object"
          ? {
            name: typeof legacyLoc.name === "string" ? legacyLoc.name : "",
            address: typeof legacyLoc.address === "string" ? legacyLoc.address : "",
            google_maps_link: typeof legacyLoc.google_maps_link === "string" ? legacyLoc.google_maps_link : "",
          }
          : { name: "", address: "", google_maps_link: "" });

      const description =
        (typeof primary?.why_this_fits === "string" && primary.why_this_fits.trim()) ||
        (typeof plan.logic_reasoning === "string" ? plan.logic_reasoning : null);

      // Derive the calendar location id (Google place_id) from the venue's maps link.
      const locationDetailsTyped = locationDetails as Record<string, unknown>;
      const mapsLink = typeof locationDetailsTyped.google_maps_link === "string" ? locationDetailsTyped.google_maps_link : "";
      const m = mapsLink.match(/place_id:([A-Za-z0-9_-]+)/);
      const locationId = m?.[1] ?? null;

      const partIds = Array.isArray(pRow.participant_ids) ? (pRow.participant_ids as string[]) : [];
      let plannerItemId: string | null = null;
      let pivotUpdatedInPlace = false;

      // Weather-pivot confirmations UPDATE the original plan's planner_items / confirmed_events
      // row in place (same ids, new indoor content) instead of inserting a second entry.
      // Otherwise "Use indoor plan" would leave the user with two confirmed plans (outdoor A +
      // indoor B) — and two calendar events — for the same date. The original plan is preserved
      // under meta.weather_pivot for reference. See docs/AI_CONCIERGE_SPEC.md "Weather pivot".
      if (pRow.status === "pivot_pending" && isUuid((pRow as { pivot_of?: unknown }).pivot_of)) {
        const pivotOf = (pRow as { pivot_of?: string }).pivot_of as string;
        const { data: original } = await supabase
          .from("pending_plans")
          .select("id, planner_item_id, plan_json")
          .eq("id", pivotOf)
          .maybeSingle();
        const originalItemId = (original as { planner_item_id?: string | null } | null)?.planner_item_id ?? null;
        if (original && isUuid(originalItemId)) {
          await supabase.from("planner_items").update({
            title: topic,
            description,
            starts_at: dt,
            ends_at: endsAt,
            meta: {
              winkly_plan: plan,
              weather_pivot: {
                applied_at: new Date().toISOString(),
                pivot_of_plan_id: (original as { id?: string }).id ?? pivotOf,
                original_plan_json: (original as { plan_json?: unknown }).plan_json ?? null,
              },
            },
            updated_at: new Date().toISOString(),
          }).eq("id", originalItemId as string);

          // Keep event_uid + id stable so external calendar sync still points at the same event.
          await supabase.from("confirmed_events").update({
            title: topic,
            location_id: locationId,
            booking_url: null,
          }).eq("planner_item_id", originalItemId as string);

          await supabase.from("pending_plans").update({
            status: "pivot_confirmed",
            planner_item_id: originalItemId as string,
            updated_at: new Date().toISOString(),
          }).eq("id", pendingPlanId);

          plannerItemId = originalItemId as string;
          pivotUpdatedInPlace = true;
        }
      }

      if (!pivotUpdatedInPlace) {
        const { data: item, error: itemErr } = await supabase
          .from("planner_items")
          .insert({
            created_by: pRow.created_by,
            source_mode: pRow.source_mode,
            title: topic,
            description,
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

        plannerItemId = item.id;
      }

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
                  planner_item_id: plannerItemId,
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

