// get-nearby-external-events — Fetch events from Meetup, Eventbrite within radius of user location.
// Set MEETUP_API_KEY and/or EVENTBRITE_PRIVATE_TOKEN in Supabase Edge Function secrets.
// See docs/EXTERNAL_EVENTS_AND_FILTERING.md

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

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
  externalPlatform: "meetup" | "eventbrite";
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
    return new Response(null, { headers: { "Access-Control-Allow-Origin": "*" } });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const body = (await req.json()) as Body;
    const { latitude, longitude, radius_km = 30, category, from, to } = body;

    if (typeof latitude !== "number" || typeof longitude !== "number") {
      return new Response(JSON.stringify({ error: "latitude and longitude required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const meetupKey = Deno.env.get("MEETUP_API_KEY");
    const eventbriteToken = Deno.env.get("EVENTBRITE_PRIVATE_TOKEN");

    const allEvents: ExternalEvent[] = [];

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
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (e) {
    console.error("get-nearby-external-events error:", e);
    return new Response(
      JSON.stringify({ error: "Internal error", events: [] }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
});
