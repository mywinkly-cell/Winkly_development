/**
 * Location context injection — parallel Radar + Google Places (+ OSM fallback)
 * for [SYSTEM_CONTEXT] blocks before LLM calls.
 */

const LOCATION_FETCH_TIMEOUT_MS = 2800;

export type LocationContextInjection = {
  user_message: string;
  city: string;
  country?: string;
  google_places: unknown[];
  radar: unknown[];
  osm_nominatim: unknown[];
  fetched_at: string;
};

export function extractUserMessageFromContext(context: Record<string, unknown>): string {
  const parts = [
    typeof context.plan_request_text === "string" ? context.plan_request_text.trim() : "",
    typeof context.user_prompt === "string" ? context.user_prompt.trim() : "",
    typeof context.activity_hint === "string" ? context.activity_hint.trim() : "",
    typeof context.theme === "string" ? context.theme.trim() : "",
  ].filter(Boolean);
  const merged = parts.join(" · ").trim();
  return merged.slice(0, 600);
}

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}

async function fetchGooglePlacesHints(input: {
  query: string;
  city: string;
  country?: string;
}): Promise<unknown[]> {
  const placesKey = Deno.env.get("GOOGLE_PLACES_API_KEY") ?? Deno.env.get("GOOGLE_MAPS_API_KEY");
  if (!placesKey || !input.query || !input.city) return [];

  try {
    const textQuery = `${input.query} ${input.city} ${input.country ?? ""}`.trim().slice(0, 280);
    const url =
      `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(textQuery)}&key=${encodeURIComponent(placesKey)}`;
    const res = await fetch(url);
    const data = await res.json() as { results?: Array<Record<string, unknown>>; status?: string };
    if (data.status !== "OK" && data.status !== "ZERO_RESULTS") return [];
    const results = data.results ?? [];
    return results.slice(0, 5).map((r) => {
      const fa = typeof r.formatted_address === "string" ? r.formatted_address : "";
      const areaHint = fa
        ? fa.split(",").slice(-2).map((s) => s.trim()).filter(Boolean).join(", ")
        : undefined;
      return {
        source: "google_places",
        name: r.name,
        formatted_address: areaHint ?? undefined,
        place_id: r.place_id,
        rating: r.rating,
        types: Array.isArray(r.types) ? (r.types as string[]).slice(0, 6) : undefined,
      };
    });
  } catch (e) {
    console.warn("[ai-gateway] Google Places (SYSTEM_CONTEXT):", e);
    return [];
  }
}

async function fetchRadarHints(input: {
  query: string;
  city: string;
  country?: string;
  lat?: number | null;
  lng?: number | null;
}): Promise<unknown[]> {
  const radarKey = Deno.env.get("RADAR_SECRET_KEY") ?? Deno.env.get("RADAR_API_KEY");
  if (!radarKey || !input.query) return [];

  let near = "";
  if (typeof input.lat === "number" && typeof input.lng === "number") {
    near = `${input.lat},${input.lng}`;
  }

  try {
    const params = new URLSearchParams({
      query: `${input.query} ${input.city}`.trim().slice(0, 200),
      layers: "place",
      limit: "6",
    });
    if (near) params.set("near", near);
    if (input.country) params.set("countryCode", input.country.slice(0, 2).toUpperCase());

    const url = `https://api.radar.io/v1/search/autocomplete?${params.toString()}`;
    const res = await fetch(url, {
      headers: { Authorization: radarKey },
    });
    const data = await res.json() as {
      meta?: { code?: number };
      addresses?: Array<Record<string, unknown>>;
      places?: Array<Record<string, unknown>>;
    };
    if (data.meta?.code !== 200) return [];

    const rows = data.addresses ?? data.places ?? [];
    return rows.slice(0, 6).map((r) => ({
      source: "radar",
      name: r.placeLabel ?? r.formattedAddress ?? r.addressLabel ?? r.name,
      formatted_address: r.formattedAddress ?? r.addressLabel,
      latitude: r.latitude,
      longitude: r.longitude,
      chain: r.chain ?? undefined,
      categories: r.categories,
    }));
  } catch (e) {
    console.warn("[ai-gateway] Radar (SYSTEM_CONTEXT):", e);
    return [];
  }
}

async function fetchOsmHints(input: {
  query: string;
  city: string;
  country?: string;
}): Promise<unknown[]> {
  if (!input.query || !input.city) return [];
  try {
    const q = encodeURIComponent(`${input.query} ${input.city} ${input.country ?? ""}`.trim().slice(0, 200));
    const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=4`, {
      headers: { "User-Agent": "WinklyApp/1.0 (ai-gateway; https://mywinkly.de)" },
    });
    const arr = await res.json() as Array<{ display_name?: string; lat?: string; lon?: string }>;
    return (arr ?? []).slice(0, 4).map((r) => {
      const dn = r.display_name ?? "";
      const areaHint = dn
        ? dn.split(",").slice(-3).map((s) => s.trim()).filter(Boolean).slice(0, 2).join(", ")
        : undefined;
      return {
        source: "osm_nominatim",
        name: dn.split(",")[0]?.trim() ?? dn,
        formatted_address: areaHint ?? undefined,
        lat: r.lat,
        lon: r.lon,
      };
    });
  } catch (e) {
    console.warn("[ai-gateway] OSM (SYSTEM_CONTEXT):", e);
    return [];
  }
}

/** Rapid parallel location fetches keyed off the user's message. */
export async function buildLocationContextInjection(
  context: Record<string, unknown>,
  geocodeCity?: (city: string) => Promise<{ lat: number; lng: number } | null>,
): Promise<LocationContextInjection | null> {
  const userMessage = extractUserMessageFromContext(context);
  const city = String(context.city ?? "").trim();
  if (!userMessage && !city) return null;

  const country = typeof context.country === "string" ? context.country : undefined;
  const query = userMessage || String(context.activity_hint ?? context.theme ?? "restaurant").trim();

  let lat = typeof context.latitude === "number" ? context.latitude : null;
  let lng = typeof context.longitude === "number" ? context.longitude : null;
  if ((lat == null || lng == null) && city && geocodeCity) {
    const coords = await geocodeCity(city);
    if (coords) {
      lat = coords.lat;
      lng = coords.lng;
    }
  }

  const base = { query, city, country, lat, lng };
  const empty: LocationContextInjection = {
    user_message: userMessage || query,
    city,
    country,
    google_places: [],
    radar: [],
    osm_nominatim: [],
    fetched_at: new Date().toISOString(),
  };

  const [google_places, radar, osm_nominatim] = await Promise.all([
    withTimeout(fetchGooglePlacesHints(base), LOCATION_FETCH_TIMEOUT_MS, []),
    withTimeout(fetchRadarHints(base), LOCATION_FETCH_TIMEOUT_MS, []),
    withTimeout(fetchOsmHints(base), LOCATION_FETCH_TIMEOUT_MS, []),
  ]);

  return {
    ...empty,
    google_places,
    radar,
    osm_nominatim,
  };
}

/** Merge location hints for EXTERNAL_PLACE_HINTS (dedupe by name). */
export function mergeLocationHints(injection: LocationContextInjection): unknown[] {
  const seen = new Set<string>();
  const out: unknown[] = [];
  for (const list of [injection.google_places, injection.radar, injection.osm_nominatim]) {
    for (const item of list) {
      const name = String((item as { name?: string }).name ?? "").trim().toLowerCase();
      if (!name || seen.has(name)) continue;
      seen.add(name);
      out.push(item);
    }
  }
  return out.slice(0, 8);
}

/** Explicit [SYSTEM_CONTEXT] block injected into the system prompt before the LLM. */
export function formatSystemContextBlock(injection: LocationContextInjection): string {
  const payload = {
    user_message: injection.user_message,
    city: injection.city,
    country: injection.country ?? null,
    location_services: {
      google_places: injection.google_places,
      radar: injection.radar,
      osm_nominatim: injection.osm_nominatim,
    },
    guidance:
      "Use these pre-fetched POI hints for venue names and logistics only — not confirmed bookings. Prefer Winkly rows when present.",
    fetched_at: injection.fetched_at,
  };
  return `[SYSTEM_CONTEXT]\n${JSON.stringify(payload)}\n[/SYSTEM_CONTEXT]`;
}
