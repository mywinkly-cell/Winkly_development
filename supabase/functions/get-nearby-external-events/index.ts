// get-nearby-external-events — the Events catalogue feed: events and bookable activities from
// connected platforms near the user, merged and ranked for them.
//
// Providers (each best-effort, only when its secret is set):
//   TICKETMASTER_API_KEY      — concerts, shows, sports (primary; free Discovery API key)
//   MEETUP_API_KEY            — community meetups (Meetup Pro GraphQL)
//   EVENTBRITE_PRIVATE_TOKEN  — Eventbrite (search is restricted by Eventbrite; kept for accounts with access)
//   GETYOURGUIDE_API_KEY      — tours & activities (GetYourGuide Partner API, needs partner approval)
//
// The same real-world event listed on several platforms comes back as ONE item with
// `offers` (one per platform, cheapest first) — see _shared/events/catalog.ts.
// Location: lat/lng, or a `city` name (geocoded) for browsing another city.
// Ranking: when `interests` are sent, items are ordered for the user and carry `match` reasons.
// See docs/EXTERNAL_EVENTS_AND_FILTERING.md

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, withCorsEmpty } from "../_shared/cors.ts";
import {
  mergeDuplicateEvents,
  rankForProfile,
  type RawCatalogEvent,
  type VenueType,
} from "../_shared/events/catalog.ts";

type ExternalEvent = RawCatalogEvent;

type Body = {
  latitude?: number | null;
  longitude?: number | null;
  /** Browse another city: geocoded server-side when lat/lng are absent. */
  city?: string | null;
  radius_km?: number;
  category?: string | null;
  from?: string | null;
  to?: string | null;
  /** Profile interests for personal ranking (tags only — no other profile data is sent). */
  interests?: string[] | null;
  /** Only keep items of this coarse venue type. */
  venue_type?: VenueType | null;
  /** App language for provider content where supported (e.g. "de"). */
  language?: string | null;
};

function numOrNull(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

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
      const genre = ev.classifications?.[0]?.genre?.name ?? null;
      const price = Array.isArray(ev.priceRanges) ? ev.priceRanges[0] : null;

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
        city: cityName,
        latitude: numOrNull(Number(venue.location?.latitude)),
        longitude: numOrNull(Number(venue.location?.longitude)),
        hostName: ev._embedded?.attractions?.[0]?.name ?? null,
        category: [segment, genre].filter((x) => x && x !== "Undefined").join(" · ") || category || null,
        kind: "event",
        offer: ev.url
          ? {
              platform: "ticketmaster",
              url: ev.url,
              priceMin: numOrNull(price?.min),
              priceMax: numOrNull(price?.max),
              currency: typeof price?.currency === "string" ? price.currency : null,
            }
          : null,
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
                venue { name address city lat lng }
                group { name }
                feeSettings { amount currency }
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
        city: venue?.city ?? null,
        latitude: numOrNull(venue?.lat),
        longitude: numOrNull(venue?.lng),
        hostName: node.group?.name ?? null,
        category: category ?? null,
        kind: "event",
        offer: node.eventUrl
          ? {
              platform: "meetup",
              url: node.eventUrl,
              priceMin: numOrNull(node.feeSettings?.amount),
              currency: node.feeSettings?.currency ?? null,
              isFree: node.feeSettings ? false : true,
            }
          : null,
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
        city: addr?.city ?? null,
        latitude: numOrNull(Number(addr?.latitude)),
        longitude: numOrNull(Number(addr?.longitude)),
        hostName: ev.organizer?.name ?? null,
        category: category ?? null,
        kind: "event",
        offer: ev.url
          ? { platform: "eventbrite", url: ev.url, isFree: typeof ev.is_free === "boolean" ? ev.is_free : null }
          : null,
      });
    }
    return out;
  } catch (err) {
    console.error("Eventbrite fetch error:", err);
    return [];
  }
}

/**
 * GetYourGuide Partner API — tours & activities around a point. Requires GETYOURGUIDE_API_KEY
 * (partner account). Activities are bookable on many days, so they are `kind: "activity"`
 * and dated to the start of the requested window.
 * NOTE: verify field names and the picture `[format_id]` against your partner docs when the
 * key is issued — this adapter is defensive and returns [] on any unexpected shape.
 */
async function fetchGetYourGuideActivities(
  token: string,
  lat: number,
  lon: number,
  radiusKm: number,
  category: string | null,
  from: string | null,
  language: string | null
): Promise<ExternalEvent[]> {
  try {
    const url = new URL("https://api.getyourguide.com/1/tours");
    url.searchParams.set("cnt_language", (language ?? "en").slice(0, 2));
    url.searchParams.set("currency", "EUR");
    url.searchParams.append("coordinates[]", String(lat));
    url.searchParams.append("coordinates[]", String(lon));
    url.searchParams.append("coordinates[]", String(Math.max(1, Math.round(radiusKm))));
    url.searchParams.set("limit", "20");
    url.searchParams.set("sortfield", "popularity");
    if (category && category.trim()) url.searchParams.set("q", category.trim());

    const res = await fetch(url.toString(), {
      headers: { "X-ACCESS-TOKEN": token, "Accept": "application/json" },
    });
    if (!res.ok) return [];
    const data = await res.json();
    const tours = data?.data?.tours ?? [];
    if (!Array.isArray(tours)) return [];
    const startAt = from ?? new Date().toISOString();
    const out: ExternalEvent[] = [];
    for (const t of tours) {
      const id = t?.tour_id ?? t?.id;
      const link = typeof t?.url === "string" ? t.url : null;
      if (!id || !t?.title || !link) continue;
      const rawPic = Array.isArray(t.pictures) ? t.pictures[0]?.url : null;
      const imageUrl = typeof rawPic === "string" ? rawPic.replace("[format_id]", "21") : null;
      const loc = Array.isArray(t.locations) ? t.locations[0] : null;
      out.push({
        id: `getyourguide_${id}`,
        title: String(t.title).slice(0, 200),
        description: typeof t.abstract === "string" ? t.abstract.slice(0, 500) : null,
        imageUrl,
        startAt,
        endAt: null,
        location: typeof loc?.name === "string" ? loc.name : null,
        venueName: null,
        city: typeof loc?.name === "string" ? loc.name : null,
        latitude: numOrNull(loc?.coordinates?.lat),
        longitude: numOrNull(loc?.coordinates?.long ?? loc?.coordinates?.lng),
        hostName: null,
        category: category ?? "Tours & activities",
        kind: "activity",
        offer: {
          platform: "getyourguide",
          url: link,
          priceMin: numOrNull(t?.price?.values?.amount),
          currency: "EUR",
        },
      });
    }
    return out;
  } catch (err) {
    console.error("GetYourGuide fetch error:", err);
    return [];
  }
}

/** City name → coordinates (Nominatim, 1 req/s policy — one call per request). */
async function geocodeCity(city: string): Promise<{ lat: number; lon: number } | null> {
  try {
    const url = new URL("https://nominatim.openstreetmap.org/search");
    url.searchParams.set("q", city.slice(0, 120));
    url.searchParams.set("format", "json");
    url.searchParams.set("limit", "1");
    const res = await fetch(url.toString(), { headers: { "User-Agent": "WinklyApp/1.0" } });
    if (!res.ok) return null;
    const data = await res.json();
    const lat = Number(data?.[0]?.lat);
    const lon = Number(data?.[0]?.lon);
    return Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : null;
  } catch {
    return null;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return withCorsEmpty(req, { status: 204 });
  }

  const jsonHeaders = () => ({ "Content-Type": "application/json", ...Object.fromEntries(corsHeaders(req)) });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), { status: 401, headers: jsonHeaders() });
    }

    const body = (await req.json()) as Body;
    const radius_km = Math.max(1, Math.min(100, Number(body.radius_km) || 30));
    const category = typeof body.category === "string" && body.category.trim() ? body.category.trim().slice(0, 80) : null;
    const from = body.from ?? null;
    const to = body.to ?? null;

    let latitude = numOrNull(body.latitude);
    let longitude = numOrNull(body.longitude);
    const city = typeof body.city === "string" ? body.city.trim().slice(0, 120) : "";
    if ((latitude === null || longitude === null) && city) {
      const geo = await geocodeCity(city);
      if (geo) {
        latitude = geo.lat;
        longitude = geo.lon;
      }
    }
    if (latitude === null || longitude === null) {
      return new Response(JSON.stringify({ error: "latitude/longitude or city required", events: [] }), {
        status: 400,
        headers: jsonHeaders(),
      });
    }

    const ticketmasterKey = Deno.env.get("TICKETMASTER_API_KEY");
    const meetupKey = Deno.env.get("MEETUP_API_KEY");
    const eventbriteToken = Deno.env.get("EVENTBRITE_PRIVATE_TOKEN");
    const gygKey = Deno.env.get("GETYOURGUIDE_API_KEY");
    const lat = latitude;
    const lon = longitude;

    // Providers run in parallel; order of the lists decides which listing's title/id wins a merge
    // (Ticketmaster first: most complete venue data).
    const lists = await Promise.all([
      ticketmasterKey ? fetchTicketmasterEvents(ticketmasterKey, lat, lon, radius_km, category, from, to) : Promise.resolve([]),
      meetupKey ? fetchMeetupEvents(meetupKey, lat, lon, radius_km, category) : Promise.resolve([]),
      eventbriteToken
        ? reverseGeocode(lat, lon).then((address) => fetchEventbriteEvents(eventbriteToken, address, radius_km, category))
        : Promise.resolve([]),
      gygKey ? fetchGetYourGuideActivities(gygKey, lat, lon, radius_km, category, from, body.language ?? null) : Promise.resolve([]),
    ]);
    let raw: ExternalEvent[] = lists.flat();

    // Dated events must fall inside the window; activities are bookable any day.
    if (from || to) {
      const fromTs = from ? new Date(from).getTime() : 0;
      const toTs = to ? new Date(to).getTime() : Number.MAX_SAFE_INTEGER;
      raw = raw.filter((e) => {
        if (e.kind === "activity") return true;
        const t = new Date(e.startAt).getTime();
        return t >= fromTs && t <= toTs;
      });
    }

    let events = mergeDuplicateEvents(raw);
    if (body.venue_type) events = events.filter((e) => e.venueType === body.venue_type);

    const interests = Array.isArray(body.interests)
      ? body.interests.filter((x): x is string => typeof x === "string").map((x) => x.slice(0, 40)).slice(0, 30)
      : [];
    events = rankForProfile(events, { interests, latitude: lat, longitude: lon });

    return new Response(
      JSON.stringify({ events, center: { latitude: lat, longitude: lon } }),
      { headers: jsonHeaders() },
    );
  } catch (e) {
    console.error("get-nearby-external-events error:", e);
    return new Response(JSON.stringify({ error: "Internal error", events: [] }), {
      status: 500,
      headers: jsonHeaders(),
    });
  }
});
