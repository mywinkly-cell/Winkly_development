// get-nearby-external-events — Fetch events from Ticketmaster, Meetup, Eventbrite within radius of user location.
// Set TICKETMASTER_API_KEY (primary; free Discovery API key) and optionally MEETUP_API_KEY /
// EVENTBRITE_PRIVATE_TOKEN in Supabase Edge Function secrets. Each provider is best-effort and only
// runs when its key is present; the function degrades to whatever providers are configured.
// See docs/EXTERNAL_EVENTS_AND_FILTERING.md

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, withCorsEmpty } from "../_shared/cors.ts";

type ExternalEvent = {
  id: string;
  title: string;
  description?: string | null;
  imageUrl?: string | null;
  startAt: string;
  endAt?: string | null;
  location?: string | null;
  venueName?: string | null;
  hostName?: string | null;
  externalUrl?: string | null;
  externalPlatform: "ticketmaster" | "meetup" | "eventbrite";
  category?: string | null;
};

type Body = {
  latitude: number;
  longitude: number;
  radius_km?: number;
  category?: string | null;
  from?: string | null;
  to?: string | null;
};

/** Encode lat/lon to a geohash for Ticketmaster's `geoPoint` param (replaces the deprecated `latlong`). */
function encodeGeohash(lat: number, lon: number, precision = 9): string {
  const BASE32 = "0123456789bcdefghjkmnpqrstuvwxyz";
  let idx = 0;
  let bit = 0;
  let evenBit = true;
  let geohash = "";
  let latMin = -90, latMax = 90, lonMin = -180, lonMax = 180;
  while (geohash.length < precision) {
    if (evenBit) {
      const lonMid = (lonMin + lonMax) / 2;
      if (lon >= lonMid) { idx = idx * 2 + 1; lonMin = lonMid; } else { idx = idx * 2; lonMax = lonMid; }
    } else {
      const latMid = (latMin + latMax) / 2;
      if (lat >= latMid) { idx = idx * 2 + 1; latMin = latMid; } else { idx = idx * 2; latMax = latMid; }
    }
    evenBit = !evenBit;
    if (++bit === 5) { geohash += BASE32[idx]; bit = 0; idx = 0; }
  }
  return geohash;
}

/** Ticketmaster requires ISO-8601 with no milliseconds: YYYY-MM-DDTHH:mm:ssZ. */
function toTicketmasterDateTime(iso: string): string | undefined {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toISOString().replace(/\.\d{3}Z$/, "Z");
}

/** Pick a reasonably sized 16:9 image from a Ticketmaster event's images array. */
function pickTicketmasterImage(images: Array<{ url?: string; width?: number; ratio?: string }> | undefined): string | null {
  if (!Array.isArray(images) || images.length === 0) return null;
  const usable = images.filter((i) => typeof i?.url === "string");
  if (usable.length === 0) return null;
  const wide = usable.filter((i) => i.ratio === "16_9");
  const pool = (wide.length ? wide : usable).slice().sort((a, b) => (b.width ?? 0) - (a.width ?? 0));
  // Prefer a card-sized image (<= 1024px wide) over the largest hero, fall back to the largest.
  const pick = pool.find((i) => (i.width ?? 0) <= 1024) ?? pool[0];
  return pick?.url ?? null;
}

/** Fetch events from the Ticketmaster Discovery API v2. Requires TICKETMASTER_API_KEY (free dev key). */
async function fetchTicketmasterEvents(
  apiKey: string,
  lat: number,
  lon: number,
  radiusKm: number,
  category: string | null,
  from: string | null,
  to: string | null
): Promise<ExternalEvent[]> {
  try {
    const url = new URL("https://app.ticketmaster.com/discovery/v2/events.json");
    url.searchParams.set("apikey", apiKey);
    url.searchParams.set("geoPoint", encodeGeohash(lat, lon, 9));
    url.searchParams.set("radius", String(Math.max(1, Math.round(radiusKm))));
    url.searchParams.set("unit", "km");
    url.searchParams.set("size", "20");
    url.searchParams.set("sort", "date,asc");
    if (category && category.trim()) url.searchParams.set("keyword", category.trim());
    const start = toTicketmasterDateTime(from ?? new Date().toISOString());
    if (start) url.searchParams.set("startDateTime", start);
    if (to) {
      const end = toTicketmasterDateTime(to);
      if (end) url.searchParams.set("endDateTime", end);
    }

    const res = await fetch(url.toString());
    if (!res.ok) return [];

    const data = await res.json();
    const events = data?._embedded?.events ?? [];
    const out: ExternalEvent[] = [];

    for (const ev of events) {
      if (!ev?.id) continue;
      const venue = ev._embedded?.venues?.[0] ?? {};
      const cityName = venue.city?.name ?? null;
      const line1 = venue.address?.line1 ?? null;
      const loc = [cityName, line1].filter(Boolean).join(", ") || venue.name || null;
      const startDateTime = ev.dates?.start?.dateTime
        ?? (ev.dates?.start?.localDate
          ? `${ev.dates.start.localDate}T${ev.dates.start.localTime ?? "00:00:00"}Z`
          : null);
      const segment = ev.classifications?.[0]?.segment?.name ?? null;

      out.push({
        id: `ticketmaster_${ev.id}`,
        title: ev.name ?? "Event",
        description:
          typeof ev.info === "string" ? ev.info.slice(0, 500)
          : typeof ev.pleaseNote === "string" ? ev.pleaseNote.slice(0, 500)
          : null,
        imageUrl: pickTicketmasterImage(ev.images),
        startAt: startDateTime ?? new Date().toISOString(),
        endAt: ev.dates?.end?.dateTime ?? null,
        location: loc,
        venueName: venue.name ?? null,
        hostName: ev._embedded?.attractions?.[0]?.name ?? null,
        externalUrl: ev.url ?? null,
        externalPlatform: "ticketmaster",
        category: category ?? segment ?? null,
      });
    }
    return out;
  } catch (err) {
    console.error("Ticketmaster fetch error:", err);
    return [];
  }
}

/** Reverse geocode lat/lng to display address (for Eventbrite which uses address string). Rate limit: 1 req/sec for Nominatim. */
async function reverseGeocode(lat: number, lon: number): Promise<string> {
  try {
    const url = new URL("https://nominatim.openstreetmap.org/reverse");
    url.searchParams.set("lat", String(lat));
    url.searchParams.set("lon", String(lon));
    url.searchParams.set("format", "json");
    url.searchParams.set("addressdetails", "0");
    const res = await fetch(url.toString(), {
      headers: { "User-Agent": "WinklyApp/1.0" },
    });
    if (!res.ok) return `${lat},${lon}`;
    const data = await res.json();
    const name = data?.display_name ?? data?.address?.city ?? data?.address?.town;
    if (typeof name === "string" && name.length > 0) return name;
    return `${lat},${lon}`;
  } catch {
    return `${lat},${lon}`;
  }
}

/** Fetch events from Meetup GraphQL (keywordSearch). Requires MEETUP_API_KEY. */
async function fetchMeetupEvents(
  token: string,
  lat: number,
  lon: number,
  radiusKm: number,
  category: string | null
): Promise<ExternalEvent[]> {
  const radiusMiles = Math.max(1, Math.round(radiusKm * 0.621371));
  const query = category && category.trim() ? category.trim() : "events";

  const gql = `
    query KeywordSearch($lat: Float!, $lon: Float!, $radius: Int!, $query: String!) {
      keywordSearch(
        filter: {
          lat: $lat
          lon: $lon
          radius: $radius
          source: EVENTS
          eventType: PHYSICAL
          query: $query
        }
        first: 20
      ) {
        count
        edges {
          node {
            result {
              ... on Event {
                id
                title
                description
                dateTime
                endTime
                eventUrl
                imageUrl
                venue { name address }
                group { name }
              }
            }
          }
        }
      }
    }
  `;

  try {
    const res = await fetch("https://api.meetup.com/gql", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
      },
      body: JSON.stringify({
        query: gql,
        variables: { lat, lon, radius: radiusMiles, query },
      }),
    });

    if (!res.ok) return [];

    const data = await res.json();
    const edges = data?.data?.keywordSearch?.edges ?? [];
    const out: ExternalEvent[] = [];

    for (const e of edges) {
      const node = e?.node?.result;
      if (!node?.id) continue;
      const venue = node.venue;
      const loc = venue?.address ?? venue?.name ?? null;
      out.push({
        id: `meetup_${node.id}`,
        title: node.title ?? "Event",
        description: typeof node.description === "string" ? node.description.slice(0, 500) : null,
        imageUrl: node.imageUrl ?? null,
        startAt: node.dateTime ?? new Date().toISOString(),
        endAt: node.endTime ?? null,
        location: loc,
        venueName: venue?.name ?? null,
        hostName: node.group?.name ?? null,
        externalUrl: node.eventUrl ?? null,
        externalPlatform: "meetup",
        category: category ?? null,
      });
    }
    return out;
  } catch (err) {
    console.error("Meetup fetch error:", err);
    return [];
  }
}

/** Fetch events from Eventbrite REST API. Requires EVENTBRITE_PRIVATE_TOKEN. */
async function fetchEventbriteEvents(
  token: string,
  address: string,
  radiusKm: number,
  category: string | null
): Promise<ExternalEvent[]> {
  const within = `${Math.round(radiusKm)}km`;

  try {
    const url = new URL("https://www.eventbriteapi.com/v3/events/search/");
    url.searchParams.set("token", token);
    url.searchParams.set("location.address", address);
    url.searchParams.set("location.within", within);
    url.searchParams.set("expand", "venue,organizer");
    url.searchParams.set("page_size", "20");
    if (category && category.trim()) {
      url.searchParams.set("q", category.trim());
    }

    const res = await fetch(url.toString());
    if (!res.ok) return [];

    const data = await res.json();
    const events = data?.events ?? [];
    const out: ExternalEvent[] = [];

    for (const ev of events) {
      const id = ev.id ?? ev.event_id;
      if (!id) continue;
      const start = ev.start?.local ?? ev.start?.utc ?? ev.start;
      const end = ev.end?.local ?? ev.end?.utc ?? ev.end;
      const venue = ev.venue ?? {};
      const addr = venue.address;
      const loc = addr
        ? [addr.city, addr.region, addr.address_1].filter(Boolean).join(", ")
        : venue.name ?? null;

      out.push({
        id: `eventbrite_${id}`,
        title: ev.name?.text ?? ev.name ?? "Event",
        description: ev.description?.text ? String(ev.description.text).slice(0, 500) : null,
        imageUrl: ev.logo?.url ?? ev.logo?.original?.url ?? null,
        startAt: typeof start === "string" ? start : new Date(start).toISOString(),
        endAt: end ? (typeof end === "string" ? end : new Date(end).toISOString()) : null,
        location: loc,
        venueName: venue.name ?? null,
        hostName: ev.organizer?.name ?? null,
        externalUrl: ev.url ?? null,
        externalPlatform: "eventbrite",
        category: category ?? null,
      });
    }
    return out;
  } catch (err) {
    console.error("Eventbrite fetch error:", err);
    return [];
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return withCorsEmpty(req, { status: 204 });
  }

  try {
    const cors = corsHeaders(req);
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401,
        headers: { "Content-Type": "application/json", ...Object.fromEntries(cors) },
      });
    }

    const body = (await req.json()) as Body;
    const { latitude, longitude, radius_km = 30, category, from, to } = body;

    if (typeof latitude !== "number" || typeof longitude !== "number") {
      return new Response(JSON.stringify({ error: "latitude and longitude required" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...Object.fromEntries(cors) },
      });
    }

    const ticketmasterKey = Deno.env.get("TICKETMASTER_API_KEY");
    const meetupKey = Deno.env.get("MEETUP_API_KEY");
    const eventbriteToken = Deno.env.get("EVENTBRITE_PRIVATE_TOKEN");

    const allEvents: ExternalEvent[] = [];

    if (ticketmasterKey) {
      const ticketmasterEvents = await fetchTicketmasterEvents(
        ticketmasterKey,
        latitude,
        longitude,
        radius_km,
        category ?? null,
        from ?? null,
        to ?? null
      );
      allEvents.push(...ticketmasterEvents);
    }

    if (meetupKey) {
      const meetupEvents = await fetchMeetupEvents(
        meetupKey,
        latitude,
        longitude,
        radius_km,
        category ?? null
      );
      allEvents.push(...meetupEvents);
    }

    if (eventbriteToken) {
      const address = await reverseGeocode(latitude, longitude);
      const eventbriteEvents = await fetchEventbriteEvents(
        eventbriteToken,
        address,
        radius_km,
        category ?? null
      );
      allEvents.push(...eventbriteEvents);
    }

    // Optional: filter by from/to date if provided
    let result = allEvents;
    if (from || to) {
      const fromTs = from ? new Date(from).getTime() : 0;
      const toTs = to ? new Date(to).getTime() : Number.MAX_SAFE_INTEGER;
      result = allEvents.filter((e) => {
        const t = new Date(e.startAt).getTime();
        return t >= fromTs && t <= toTs;
      });
    }

    // Dedupe by id and sort by startAt
    result = result.sort(
      (a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime()
    );

    return new Response(JSON.stringify({ events: result }), {
      headers: {
        "Content-Type": "application/json",
        ...Object.fromEntries(cors),
      },
    });
  } catch (e) {
    console.error("get-nearby-external-events error:", e);
    return new Response(
      JSON.stringify({ error: "Internal error", events: [] }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...Object.fromEntries(corsHeaders(req)) },
      }
    );
  }
});
