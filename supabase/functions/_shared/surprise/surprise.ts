// ─────────────────────────────────────────────────────────────────────────────
// "Surprise me" — pure decision logic for winkly_plan with surprise: true.
//
// Import-free on purpose: the ai-gateway Edge Function (Deno) imports it, and the
// mobile Jest suite imports the same file to test it (see __tests__/surprisePlan.test.ts).
//
// The server, not the model, owns WHEN each option happens: pickSurpriseSlots picks three
// future slots from the requester's local clock, and normalizeSurpriseOptions pins every
// option to its slot and pushes any itinerary the model started too early. That is what
// guarantees "future-dated" regardless of what the LLM returns.
// ─────────────────────────────────────────────────────────────────────────────

export type SurpriseVibe = "cosy" | "active" | "social";

/** Stable order of the three options (A = cosy, B = active, C = social). */
export const SURPRISE_VIBES: readonly SurpriseVibe[] = ["cosy", "active", "social"] as const;

export type LocalNow = {
  /** YYYY-MM-DD in the requester's local calendar. */
  date: string;
  hour: number;
  minute: number;
  /** 0 = Sunday … 6 = Saturday. */
  weekday: number;
};

export type SurpriseSlot = {
  vibe: SurpriseVibe;
  /** YYYY-MM-DD, local. */
  date: string;
  /** Default start "HH:mm", local. */
  start: string;
  /** Earliest acceptable start "HH:mm" for this slot (same day). */
  earliest: string;
  /** Latest acceptable start "HH:mm" for this slot (same day). */
  latest: string;
  /** Short English label for the model brief, e.g. "Friday evening". */
  label: string;
};

/** Minimum lead time between "now" and any suggested start. */
export const SURPRISE_MIN_LEAD_MINUTES = 90;

const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function parseYmd(date: string): { y: number; m: number; d: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) return null;
  return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
}

/** Add whole days to a YYYY-MM-DD date (calendar arithmetic, no time zone involved). */
export function addDays(date: string, days: number): string {
  const p = parseYmd(date);
  if (!p) return date;
  const t = new Date(Date.UTC(p.y, p.m - 1, p.d + days));
  return `${t.getUTCFullYear()}-${pad2(t.getUTCMonth() + 1)}-${pad2(t.getUTCDate())}`;
}

export function weekdayOf(date: string): number {
  const p = parseYmd(date);
  if (!p) return 0;
  return new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay();
}

/** "HH:mm" → minutes since midnight, or null when malformed. */
export function hmToMinutes(hm: string | null | undefined): number | null {
  const m = typeof hm === "string" ? /^(\d{1,2}):(\d{2})$/.exec(hm.trim()) : null;
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

export function minutesToHm(total: number): string {
  const clamped = Math.max(0, Math.min(23 * 60 + 59, Math.round(total)));
  return `${pad2(Math.floor(clamped / 60))}:${pad2(clamped % 60)}`;
}

/**
 * Requester's local "now". Prefers the client's wall clock ("YYYY-MM-DDTHH:mm"), then the
 * IANA timezone, then UTC — so a missing or bogus field never breaks the request.
 */
export function resolveLocalNow(params: {
  currentDateTimeLocal?: unknown;
  timezone?: unknown;
  nowMs: number;
}): LocalNow {
  const raw = typeof params.currentDateTimeLocal === "string" ? params.currentDateTimeLocal.trim() : "";
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/.exec(raw);
  if (m && parseYmd(m[1]) && Number(m[2]) <= 23 && Number(m[3]) <= 59) {
    // Trust the client clock only when it is within a day of the server clock.
    const p = parseYmd(m[1])!;
    const approxMs = Date.UTC(p.y, p.m - 1, p.d, Number(m[2]), Number(m[3]));
    if (Math.abs(approxMs - params.nowMs) <= 26 * 3600_000) {
      return { date: m[1], hour: Number(m[2]), minute: Number(m[3]), weekday: weekdayOf(m[1]) };
    }
  }
  const tz = typeof params.timezone === "string" && params.timezone.trim() ? params.timezone.trim() : "UTC";
  let parts: Record<string, string> = {};
  try {
    parts = Object.fromEntries(
      new Intl.DateTimeFormat("en-CA", {
        timeZone: tz,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      })
        .formatToParts(new Date(params.nowMs))
        .map((p) => [p.type, p.value]),
    );
  } catch {
    parts = {};
  }
  if (parts.year && parts.month && parts.day && parts.hour && parts.minute) {
    const date = `${parts.year}-${parts.month}-${parts.day}`;
    return { date, hour: Number(parts.hour) % 24, minute: Number(parts.minute), weekday: weekdayOf(date) };
  }
  const d = new Date(params.nowMs);
  const date = `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
  return { date, hour: d.getUTCHours(), minute: d.getUTCMinutes(), weekday: d.getUTCDay() };
}

type SlotTemplate = { start: string; earliest: string; latest: string; part: string };

const TEMPLATES: Record<SurpriseVibe, SlotTemplate> = {
  // A slow evening: café, wine bar, cinema, cooking class.
  cosy: { start: "19:00", earliest: "17:30", latest: "20:30", part: "evening" },
  // Daylight and movement: hike, bouldering, bike tour, kayak.
  active: { start: "10:30", earliest: "09:00", latest: "15:00", part: "daytime" },
  // Out with people: market, live music, quiz night, food hall.
  social: { start: "19:30", earliest: "18:00", latest: "21:00", part: "evening" },
};

/** Weekdays the vibe prefers, most preferred first (0 = Sunday). Empty = the nearest free day. */
const PREFERRED_DAYS: Record<SurpriseVibe, number[]> = {
  cosy: [],
  active: [6, 0],
  social: [5, 6, 4],
};

function slotStartIsFuture(now: LocalNow, date: string, earliestMin: number): boolean {
  if (date > now.date) return true;
  if (date < now.date) return false;
  return earliestMin >= now.hour * 60 + now.minute + SURPRISE_MIN_LEAD_MINUTES;
}

/**
 * Three future slots — one per vibe — spread across the next week so the options differ in
 * WHEN as well as WHAT. Every slot's default start is at least SURPRISE_MIN_LEAD_MINUTES away.
 */
export function pickSurpriseSlots(now: LocalNow): SurpriseSlot[] {
  const nowMin = now.hour * 60 + now.minute;
  const usedDates = new Set<string>();
  const slots: SurpriseSlot[] = [];

  for (const vibe of SURPRISE_VIBES) {
    const tpl = TEMPLATES[vibe];
    const preferred = PREFERRED_DAYS[vibe];
    const earliestMin = hmToMinutes(tpl.earliest)!;
    const latestMin = hmToMinutes(tpl.latest)!;
    const defaultMin = hmToMinutes(tpl.start)!;

    const tryDate = (date: string): { date: string; startMin: number; earliestMin: number } | null => {
      // Today: shift the window's start forward past the lead time when it still fits.
      const floor = date === now.date ? nowMin + SURPRISE_MIN_LEAD_MINUTES : 0;
      const slotEarliest = Math.max(earliestMin, Math.ceil(floor / 15) * 15);
      if (slotEarliest > latestMin || !slotStartIsFuture(now, date, slotEarliest)) return null;
      return { date, startMin: Math.max(defaultMin, slotEarliest), earliestMin: slotEarliest };
    };
    const offsets = Array.from({ length: 8 }, (_, i) => i);

    let chosen: { date: string; startMin: number; earliestMin: number } | null = null;
    // Pass 1: the most-preferred weekday (nearest occurrence) on a date no other option uses.
    for (const wd of preferred) {
      for (const offset of offsets) {
        const date = addDays(now.date, offset);
        if (weekdayOf(date) !== wd || usedDates.has(date)) continue;
        chosen = tryDate(date);
        if (chosen) break;
      }
      if (chosen) break;
    }
    // Pass 2: the nearest unused date. Pass 3: the nearest date at all (unreachable with these templates).
    for (const allowUsed of [false, true]) {
      for (const offset of offsets) {
        if (chosen) break;
        const date = addDays(now.date, offset);
        if (!allowUsed && usedDates.has(date)) continue;
        chosen = tryDate(date);
      }
    }
    // Unreachable with the templates above; kept so the function is total.
    if (!chosen) chosen = { date: addDays(now.date, 1), startMin: defaultMin, earliestMin };

    usedDates.add(chosen.date);
    const dayLabel =
      chosen.date === now.date ? "Today" : chosen.date === addDays(now.date, 1) ? "Tomorrow" : WEEKDAY_NAMES[weekdayOf(chosen.date)];
    slots.push({
      vibe,
      date: chosen.date,
      start: minutesToHm(chosen.startMin),
      earliest: minutesToHm(chosen.earliestMin),
      latest: tpl.latest,
      label: `${dayLabel} ${tpl.part}`,
    });
  }
  return slots;
}

// ── Signals → brief ──────────────────────────────────────────────────────────

export type SurpriseReviewSignal = {
  rating: number;
  activity_type?: string | null;
  venue?: string | null;
  time_of_day?: string | null;
  would_repeat?: boolean | null;
};

export type SurpriseSignals = {
  interests: string[];
  hobbies: string[];
  lifestyle?: string | null;
  /** Wishlist titles the user saved but hasn't done yet. */
  wishlist: string[];
  reviews: SurpriseReviewSignal[];
};

function cleanList(xs: unknown, max: number, maxLen = 60): string[] {
  if (!Array.isArray(xs)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const x of xs) {
    if (typeof x !== "string") continue;
    const s = x.trim().replace(/\s+/g, " ").slice(0, maxLen);
    const k = s.toLowerCase();
    if (!s || seen.has(k)) continue;
    seen.add(k);
    out.push(s);
    if (out.length >= max) break;
  }
  return out;
}

/**
 * Compact, structured summary of what the user has told us (no free text from reviews — only
 * the structured fields — so nothing personal beyond taste signals reaches the model).
 */
export function summarizeSurpriseSignals(s: SurpriseSignals): Record<string, unknown> {
  const reviews = (Array.isArray(s.reviews) ? s.reviews : [])
    .filter((r) => r && typeof r.rating === "number")
    .slice(0, 8);
  const loved = reviews
    .filter((r) => r.rating >= 4 || r.would_repeat === true)
    .map((r) => [r.activity_type, r.venue].filter(Boolean).join(" @ "))
    .filter(Boolean);
  const disliked = reviews
    .filter((r) => r.rating <= 2 || r.would_repeat === false)
    .map((r) => [r.activity_type, r.venue].filter(Boolean).join(" @ "))
    .filter(Boolean);
  const out: Record<string, unknown> = {};
  const interests = cleanList(s.interests, 12);
  const hobbies = cleanList(s.hobbies, 8);
  const wishlist = cleanList(s.wishlist, 8, 80);
  if (interests.length) out.interests = interests;
  if (hobbies.length) out.hobbies = hobbies;
  if (typeof s.lifestyle === "string" && s.lifestyle.trim()) out.lifestyle = s.lifestyle.trim().slice(0, 80);
  if (wishlist.length) out.wishlist_not_done_yet = wishlist;
  if (loved.length) out.recently_loved = cleanList(loved, 5, 100);
  if (disliked.length) out.recently_disliked = cleanList(disliked, 5, 100);
  return out;
}

/** True when we know nothing about the user yet (brand-new account). */
export function isColdStart(summary: Record<string, unknown>): boolean {
  return Object.keys(summary).length === 0;
}

// ── Weather ──────────────────────────────────────────────────────────────────

/** Open-Meteo `daily` block (as returned by ai-gateway getWeather). */
export type OpenMeteoDaily = {
  time?: string[];
  weathercode?: number[];
  temperature_2m_max?: number[];
  temperature_2m_min?: number[];
  precipitation_sum?: number[];
};

/** Short English weather line for one date, or null when the forecast doesn't cover it. */
export function weatherLineForDate(daily: OpenMeteoDaily | null | undefined, date: string): string | null {
  const idx = Array.isArray(daily?.time) ? daily!.time!.indexOf(date) : -1;
  if (idx < 0) return null;
  const code = daily!.weathercode?.[idx];
  const tmax = daily!.temperature_2m_max?.[idx];
  const tmin = daily!.temperature_2m_min?.[idx];
  const rain = daily!.precipitation_sum?.[idx];
  const sky =
    typeof code !== "number"
      ? ""
      : code >= 95
        ? "thunderstorms"
        : code >= 71 && code <= 86
          ? "snow"
          : code >= 51
            ? "rain"
            : code >= 45
              ? "fog"
              : code >= 2
                ? "cloudy"
                : "clear";
  const temps =
    typeof tmin === "number" && typeof tmax === "number" ? `${Math.round(tmin)}–${Math.round(tmax)}°C` : "";
  const wet = typeof rain === "number" && rain >= 2 ? `${Math.round(rain)} mm precipitation` : "";
  const line = [sky, temps, wet].filter(Boolean).join(", ");
  return line || null;
}

/** Whether a forecast line suggests keeping the plan indoors. */
export function isWetWeather(line: string | null | undefined): boolean {
  return !!line && /\b(rain|snow|thunderstorms)\b/.test(line);
}

// ── Output normalization ─────────────────────────────────────────────────────

export type SurpriseItineraryStep = { time: string; description: string };

/**
 * Shift the whole itinerary so it starts at `targetStart`, preserving the gaps between steps.
 * Steps without a parseable time are kept as-is.
 */
export function shiftItinerary(steps: SurpriseItineraryStep[], targetStart: string): SurpriseItineraryStep[] {
  const target = hmToMinutes(targetStart);
  const first = steps.map((s) => hmToMinutes(s.time)).find((m): m is number => m != null);
  if (target == null || first == null) return steps;
  const delta = target - first;
  if (delta === 0) return steps;
  return steps.map((s) => {
    const m = hmToMinutes(s.time);
    return m == null ? s : { ...s, time: minutesToHm(m + delta) };
  });
}

/** Minimal option shape the normalizer needs; the gateway passes its full option type through. */
export type SurpriseOptionLike = {
  title: string;
  itinerary: SurpriseItineraryStep[];
  venue: { name: string };
};

export type SurpriseNormalized<T extends SurpriseOptionLike> = T & {
  option_id: "A" | "B" | "C";
  vibe: SurpriseVibe;
  date: string;
  start_time: string;
};

function normVenue(name: string): string {
  return name.trim().toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function coerceVibe(v: unknown): SurpriseVibe | null {
  const s = typeof v === "string" ? v.trim().toLowerCase() : "";
  if (s === "cosy" || s === "cozy") return "cosy";
  if (s === "active") return "active";
  if (s === "social") return "social";
  return null;
}

/**
 * Turn model output into exactly one option per vibe, each pinned to its slot:
 *  - options are matched to vibes by their `vibe` field, then by position;
 *  - a venue may appear only once (the options must be clearly different);
 *  - the start time is the model's first itinerary time when it falls inside the slot window,
 *    otherwise the slot default — and the itinerary is shifted to match.
 * Vibes the model didn't fill come back in `missing` so the caller can fill them.
 */
export function normalizeSurpriseOptions<T extends SurpriseOptionLike>(
  raw: Array<{ vibe?: unknown; option: T }>,
  slots: SurpriseSlot[],
): { options: SurpriseNormalized<T>[]; missing: SurpriseVibe[] } {
  const byVibe = new Map<SurpriseVibe, T>();
  const usedVenues = new Set<string>();
  const leftovers: T[] = [];

  const accept = (vibe: SurpriseVibe, opt: T): boolean => {
    const key = normVenue(opt.venue?.name ?? "");
    if (!key || usedVenues.has(key) || byVibe.has(vibe)) return false;
    usedVenues.add(key);
    byVibe.set(vibe, opt);
    return true;
  };

  for (const r of raw) {
    const vibe = coerceVibe(r.vibe);
    if (!vibe || !accept(vibe, r.option)) leftovers.push(r.option);
  }
  for (const opt of leftovers) {
    const free = SURPRISE_VIBES.find((v) => !byVibe.has(v));
    if (!free) break;
    accept(free, opt);
  }

  const ids = ["A", "B", "C"] as const;
  const options: SurpriseNormalized<T>[] = [];
  const missing: SurpriseVibe[] = [];
  SURPRISE_VIBES.forEach((vibe, i) => {
    const opt = byVibe.get(vibe);
    const slot = slots.find((s) => s.vibe === vibe);
    if (!opt || !slot) {
      missing.push(vibe);
      return;
    }
    const first = opt.itinerary.map((s) => hmToMinutes(s.time)).find((m): m is number => m != null);
    const lo = hmToMinutes(slot.earliest)!;
    const hi = hmToMinutes(slot.latest)!;
    const start = first != null && first >= lo && first <= hi ? minutesToHm(first) : slot.start;
    const itinerary = opt.itinerary.length ? shiftItinerary(opt.itinerary, start) : [{ time: start, description: opt.title }];
    options.push({ ...opt, itinerary, option_id: ids[i], vibe, date: slot.date, start_time: start });
  });
  return { options, missing };
}

/** English search phrase per vibe, used for last-resort Maps-search cards. */
export function fallbackSearchPhrase(vibe: SurpriseVibe, interests: string[], wet: boolean): string {
  const first = interests.find((x) => typeof x === "string" && x.trim())?.trim();
  if (vibe === "cosy") return wet ? "cosy café" : first ? `cosy ${first} spot` : "wine bar";
  if (vibe === "active") return wet ? "bouldering gym" : "scenic walk";
  return wet ? "food hall" : "live music bar";
}
