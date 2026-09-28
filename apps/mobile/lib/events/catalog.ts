// apps/mobile/lib/events/catalog.ts
// The Events catalogue: what's on near you (or in a city you pick), from every connected
// platform, merged and pre-filtered for your profile — so you don't have to check five
// apps every Friday. The heavy lifting (provider calls, merging duplicates, ranking)
// happens in the get-nearby-external-events Edge Function; this module is the client side:
// loading, a short-lived cache the details screen reads from, sponsored venue offers and
// display helpers.

import { supabase } from "@/lib/supabase";
import { fetchNearbyExternalEvents, type ExternalEventsStatus } from "@/lib/externalEvents";
import type { EventCardItem, EventOffer } from "@/components/ui/EventCard";
import type { VenueType } from "../../../../supabase/functions/_shared/events/catalog";

export type { VenueType };

/** Venue/activity types offered as catalogue filters (order = chip order). */
export const CATALOG_VENUE_TYPES: readonly VenueType[] = [
  "music",
  "nightlife",
  "theatre",
  "museum",
  "food",
  "outdoor",
  "sports",
  "workshop",
  "tour",
] as const;

// ── Cache for the details screen ─────────────────────────────────────────────
// Catalogue items come from third-party APIs and have no row in our DB, so the details
// screen looks them up here by id (kept for the app session, capped).

const MAX_CACHED = 300;
const itemCache = new Map<string, EventCardItem>();

export function rememberCatalogItems(items: EventCardItem[]): void {
  for (const it of items) {
    itemCache.delete(it.id);
    itemCache.set(it.id, it);
  }
  while (itemCache.size > MAX_CACHED) {
    const oldest = itemCache.keys().next().value;
    if (oldest === undefined) break;
    itemCache.delete(oldest);
  }
}

export function getCachedCatalogItem(id: string): EventCardItem | null {
  return itemCache.get(id) ?? null;
}

// ── Profile signals ──────────────────────────────────────────────────────────

/** The user's own interest tags across their mode profiles (only tags leave the device). */
export async function getMyInterestTags(): Promise<string[]> {
  try {
    const { data: auth } = await supabase.auth.getUser();
    const uid = auth.user?.id;
    if (!uid) return [];
    const { data } = await supabase.from("profiles_mode").select("interests").eq("user_id", uid);
    const all = (data ?? []).flatMap((r: { interests?: unknown }) =>
      Array.isArray(r.interests) ? r.interests.filter((x): x is string => typeof x === "string") : []
    );
    return Array.from(new Set(all.map((x) => x.trim()).filter(Boolean))).slice(0, 30);
  } catch {
    return [];
  }
}

// ── Loading ──────────────────────────────────────────────────────────────────

export type CatalogQuery = {
  /** Device location ("near me"). Ignored when `city` is set. */
  coords?: { latitude: number; longitude: number } | null;
  /** Browse a specific city instead of the device location. */
  city?: string | null;
  from: string;
  to: string;
  venueType?: VenueType | null;
  interests?: string[];
  language?: string;
};

export type CatalogResult = {
  items: EventCardItem[];
  status: ExternalEventsStatus;
};

export async function loadCatalog(q: CatalogQuery): Promise<CatalogResult> {
  const useCity = !!q.city?.trim();
  // No location and no city yet: nothing to search — "empty" asks the user to pick a city.
  if (!useCity && !q.coords) return { items: [], status: "empty" };
  const { events, status } = await fetchNearbyExternalEvents({
    latitude: useCity ? null : q.coords?.latitude ?? null,
    longitude: useCity ? null : q.coords?.longitude ?? null,
    city: useCity ? q.city!.trim() : null,
    radiusKm: 30,
    from: q.from,
    to: q.to,
    venueType: q.venueType ?? null,
    interests: q.interests ?? [],
    language: q.language,
  });
  rememberCatalogItems(events);
  return { items: events, status };
}

// ── Sponsored venue offers ───────────────────────────────────────────────────

export type SponsoredOffer = {
  id: string;
  venueName: string;
  title: string;
  description: string | null;
  imageUrl: string | null;
  linkUrl: string | null;
  ctaKind: "visit" | "book" | "menu" | "offer";
  priceLabel: string | null;
  placeId: string | null;
  address: string | null;
  city: string;
  latitude: number | null;
  longitude: number | null;
  venueType: string | null;
  interestTags: string[];
  weight: number;
};

type SponsoredRow = {
  id: string;
  venue_name: string;
  title: string;
  description: string | null;
  image_url: string | null;
  link_url: string | null;
  cta_kind: SponsoredOffer["ctaKind"];
  price_label: string | null;
  place_id: string | null;
  address: string | null;
  city: string;
  latitude: number | null;
  longitude: number | null;
  venue_type: string | null;
  interest_tags: string[] | null;
  weight: number;
};

/** Live sponsored offers for a city (RLS only returns active, in-window rows). */
export async function loadSponsoredOffers(city: string | null | undefined): Promise<SponsoredOffer[]> {
  const c = (city ?? "").trim();
  if (!c) return [];
  try {
    const { data, error } = await supabase
      .from("sponsored_venue_offers")
      .select(
        "id, venue_name, title, description, image_url, link_url, cta_kind, price_label, place_id, address, city, latitude, longitude, venue_type, interest_tags, weight"
      )
      .ilike("city", c)
      .limit(20);
    if (error || !data) return [];
    return (data as SponsoredRow[]).map((r) => ({
      id: r.id,
      venueName: r.venue_name,
      title: r.title,
      description: r.description,
      imageUrl: r.image_url,
      linkUrl: r.link_url,
      ctaKind: r.cta_kind,
      priceLabel: r.price_label,
      placeId: r.place_id,
      address: r.address,
      city: r.city,
      latitude: r.latitude,
      longitude: r.longitude,
      venueType: r.venue_type,
      interestTags: r.interest_tags ?? [],
      weight: r.weight,
    }));
  } catch {
    return [];
  }
}

/**
 * Choose which sponsored offers to show: matching the selected venue type (if any), then
 * interest overlap, then the paid weight. At most `max` so ads never crowd the catalogue.
 */
export function pickSponsoredOffers(
  offers: SponsoredOffer[],
  opts: { interests?: string[]; venueType?: string | null; max?: number }
): SponsoredOffer[] {
  const max = opts.max ?? 2;
  const mine = new Set((opts.interests ?? []).map((x) => x.toLowerCase()));
  const pool = opts.venueType ? offers.filter((o) => !o.venueType || o.venueType === opts.venueType) : offers;
  return pool
    .map((o) => ({
      o,
      score: o.interestTags.filter((t) => mine.has(t.toLowerCase())).length * 10 + o.weight,
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, max)
    .map((x) => x.o);
}

/** Slot sponsored cards into the list: after the 3rd item, then every 8 items. */
export function interleaveSponsored<T, S>(items: T[], sponsored: S[]): ({ kind: "item"; item: T } | { kind: "sponsored"; offer: S })[] {
  const out: ({ kind: "item"; item: T } | { kind: "sponsored"; offer: S })[] = [];
  let s = 0;
  items.forEach((item, i) => {
    out.push({ kind: "item", item });
    const pos = i + 1;
    if (s < sponsored.length && (pos === 3 || (pos > 3 && (pos - 3) % 8 === 0))) {
      out.push({ kind: "sponsored", offer: sponsored[s++] });
    }
  });
  // Short lists still show one sponsored card at the end.
  if (s === 0 && sponsored.length > 0 && items.length > 0) out.push({ kind: "sponsored", offer: sponsored[0] });
  return out;
}

/** Record an impression / tap / save / plan for venue reporting. Fire-and-forget. */
export function recordSponsoredEvent(offerId: string, kind: "impression" | "tap" | "save" | "plan"): void {
  void supabase
    .from("sponsored_offer_events")
    .insert({ offer_id: offerId, kind })
    .then(() => undefined, () => undefined);
}

// ── Display helpers ──────────────────────────────────────────────────────────

/** Cheapest offer with a known price (free counts as 0). */
export function cheapestOffer(offers: EventOffer[] | null | undefined): EventOffer | null {
  let best: EventOffer | null = null;
  for (const o of offers ?? []) {
    const p = o.isFree ? 0 : typeof o.priceMin === "number" ? o.priceMin : null;
    if (p === null) continue;
    const bp = best ? (best.isFree ? 0 : (best.priceMin as number)) : Infinity;
    if (p < bp) best = o;
  }
  return best;
}

/** Local date range [from, to] (ISO) for a day / week (Mon–Sun) / month around `date`. */
export function catalogRange(range: "day" | "week" | "month", date: Date): { from: Date; to: Date } {
  const from = new Date(date);
  from.setHours(0, 0, 0, 0);
  const to = new Date(from);
  if (range === "day") {
    to.setHours(23, 59, 59, 999);
  } else if (range === "week") {
    const offset = (from.getDay() + 6) % 7; // Monday-based weeks, as in most of Europe
    from.setDate(from.getDate() - offset);
    to.setTime(from.getTime());
    to.setDate(from.getDate() + 6);
    to.setHours(23, 59, 59, 999);
  } else {
    from.setDate(1);
    to.setTime(from.getTime());
    to.setMonth(from.getMonth() + 1, 0);
    to.setHours(23, 59, 59, 999);
  }
  // Never search the past: a range that started earlier begins now.
  const now = new Date();
  if (from < now && to > now) from.setTime(now.getTime());
  return { from, to };
}
