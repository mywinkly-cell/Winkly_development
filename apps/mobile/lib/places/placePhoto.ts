// apps/mobile/lib/places/placePhoto.ts
// Venue pictures everywhere a place is shown (Planner items, AI plan options, Weekly Spark,
// wishlist, events). A plan should show what the place looks like without opening Maps.
//
// Photos come from the `place-photo` Edge Function (Google Places photos, key kept on the
// server). Priority: an explicit image URL (event/wishlist photo) → a Google place id →
// a venue name + city lookup (cached server-side, so each venue is looked up once).

export type PlacePhotoSource = {
  /** A ready image (event poster, saved wishlist photo). Must be https. */
  imageUrl?: string | null;
  /** Google place id (verified venues, Weekly Spark). */
  placeId?: string | null;
  /** Free-text venue, used when there is no place id. */
  name?: string | null;
  city?: string | null;
  latitude?: number | null;
  longitude?: number | null;
};

/** True when the source can produce a picture at all. */
export function hasPlacePhotoSource(src: PlacePhotoSource | null | undefined): boolean {
  if (!src) return false;
  return !!(safeImageUrl(src.imageUrl) || src.placeId?.trim() || src.name?.trim());
}

export function safeImageUrl(url: string | null | undefined): string | null {
  const u = (url ?? "").trim();
  return /^https:\/\//i.test(u) ? u : null;
}

/**
 * The URL to load for a source, or null. `index` picks another photo of the same place
 * (gallery); `width` is the requested pixel width (server clamps 100–1600).
 */
export function placePhotoUrl(
  supabaseUrl: string | null | undefined,
  src: PlacePhotoSource,
  opts: { index?: number; width?: number } = {}
): string | null {
  const direct = safeImageUrl(src.imageUrl);
  if (direct && !opts.index) return direct;
  const base = (supabaseUrl ?? "").replace(/\/$/, "");
  if (!base) return direct;
  const params = new URLSearchParams();
  const placeId = src.placeId?.trim();
  const name = src.name?.trim();
  if (placeId) params.set("place_id", placeId);
  else if (name) {
    params.set("name", name.slice(0, 120));
    if (src.city?.trim()) params.set("city", src.city.trim().slice(0, 80));
    if (typeof src.latitude === "number" && typeof src.longitude === "number") {
      params.set("lat", src.latitude.toFixed(3));
      params.set("lng", src.longitude.toFixed(3));
    }
  } else return direct;
  // With a direct image, gallery index 0 is that image, so place photos start one later.
  const i = Math.max(0, (opts.index ?? 0) - (direct ? 1 : 0));
  if (i) params.set("i", String(i));
  params.set("w", String(Math.round(Math.max(100, Math.min(1600, opts.width ?? 800)))));
  return `${base}/functions/v1/place-photo?${params.toString()}`;
}

/** True when the URL is our photo endpoint (needs the user's auth header). */
export function isPlacePhotoEndpoint(url: string): boolean {
  return url.includes("/functions/v1/place-photo?");
}
