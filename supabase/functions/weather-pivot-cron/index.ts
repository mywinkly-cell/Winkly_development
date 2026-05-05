/**
 * weather-pivot-cron — re-check weather ~24h before confirmed plans and create a pivot pending plan when severe.
 *
 * Invocation:
 * - Intended for Supabase scheduled trigger (or external cron) with header `x-cron-secret`.
 * - Uses service role to scan confirmed pending_plans that start ~24h ahead.
 *
 * Notification delivery is intentionally DB-first:
 * - We create a pivot plan row (`pending_plans.status='pivot_pending'`, `pivot_of=<original>`).
 * - The mobile app can poll or subscribe to show a "Weather pivot suggested" banner.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

async function geocodeCity(city: string): Promise<{ lat: number; lng: number } | null> {
  const url = new URL("https://geocoding-api.open-meteo.com/v1/search");
  url.searchParams.set("name", city);
  url.searchParams.set("count", "1");
  const res = await fetch(url.toString());
  if (!res.ok) return null;
  const data = await res.json();
  const results = data.results;
  if (!results?.length) return null;
  return { lat: results[0].latitude, lng: results[0].longitude };
}

async function getOpenMeteoDaily(lat: number, lng: number, date: string): Promise<{ precipitation_sum?: number[]; weathercode?: number[] } | null> {
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", String(lat));
  url.searchParams.set("longitude", String(lng));
  url.searchParams.set("daily", "weathercode,precipitation_sum");
  url.searchParams.set("timezone", "auto");
  url.searchParams.set("start", date);
  url.searchParams.set("end", date);
  const res = await fetch(url.toString());
  if (!res.ok) return null;
  const data = await res.json();
  return (data.daily ?? data) as { precipitation_sum?: number[]; weathercode?: number[] };
}

function severityFromDaily(d: { precipitation_sum?: number[]; weathercode?: number[] } | null): number {
  if (!d) return 0;
  const p = Array.isArray(d.precipitation_sum) ? d.precipitation_sum[0] : 0;
  const wc = Array.isArray(d.weathercode) ? d.weathercode[0] : 0;
  const precip = typeof p === "number" ? p : 0;
  // Weather codes: 95/96/99 thunderstorm variants; 65+ heavy rain; 75+ heavy snow.
  const thunder = wc === 95 || wc === 96 || wc === 99 ? 80 : 0;
  const heavy = wc >= 65 ? 40 : 0;
  const precipScore = precip >= 20 ? 70 : precip >= 12 ? 55 : precip >= 8 ? 40 : precip >= 4 ? 25 : 0;
  return Math.max(thunder, heavy, precipScore);
}

async function findIndoorVenue(city: string, topic: string): Promise<{ name: string; address: string; google_maps_link: string } | null> {
  const key = Deno.env.get("GOOGLE_PLACES_API_KEY") ?? Deno.env.get("GOOGLE_MAPS_API_KEY");
  if (!key) return null;
  const q = `indoor ${topic} ${city}`.slice(0, 220);
  const url =
    `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(q)}&key=${encodeURIComponent(key)}`;
  const res = await fetch(url);
  const data = await res.json() as { status?: string; results?: Array<Record<string, unknown>> };
  if (data.status !== "OK" || !Array.isArray(data.results) || data.results.length === 0) return null;
  const r0 = data.results[0];
  const name = typeof r0.name === "string" ? r0.name : null;
  const addr = typeof r0.formatted_address === "string" ? r0.formatted_address : "";
  const placeId = typeof r0.place_id === "string" ? r0.place_id : null;
  if (!name || !placeId) return null;
  return { name, address: addr, google_maps_link: `https://www.google.com/maps/place/?q=place_id:${placeId}` };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: { "Access-Control-Allow-Origin": "*" } });
  }
  const secret = Deno.env.get("CRON_SECRET") ?? "";
  const got = req.headers.get("x-cron-secret") ?? "";
  if (secret && got !== secret) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const { data: rows, error } = await supabase
      .from("pending_plans")
      .select("id, created_by, source_mode, participant_ids, plan_json, status, pivot_of, conversation_id")
      .in("status", ["confirmed", "pivot_confirmed"])
      .order("created_at", { ascending: false })
      .limit(80);
    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }

    let pivotCreated = 0;
    for (const r of (rows ?? []) as Array<Record<string, unknown>>) {
      const plan = (r.plan_json ?? {}) as Record<string, unknown>;
      const dateTime = typeof plan.date_time === "string" ? plan.date_time : null;
      const topic = typeof plan.topic === "string" ? plan.topic : "Plan";
      if (!dateTime) continue;
      const startsMs = new Date(dateTime).getTime();
      const now = Date.now();
      const hoursAhead = (startsMs - now) / (60 * 60 * 1000);
      if (hoursAhead < 23 || hoursAhead > 27) continue;
      const date = new Date(dateTime).toISOString().slice(0, 10);

      // Use creator's city as weather anchor (privacy: city-level only).
      const { data: core } = await supabase.from("profiles_core").select("city").eq("id", r.created_by as string).maybeSingle();
      const city = typeof core?.city === "string" && core.city.trim() ? core.city.trim() : "Berlin";

      const coords = await geocodeCity(city);
      if (!coords) continue;
      const daily = await getOpenMeteoDaily(coords.lat, coords.lng, date);
      const severity = severityFromDaily(daily);
      const threshold = Number(Deno.env.get("WEATHER_SEVERITY_THRESHOLD") ?? 55);
      if (severity < threshold) continue;

      // Skip if a pivot is already pending for this plan.
      const { data: existingPivot } = await supabase
        .from("pending_plans")
        .select("id")
        .eq("pivot_of", r.id as string)
        .in("status", ["pivot_pending", "pivot_confirmed"])
        .maybeSingle();
      if (existingPivot?.id) continue;

      const venue = await findIndoorVenue(city, topic);
      const pivotPlan = {
        topic: `Pivot: ${topic}`.slice(0, 120),
        date_time: dateTime,
        duration: typeof plan.duration === "number" ? plan.duration : 120,
        location_details: venue ?? { name: "No suitable venue found", address: "", google_maps_link: "" },
        weather_context: `Weather severity=${severity} (threshold=${threshold}) for ${city} on ${date}.`,
        booking_links: Array.isArray(plan.booking_links) ? plan.booking_links : [],
        logic_reasoning: "Weather check 24h before the plan indicates severe conditions; proposing an indoor pivot.",
        weather_alert: true,
      };

      const ins = await supabase.from("pending_plans").insert({
        created_by: r.created_by,
        source_mode: (typeof r.source_mode === "string" ? r.source_mode : "romance"),
        participant_ids: Array.isArray(r.participant_ids) ? r.participant_ids : [r.created_by],
        conversation_id: typeof r.conversation_id === "string" ? r.conversation_id : null,
        plan_json: pivotPlan,
        status: "pivot_pending",
        pivot_of: r.id,
      }).select("id").single();
      if (!ins.error) {
        pivotCreated++;
        const pivotId = (ins.data as { id?: string } | null)?.id;
        const conversationId = typeof r.conversation_id === "string" ? r.conversation_id : null;
        if (pivotId && conversationId) {
          // Push a pivot proposal into the chat (DB-first notification).
          await supabase.from("messages").insert({
            conversation_id: conversationId,
            sender_id: r.created_by,
            message_type: "system",
            content: "Weather alert: I suggested an indoor pivot. Tap to review and confirm the updated plan.",
            metadata: { kind: "weather_pivot_proposal", pivot_pending_plan_id: pivotId, pivot_of: r.id, severity, city, date },
          }).then(() => {}).catch(() => {});
        }
      }
    }

    return new Response(JSON.stringify({ ok: true, pivot_created: pivotCreated }), {
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  } catch (e) {
    console.error("weather-pivot-cron:", e);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  }
});

