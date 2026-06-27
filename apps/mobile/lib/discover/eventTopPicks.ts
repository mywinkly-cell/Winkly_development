/**
 * Events "Top 3 for you" — collapse the long events list into ≤3 ranked, reasoned
 * picks using the CONCIERGE's own ranking + fit_reason (the `event_suggest` task),
 * not a new ranking invented here.
 *
 * The concierge returns suggestions that reference real Winkly events
 * (`winkly_event_id`) with a per-option `fit_reason`. We map those back onto the
 * events already on screen so each pick stays tappable. If the gateway is
 * unavailable, rate-limited, or gated by tier, we fall back to the soonest few
 * events with a plain "happening soon" reason so the affordance still works for
 * everyone (never a blank state).
 */

import { callConcierge } from "@/lib/ai/conciergeClient";
import { resolveFitReason } from "@/lib/ai/fitReason";
import { TOP_PICKS_LIMIT } from "./topPicks";

/** Minimal event shape the picker needs (subset of the events table row). */
export type EventPickInput = {
  id: string;
  title: string;
  city?: string | null;
  venue_name?: string | null;
  starts_at: string;
  category?: string | null;
  price_eur?: number | null;
  cover_url?: string | null;
};

export type EventTopPick = {
  /** Event id to open in event-details (always set; equals winklyEventId when known). */
  id: string;
  title: string;
  subtitle?: string | null;
  photoUrl?: string | null;
  fitReason: string;
  /** Price chip, e.g. "Free" or "€10". */
  badge?: string | null;
};

function priceBadge(price: number | null | undefined): string {
  return price != null && price > 0 ? `€${price}` : "Free";
}

function whenCityLine(ev: EventPickInput): string {
  const d = new Date(ev.starts_at);
  const when = Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  const where = [ev.venue_name, ev.city].filter(Boolean).join(" · ");
  return [when, where].filter(Boolean).join(" · ");
}

function toPick(ev: EventPickInput, fitReason: string): EventTopPick {
  return {
    id: ev.id,
    title: ev.title,
    subtitle: whenCityLine(ev),
    photoUrl: ev.cover_url ?? null,
    fitReason,
    badge: priceBadge(ev.price_eur),
  };
}

/** Soonest events with a plain reason — used when the concierge can't rank (tier/limit/offline). */
function fallbackPicks(events: EventPickInput[], city: string | undefined, limit: number): EventTopPick[] {
  const soonest = [...events]
    .filter((e) => !Number.isNaN(new Date(e.starts_at).getTime()))
    .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime())
    .slice(0, limit);
  const list = soonest.length ? soonest : events.slice(0, limit);
  return list.map((ev) => {
    const where = ev.city || city;
    const cat = ev.category ? ev.category.toLowerCase() : "events";
    const reason = where
      ? `Happening soon in ${where} — matches the ${cat} you're browsing.`
      : `Happening soon — matches the ${cat} you're browsing.`;
    return toPick(ev, reason);
  });
}

/**
 * Build ≤3 reasoned event picks. Tries the concierge first; always resolves to a
 * non-empty list when there are events (curated fallback otherwise).
 */
export async function buildEventTopPicks(params: {
  events: EventPickInput[];
  city?: string;
  category?: string;
  limit?: number;
}): Promise<EventTopPick[]> {
  const { events, city, category } = params;
  const limit = params.limit ?? TOP_PICKS_LIMIT;
  if (events.length === 0) return [];

  const byId = new Map(events.map((e) => [e.id, e]));

  try {
    const res = await callConcierge({
      task: "event_suggest",
      context: {
        mode: "events",
        city,
        activity_hint: category,
        date_from: new Date().toISOString(),
        limit_events: limit,
        user_prompt: "Pick the few events that best fit me and say why in one line each.",
      },
    });
    const suggestions = res.suggestions ?? [];
    if (!res.error && suggestions.length) {
      const picks: EventTopPick[] = [];
      const seen = new Set<string>();
      for (const opt of suggestions) {
        const eid = typeof opt.winkly_event_id === "string" ? opt.winkly_event_id : undefined;
        const matched = eid ? byId.get(eid) : undefined;
        const reason = resolveFitReason(opt);
        if (matched) {
          if (seen.has(matched.id)) continue;
          seen.add(matched.id);
          picks.push(toPick(matched, reason ?? whenCityLine(matched)));
        }
        if (picks.length >= limit) break;
      }
      if (picks.length) return picks;
    }
  } catch {
    // fall through to curated fallback
  }

  return fallbackPicks(events, city, limit);
}
