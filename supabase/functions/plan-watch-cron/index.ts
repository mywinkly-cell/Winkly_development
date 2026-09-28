// plan-watch-cron — every 15 min (pg_cron, x-cron-secret): look at upcoming plans and tell
// the people in them as soon as something changes that affects the plan:
//
//   • Weather (up to 48 h ahead): storms, heavy rain, snow at the plan's place and time —
//     plus light rain / heat / freezing cold when the plan is clearly outdoors.
//     Source: Open-Meteo hourly forecast (free, no key).
//   • Traffic (30–150 min before the start): 15+ min and 30 %+ slower than usual from the
//     participant's saved (coarse) location. Source: Google Distance Matrix (needs
//     GOOGLE_MAPS_API_KEY / GOOGLE_PLACES_API_KEY with the Distance Matrix API enabled).
//
// Each alert is a plan_alerts row (once per user / plan / condition, so a change is
// announced once) + a push in the user's language. The app shows it on the plan with
// actions: change the time, tell the others (plan-update "notify"), dismiss.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, withCorsEmpty } from "../_shared/cors.ts";
import { cronSecretOk } from "../_shared/timingSafeEqual.ts";
import { sendExpoPushMessages, type ExpoPushMessage } from "../_shared/expoPush.ts";
import { lookupPlaceIdCached, resolveVerifiedPlace } from "../_shared/verifiedPlace.ts";
import {
  assessTraffic,
  assessWeather,
  isOutdoorPlan,
  watchWindows,
  type HourlyWeather,
} from "../_shared/planWatch/rules.ts";
import { planAlertPush } from "../_shared/planNotify/messages.ts";

const WEATHER_MIN_SEVERITY = Number(Deno.env.get("PLAN_WEATHER_MIN_SEVERITY") ?? 40);
const MAX_ITEMS = 400;
const MAX_PLACE_LOOKUPS = 25; // paid Places calls per run (cached afterwards)
const MAX_TRAFFIC_CALLS = 60;

type Item = {
  id: string;
  title: string;
  description: string | null;
  starts_at: string;
  ends_at: string | null;
  meta: Record<string, unknown> | null;
};

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

async function openMeteoHourly(lat: number, lng: number): Promise<HourlyWeather[]> {
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", lat.toFixed(3));
  url.searchParams.set("longitude", lng.toFixed(3));
  url.searchParams.set("hourly", "precipitation,precipitation_probability,weathercode,temperature_2m");
  url.searchParams.set("forecast_days", "3");
  url.searchParams.set("timezone", "UTC");
  const res = await fetch(url.toString());
  if (!res.ok) return [];
  const d = (await res.json()) as { hourly?: Record<string, unknown[]> };
  const h = d.hourly ?? {};
  const times = (h.time ?? []) as string[];
  return times.map((t, i) => ({
    time: /T\d\d:\d\d$/.test(t) ? `${t}:00Z` : t, // Open-Meteo: "2026-10-04T17:00" (UTC)
    precipitation: (h.precipitation?.[i] as number) ?? null,
    precipitationProbability: (h.precipitation_probability?.[i] as number) ?? null,
    weatherCode: (h.weathercode?.[i] as number) ?? null,
    temperature: (h.temperature_2m?.[i] as number) ?? null,
  }));
}

async function geocodeName(name: string): Promise<{ lat: number; lng: number } | null> {
  const url = new URL("https://geocoding-api.open-meteo.com/v1/search");
  url.searchParams.set("name", name.slice(0, 80));
  url.searchParams.set("count", "1");
  const res = await fetch(url.toString());
  if (!res.ok) return null;
  const d = (await res.json()) as { results?: Array<{ latitude: number; longitude: number }> };
  const r = d.results?.[0];
  return r ? { lat: r.latitude, lng: r.longitude } : null;
}

async function travelSeconds(
  key: string,
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
): Promise<{ normal: number; traffic: number; meters: number } | null> {
  const url = new URL("https://maps.googleapis.com/maps/api/distancematrix/json");
  url.searchParams.set("origins", `${from.lat},${from.lng}`);
  url.searchParams.set("destinations", `${to.lat},${to.lng}`);
  url.searchParams.set("departure_time", "now");
  url.searchParams.set("mode", "driving");
  url.searchParams.set("key", key);
  const res = await fetch(url.toString());
  if (!res.ok) return null;
  const d = (await res.json()) as {
    rows?: Array<{ elements?: Array<{ status?: string; duration?: { value: number }; duration_in_traffic?: { value: number }; distance?: { value: number } }> }>;
  };
  const el = d.rows?.[0]?.elements?.[0];
  if (!el || el.status !== "OK" || !el.duration || !el.duration_in_traffic) return null;
  return { normal: el.duration.value, traffic: el.duration_in_traffic.value, meters: el.distance?.value ?? 0 };
}

/** Where the plan happens: verified place → free-text venue (cached lookup) → city name. */
async function planCoords(
  supabase: SupabaseClient,
  item: Item,
  placesKey: string | null,
  budget: { lookups: number },
): Promise<{ lat: number; lng: number } | null> {
  const meta = item.meta ?? {};
  let placeId = str(meta.place_id);
  const venue = meta.venue && typeof meta.venue === "object" ? (meta.venue as Record<string, unknown>) : null;
  placeId = placeId ?? str(venue?.place_id);
  const name = str(meta.venue_name) ?? str(venue?.name) ?? str(meta.place) ?? str(meta.location);
  if (!placeId && name && placesKey && budget.lookups > 0) {
    budget.lookups--;
    placeId = await lookupPlaceIdCached(supabase, { name, placesKey });
  }
  if (placeId) {
    const p = await resolveVerifiedPlace(supabase, { placeId, placesKey, ttlDays: 30 });
    if (p?.lat != null && p?.lng != null) return { lat: p.lat, lng: p.lng };
  }
  const loc = str(meta.location);
  if (loc) {
    const city = loc.split(",").map((s) => s.trim()).filter(Boolean).pop() ?? loc;
    return await geocodeName(city);
  }
  return null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return withCorsEmpty(req, { status: 204 });
  const cors = corsHeaders(req);
  const reply = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...Object.fromEntries(cors) } });
  if (!cronSecretOk(req)) return reply(401, { error: "Unauthorized" });

  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");
    const placesKey = Deno.env.get("GOOGLE_PLACES_API_KEY") ?? Deno.env.get("GOOGLE_MAPS_API_KEY") ?? null;
    const now = Date.now();

    const { data: rows } = await supabase
      .from("planner_items")
      .select("id, title, description, starts_at, ends_at, meta")
      .gt("starts_at", new Date(now).toISOString())
      .lt("starts_at", new Date(now + 48 * 3600_000).toISOString())
      .order("starts_at", { ascending: true })
      .limit(MAX_ITEMS);
    const items = ((rows ?? []) as Item[]).filter((i) => !(i.meta ?? {}).cancelled_at);

    const budget = { lookups: MAX_PLACE_LOOKUPS, traffic: MAX_TRAFFIC_CALLS };
    const weatherCache = new Map<string, HourlyWeather[]>();
    const pushes: ExpoPushMessage[] = [];
    let weatherAlerts = 0;
    let trafficAlerts = 0;

    for (const item of items) {
      const win = watchWindows(item.starts_at, now);
      if (!win.weather && !win.traffic) continue;

      const { data: partRows } = await supabase
        .from("planner_participants")
        .select("user_id")
        .eq("planner_item_id", item.id)
        .in("role", ["owner", "attendee"])
        .is("cancelled_at", null);
      const userIds = ((partRows ?? []) as Array<{ user_id: string }>).map((p) => p.user_id);
      if (!userIds.length) continue;

      const coords = await planCoords(supabase, item, placesKey, budget);
      if (!coords) continue;

      const { data: tokRows } = await supabase
        .from("user_push_tokens")
        .select("user_id, expo_push_token, locale, timezone")
        .in("user_id", userIds);
      const tokens = (tokRows ?? []) as Array<{ user_id: string; expo_push_token: string; locale: string | null; timezone: string | null }>;

      // Insert-if-new: the unique key makes each condition announce itself once.
      const alertOnce = async (userId: string, kind: "weather" | "traffic", condition: string, severity: number, data: Record<string, unknown>) => {
        const { data: ins, error } = await supabase
          .from("plan_alerts")
          .insert({ user_id: userId, planner_item_id: item.id, kind, condition, severity, data })
          .select("id")
          .maybeSingle();
        return !error && !!ins;
      };

      if (win.weather) {
        const key = `${coords.lat.toFixed(2)},${coords.lng.toFixed(2)}`;
        let hourly = weatherCache.get(key);
        if (!hourly) {
          hourly = await openMeteoHourly(coords.lat, coords.lng);
          weatherCache.set(key, hourly);
        }
        const outdoor = isOutdoorPlan([item.title, item.description, str(item.meta?.location), str(item.meta?.venue_name)].join(" "));
        const w = assessWeather(hourly, { startsAt: item.starts_at, endsAt: item.ends_at, outdoor });
        if (w && w.severity >= WEATHER_MIN_SEVERITY) {
          for (const uid of userIds) {
            const isNew = await alertOnce(uid, "weather", w.condition, w.severity, { at: w.atIso, outdoor, title: item.title });
            if (!isNew) continue;
            weatherAlerts++;
            for (const t of tokens.filter((x) => x.user_id === uid)) {
              const text = planAlertPush({ kind: "weather", locale: t.locale, timeZone: t.timezone, title: item.title, condition: w.condition, atIso: w.atIso });
              pushes.push({ to: t.expo_push_token, ...text, data: { winkly_kind: "plan_alert", planner_item_id: item.id, alert: "weather" } });
            }
          }
        }
      }

      if (win.traffic && placesKey) {
        const { data: coordRows } = await supabase.rpc("plan_watch_user_coords", { p_user_ids: userIds });
        for (const c of (coordRows ?? []) as Array<{ user_id: string; lat: number; lng: number }>) {
          if (budget.traffic <= 0) break;
          budget.traffic--;
          const trip = await travelSeconds(placesKey, { lat: c.lat, lng: c.lng }, coords);
          if (!trip || trip.meters < 3000) continue; // walking distance: traffic doesn't matter
          const a = assessTraffic({ startsAt: item.starts_at, normalSeconds: trip.normal, inTrafficSeconds: trip.traffic, nowMs: now });
          if (!a) continue;
          const isNew = await alertOnce(c.user_id, "traffic", "delay", Math.min(100, 30 + a.extraMinutes), {
            extra_minutes: a.extraMinutes,
            leave_by: a.leaveByIso,
            title: item.title,
          });
          if (!isNew) continue;
          trafficAlerts++;
          for (const t of tokens.filter((x) => x.user_id === c.user_id)) {
            const text = planAlertPush({ kind: "traffic", locale: t.locale, timeZone: t.timezone, title: item.title, extraMinutes: a.extraMinutes, leaveByIso: a.leaveByIso });
            pushes.push({ to: t.expo_push_token, ...text, data: { winkly_kind: "plan_alert", planner_item_id: item.id, alert: "traffic" } });
          }
        }
      }
    }

    for (let i = 0; i < pushes.length; i += 100) {
      await sendExpoPushMessages(pushes.slice(i, i + 100)).catch(() => ({ ok: false }));
    }
    return reply(200, { ok: true, checked: items.length, weather_alerts: weatherAlerts, traffic_alerts: trafficAlerts });
  } catch (e) {
    console.error("[plan-watch-cron]", e);
    return reply(500, { error: "Internal error" });
  }
});
