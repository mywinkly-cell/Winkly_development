// ─────────────────────────────────────────────────────────────────────────────
// Events catalogue — pure logic shared by get-nearby-external-events (Deno) and
// the mobile Jest suite (see apps/mobile/__tests__/eventCatalog.test.ts).
//
// Import-free on purpose so both runtimes can load it.
//
// What it does:
//  1. mergeDuplicateEvents — the same concert listed on Ticketmaster AND Eventbrite
//     becomes ONE catalogue item with a list of booking options (like Google Maps
//     lists several booking sites with prices for one hotel).
//  2. inferVenueType — a coarse "type of venue" for the catalogue filter.
//  3. rankForProfile — orders items for one user (interests, distance, time) and
//     returns the concrete reasons so the card can say *why* it is shown.
// ─────────────────────────────────────────────────────────────────────────────

export type EventPlatform =
  | "ticketmaster"
  | "meetup"
  | "eventbrite"
  | "getyourguide"
  | "winkly";

/** One place to book / buy tickets for a catalogue item. */
export type EventOffer = {
  platform: EventPlatform;
  url: string;
  /** Lowest known price in major units (e.g. 24.5 = €24.50). null = unknown. */
  priceMin?: number | null;
  priceMax?: number | null;
  /** ISO 4217 code. */
  currency?: string | null;
  isFree?: boolean | null;
};

export type VenueType =
  | "music"
  | "nightlife"
  | "theatre"
  | "museum"
  | "food"
  | "outdoor"
  | "sports"
  | "workshop"
  | "tour"
  | "other";

export const VENUE_TYPES: readonly VenueType[] = [
  "music",
  "nightlife",
  "theatre",
  "museum",
  "food",
  "outdoor",
  "sports",
  "workshop",
  "tour",
  "other",
] as const;

/** A single provider listing, before merging. */
export type RawCatalogEvent = {
  id: string;
  title: string;
  description?: string | null;
  imageUrl?: string | null;
  startAt: string;
  endAt?: string | null;
  location?: string | null;
  venueName?: string | null;
  city?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  hostName?: string | null;
  category?: string | null;
  /** "activity" = bookable any day (tours, classes) rather than one dated event. */
  kind?: "event" | "activity";
  offer?: EventOffer | null;
};

export type MatchReason =
  | { type: "interest"; value: string }
  | { type: "distance"; km: number }
  | { type: "soon" };

/** A merged catalogue item. `externalUrl`/`externalPlatform` mirror the cheapest offer for older clients. */
export type CatalogEvent = Omit<RawCatalogEvent, "offer"> & {
  images: string[];
  offers: EventOffer[];
  venueType: VenueType;
  externalUrl: string | null;
  externalPlatform: EventPlatform | null;
  match?: MatchReason[];
  score?: number;
};

// ── Text normalisation ───────────────────────────────────────────────────────

const STOP_WORDS = new Set([
  "the", "a", "an", "and", "live", "tour", "in", "at", "of", "with", "feat", "ft",
  "der", "die", "das", "und", "im", "am", "mit", "le", "la", "les", "et",
  "tickets", "ticket", "concert", "konzert", "2024", "2025", "2026", "2027",
]);

/** Lowercase, strip accents/punctuation, split into meaningful tokens. */
export function titleTokens(title: string): string[] {
  return title
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOP_WORDS.has(t));
}

function jaccard(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const sa = new Set(a);
  const sb = new Set(b);
  let inter = 0;
  for (const t of sa) if (sb.has(t)) inter++;
  return inter / (sa.size + sb.size - inter);
}

/** Share of the shorter title's tokens that appear in the longer one. */
function containment(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const [small, big] = a.length <= b.length ? [a, b] : [b, a];
  const sb = new Set(big);
  let hit = 0;
  for (const t of new Set(small)) if (sb.has(t)) hit++;
  return hit / new Set(small).size;
}

export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

const SAME_EVENT_MAX_START_GAP_MS = 3 * 60 * 60 * 1000;

function hasCoords(e: RawCatalogEvent | CatalogEvent): boolean {
  return typeof e.latitude === "number" && typeof e.longitude === "number";
}

/** Venues are "compatible" when unknown on either side, within 1 km, or similarly named. */
function sameVenue(a: RawCatalogEvent | CatalogEvent, b: RawCatalogEvent): boolean {
  if (hasCoords(a) && hasCoords(b)) {
    return haversineKm(a.latitude!, a.longitude!, b.latitude!, b.longitude!) <= 1;
  }
  const va = titleTokens(a.venueName ?? "");
  const vb = titleTokens(b.venueName ?? "");
  if (va.length === 0 || vb.length === 0) return true;
  return containment(va, vb) >= 0.5;
}

/** True when two listings describe the same real-world event. */
export function isSameEvent(a: RawCatalogEvent | CatalogEvent, b: RawCatalogEvent): boolean {
  const ta = Date.parse(a.startAt);
  const tb = Date.parse(b.startAt);
  const bothActivities = a.kind === "activity" && b.kind === "activity";
  if (!bothActivities) {
    if (Number.isNaN(ta) || Number.isNaN(tb)) return false;
    if (Math.abs(ta - tb) > SAME_EVENT_MAX_START_GAP_MS) return false;
  }
  const ka = titleTokens(a.title);
  const kb = titleTokens(b.title);
  const similar = jaccard(ka, kb) >= 0.6 || (containment(ka, kb) >= 0.8 && Math.min(ka.length, kb.length) >= 2);
  if (!similar) return false;
  return sameVenue(a, b);
}

// ── Offers ───────────────────────────────────────────────────────────────────

/** Free first, then cheapest known price, then unknown price. */
export function sortOffers(offers: EventOffer[]): EventOffer[] {
  const rank = (o: EventOffer) =>
    o.isFree ? -1 : typeof o.priceMin === "number" ? o.priceMin : Number.POSITIVE_INFINITY;
  return offers.slice().sort((x, y) => rank(x) - rank(y));
}

function addOffer(list: EventOffer[], offer: EventOffer | null | undefined): EventOffer[] {
  if (!offer || !offer.url || !/^https?:\/\//i.test(offer.url)) return list;
  const existing = list.findIndex((o) => o.platform === offer.platform);
  if (existing < 0) return [...list, offer];
  // Same platform twice (e.g. two Ticketmaster listings): keep the cheaper one.
  const keep = sortOffers([list[existing], offer])[0];
  const next = list.slice();
  next[existing] = keep;
  return next;
}

// ── Venue type ───────────────────────────────────────────────────────────────

const VENUE_TYPE_KEYWORDS: Array<[VenueType, RegExp]> = [
  ["tour", /\b(tour|guided|walking|sightseeing|stadtfuhrung|fuhrung|excursion|day trip|cruise|boat)\b/],
  ["workshop", /\b(workshop|class|course|kurs|masterclass|lesson|tasting|cooking)\b/],
  ["museum", /\b(museum|gallery|galerie|exhibition|ausstellung|art|kunst|pinakothek)\b/],
  ["theatre", /\b(theat(er|re)|opera|oper|ballet|musical|comedy|kabarett|stand ?up|cinema|kino|film)\b/],
  ["sports", /\b(football|fussball|soccer|basketball|hockey|tennis|match|stadium|stadion|arena sports|run|marathon|yoga|climbing)\b/],
  ["nightlife", /\b(party|club|techno|dj|night|nacht|rave|disco|bar crawl|pub crawl)\b/],
  ["food", /\b(food|dinner|brunch|wine|wein|beer|bier|restaurant|market|markt|festival of food|street food)\b/],
  ["music", /\b(music|musik|concert|konzert|band|orchestra|orchester|jazz|rock|pop|symphony|live|festival|gig)\b/],
  ["outdoor", /\b(outdoor|park|garden|hike|hiking|wander|lake|see|beach|open air|biergarten)\b/],
];

/** Coarse venue/activity type from the listing's text. First keyword group that matches wins. */
export function inferVenueType(e: Pick<RawCatalogEvent, "title" | "venueName" | "category" | "kind">): VenueType {
  const hay = ` ${[e.category, e.title, e.venueName].filter(Boolean).join(" ")} `
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
  for (const [type, re] of VENUE_TYPE_KEYWORDS) if (re.test(hay)) return type;
  return e.kind === "activity" ? "tour" : "other";
}

// ── Merge ────────────────────────────────────────────────────────────────────

function toCatalogEvent(raw: RawCatalogEvent): CatalogEvent {
  const { offer, ...rest } = raw;
  const offers = addOffer([], offer);
  return {
    ...rest,
    images: raw.imageUrl ? [raw.imageUrl] : [],
    offers,
    venueType: inferVenueType(raw),
    externalUrl: offers[0]?.url ?? null,
    externalPlatform: offers[0]?.platform ?? null,
  };
}

function pickLonger(a?: string | null, b?: string | null): string | null {
  const x = (a ?? "").trim();
  const y = (b ?? "").trim();
  if (!x) return y || null;
  if (!y) return x;
  return y.length > x.length ? y : x;
}

function absorb(into: CatalogEvent, raw: RawCatalogEvent): CatalogEvent {
  const images = into.images.slice();
  if (raw.imageUrl && !images.includes(raw.imageUrl)) images.push(raw.imageUrl);
  const offers = sortOffers(addOffer(into.offers, raw.offer));
  return {
    ...into,
    description: pickLonger(into.description, raw.description),
    imageUrl: into.imageUrl ?? raw.imageUrl ?? null,
    images: images.slice(0, 8),
    endAt: into.endAt ?? raw.endAt ?? null,
    location: into.location ?? raw.location ?? null,
    venueName: into.venueName ?? raw.venueName ?? null,
    city: into.city ?? raw.city ?? null,
    latitude: into.latitude ?? raw.latitude ?? null,
    longitude: into.longitude ?? raw.longitude ?? null,
    hostName: into.hostName ?? raw.hostName ?? null,
    category: into.category ?? raw.category ?? null,
    offers,
    externalUrl: offers[0]?.url ?? null,
    externalPlatform: offers[0]?.platform ?? null,
  };
}

/**
 * Collapse listings of the same real-world event into one catalogue item.
 * Input order decides which listing's id/title is kept (put the preferred provider first).
 * Output is sorted by start time.
 */
export function mergeDuplicateEvents(raws: RawCatalogEvent[]): CatalogEvent[] {
  const out: CatalogEvent[] = [];
  const seenIds = new Set<string>();
  for (const raw of raws) {
    if (!raw || !raw.id || !raw.title || seenIds.has(raw.id)) continue;
    seenIds.add(raw.id);
    const idx = out.findIndex((e) => isSameEvent(e, raw));
    if (idx >= 0) out[idx] = absorb(out[idx], raw);
    else out.push(toCatalogEvent(raw));
  }
  return out.sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt));
}

// ── Personal ranking ─────────────────────────────────────────────────────────

export type RankProfile = {
  interests?: string[] | null;
  latitude?: number | null;
  longitude?: number | null;
  /** For "happening soon"; defaults to Date.now(). */
  nowMs?: number;
};

/** Interest tag → words that signal it in an event's text. The tag itself always counts. */
const INTEREST_SYNONYMS: Record<string, string[]> = {
  music: ["concert", "konzert", "band", "gig", "live music"],
  dancing: ["dance", "tanz", "salsa", "bachata", "party", "club"],
  art: ["gallery", "exhibition", "museum", "kunst", "ausstellung"],
  food: ["dinner", "tasting", "brunch", "street food", "market"],
  wine: ["wein", "tasting", "vineyard"],
  theatre: ["theater", "theatre", "opera", "musical", "comedy"],
  sports: ["match", "football", "fussball", "run", "yoga", "climbing"],
  hiking: ["hike", "wander", "outdoor", "mountain", "berg"],
  networking: ["meetup", "networking", "founders", "startup"],
  tech: ["tech", "ai", "startup", "developer", "hackathon"],
};

function eventHaystack(e: CatalogEvent): string {
  return ` ${[e.title, e.category, e.venueName, e.description, e.venueType].filter(Boolean).join(" ")} `
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

/** Interests from the profile that this event plausibly matches (max 2). */
export function matchedInterests(e: CatalogEvent, interests: string[]): string[] {
  const hay = eventHaystack(e);
  const hits: string[] = [];
  for (const raw of interests) {
    const tag = raw.trim();
    const key = tag.toLowerCase();
    if (!key) continue;
    const words = [key, ...(INTEREST_SYNONYMS[key] ?? [])];
    if (words.some((w) => hay.includes(w.length <= 3 ? ` ${w} ` : w))) hits.push(tag);
    if (hits.length >= 2) break;
  }
  return hits;
}

/**
 * Score and sort for one user. Reasons are data (not copy) so the app can translate them.
 * Weights: each matched interest 3, within 5 km 2 / within 15 km 1, within 48 h 1.
 */
export function rankForProfile(events: CatalogEvent[], profile: RankProfile): CatalogEvent[] {
  const now = profile.nowMs ?? Date.now();
  const interests = (profile.interests ?? []).filter((x) => typeof x === "string");
  const hasLoc = typeof profile.latitude === "number" && typeof profile.longitude === "number";
  const scored = events.map((e, i) => {
    const match: MatchReason[] = [];
    let score = 0;
    for (const v of matchedInterests(e, interests)) {
      match.push({ type: "interest", value: v });
      score += 3;
    }
    if (hasLoc && hasCoords(e)) {
      const km = haversineKm(profile.latitude!, profile.longitude!, e.latitude!, e.longitude!);
      if (km <= 15) {
        match.push({ type: "distance", km: Math.round(km * 10) / 10 });
        score += km <= 5 ? 2 : 1;
      }
    }
    const start = Date.parse(e.startAt);
    if (e.kind !== "activity" && !Number.isNaN(start) && start >= now && start - now <= 48 * 3600 * 1000) {
      match.push({ type: "soon" });
      score += 1;
    }
    return { e: { ...e, match, score }, i };
  });
  // Stable: equal scores keep chronological order.
  scored.sort((a, b) => (b.e.score ?? 0) - (a.e.score ?? 0) || a.i - b.i);
  return scored.map((s) => s.e);
}
