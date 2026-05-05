/**
 * Reservation discovery links (OpenTable / Resy style) — discovery only, not confirmed bookings.
 * Real programmatic booking requires partner API contracts (often enterprise).
 */

/** OpenTable search URL (US-centric; adjust locale via env later). */
export function buildOpenTableSearchUrl(params: {
  term: string;
  metroId?: string;
  /** ISO date YYYY-MM-DD */
  date?: string;
  /** e.g. 19:00 */
  time?: string;
  partySize?: number;
}): string {
  const base = "https://www.opentable.com/s";
  const u = new URL(base);
  u.searchParams.set("term", params.term.trim());
  if (params.metroId) u.searchParams.set("metroId", params.metroId);
  if (params.date) u.searchParams.set("date", params.date);
  if (params.time) u.searchParams.set("time", params.time);
  if (params.partySize != null) u.searchParams.set("covers", String(params.partySize));
  return u.toString();
}

/** Resy city landing (discovery; venue-specific URLs need Resy slug). */
export function buildResyCitySearchUrl(city: string): string {
  const slug = city.trim().toLowerCase().replace(/\s+/g, "-");
  return `https://resy.com/cities/${encodeURIComponent(slug)}`;
}

/** Payload for ai-gateway allowlisted `booking_context`. */
export function buildBookingContextForAi(params: {
  venueQuery: string;
  city?: string;
  dateIso?: string;
}): {
  opentable_search_url: string;
  resy_city_url?: string;
  disclaimer: string;
} {
  const date = params.dateIso ? params.dateIso.slice(0, 10) : undefined;
  return {
    opentable_search_url: buildOpenTableSearchUrl({
      term: params.venueQuery + (params.city ? ` ${params.city}` : ""),
      date,
      partySize: 2,
    }),
    resy_city_url: params.city ? buildResyCitySearchUrl(params.city) : undefined,
    disclaimer: "Discovery links only — not a confirmed reservation. User completes booking on provider site or Winkly partner flow.",
  };
}
