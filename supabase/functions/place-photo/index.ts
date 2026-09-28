// place-photo — venue pictures for Planner items, plan suggestions, Weekly Spark and the
// wishlist, without shipping the Google key to the app.
//
//   GET /place-photo?place_id=ChIJ...&i=0&w=800          → the image (streamed)
//   GET /place-photo?name=Café+Luitpold&city=München     → same, after a cached lookup
//   GET /place-photo?place_id=...&format=json            → { count, attributions[] }
//
// Only a Google photo *reference* is stored (verified_places.photos); the bytes are fetched
// from Google per request and streamed through (never a redirect), so neither the Google key
// nor the user's JWT leaves Winkly. Clients cache the image for a day.
//
// Auth: default verify_jwt (signed-in users only). Free-text lookups are cached in
// place_lookup_cache, so a venue name costs one Places Text Search ever, not per view.
// Google requires the photo author's attribution to be shown: the JSON form returns it.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, withCorsEmpty } from "../_shared/cors.ts";
import {
  lookupPlaceIdCached,
  resolveVerifiedPlaceWithPhotos,
} from "../_shared/verifiedPlace.ts";

const PHOTO_ENDPOINT = "https://maps.googleapis.com/maps/api/place/photo";
const MAX_WIDTH = 1600;
const DEFAULT_WIDTH = 800;
/** Browsers/RN image caches may keep the redirect for a day; Google allows short caching. */
const CACHE_SECONDS = 86400;

function json(req: Request, status: number, body: unknown, extra: Record<string, string> = {}): Response {
  const h = corsHeaders(req, { methods: "GET, OPTIONS" });
  h.set("Content-Type", "application/json");
  for (const [k, v] of Object.entries(extra)) h.set(k, v);
  return new Response(JSON.stringify(body), { status, headers: h });
}

function clampInt(raw: string | null, min: number, max: number, fallback: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}

function coord(raw: string | null): number | null {
  const n = Number(raw);
  return raw !== null && raw !== "" && Number.isFinite(n) ? n : null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return withCorsEmpty(req, { status: 204 });
  if (req.method !== "GET") return json(req, 405, { error: "GET only" });

  const url = new URL(req.url);
  const placesKey = Deno.env.get("GOOGLE_PLACES_API_KEY") ?? Deno.env.get("GOOGLE_MAPS_API_KEY") ?? null;
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } },
  );

  try {
    let placeId = (url.searchParams.get("place_id") ?? "").trim().slice(0, 300) || null;
    if (!placeId) {
      const name = (url.searchParams.get("name") ?? "").trim().slice(0, 120);
      if (!name) return json(req, 400, { error: "place_id or name required" });
      placeId = await lookupPlaceIdCached(supabase, {
        name,
        city: (url.searchParams.get("city") ?? "").trim().slice(0, 80) || null,
        placesKey,
        lat: coord(url.searchParams.get("lat")),
        lng: coord(url.searchParams.get("lng")),
      });
    }
    if (!placeId) return json(req, 404, { error: "no place" }, { "Cache-Control": `private, max-age=${CACHE_SECONDS}` });

    const place = await resolveVerifiedPlaceWithPhotos(supabase, placeId, placesKey);
    const photos = place?.photos ?? [];

    if (url.searchParams.get("format") === "json") {
      return json(
        req,
        200,
        {
          place_id: placeId,
          name: place?.name ?? null,
          count: photos.length,
          attributions: photos.map((p) => p.attribution),
        },
        { "Cache-Control": `private, max-age=${CACHE_SECONDS}` },
      );
    }

    const i = clampInt(url.searchParams.get("i"), 0, Math.max(0, photos.length - 1), 0);
    const photo = photos[i];
    if (!photo || !placesKey) {
      return json(req, 404, { error: "no photo" }, { "Cache-Control": `private, max-age=${CACHE_SECONDS}` });
    }

    const w = clampInt(url.searchParams.get("w"), 100, MAX_WIDTH, DEFAULT_WIDTH);
    const upstream = new URL(PHOTO_ENDPOINT);
    upstream.searchParams.set("maxwidth", String(w));
    upstream.searchParams.set("photo_reference", photo.ref);
    upstream.searchParams.set("key", placesKey);

    // Stream the bytes instead of redirecting: the app sends the user's JWT with this request,
    // and some image loaders forward custom headers across a redirect — that would leak the
    // token to Google. Following the redirect server-side keeps both the key and the JWT here.
    const res = await fetch(upstream.toString(), { redirect: "follow" });
    const h = corsHeaders(req, { methods: "GET, OPTIONS" });
    h.set("Cache-Control", `private, max-age=${CACHE_SECONDS}`);
    const type = res.headers.get("content-type") ?? "";
    if (res.ok && res.body && type.startsWith("image/")) {
      h.set("Content-Type", type);
      return new Response(res.body, { status: 200, headers: h });
    }
    return json(req, 502, { error: "photo unavailable" });
  } catch (e) {
    console.error("[place-photo] error:", e);
    return json(req, 500, { error: "internal" });
  }
});
