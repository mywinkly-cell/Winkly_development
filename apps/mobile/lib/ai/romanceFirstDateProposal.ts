/**
 * Romance first-date proposal — the "ready date on first open" engine.
 *
 * When B opens a brand-new romance match, they must see a CONCRETE date to
 * accept or swap (place + time + a human "why"), never a blank composer. This
 * module turns a Winkly Plan into 1–2 ready-to-send options:
 *
 *   • Primary  → posted immediately as a planner invite (Accept / Swap card).
 *   • Alternate → carried on the card so "Swap" can re-propose without a round-trip.
 *
 * It always resolves to at least one option: if the AI gateway is unavailable,
 * rate-limited, or returns nothing usable, a curated fallback is used so the card
 * is never empty.
 */

import { callWinklyPlan, type WinklyPlanOption } from "@/lib/ai/conciergeClient";
import { resolveFitReason, FIT_REASON_FALLBACK } from "@/lib/ai/fitReason";

export type RomanceFirstDateOption = {
  /** Card title, e.g. "Coffee at Blue Bottle". */
  title: string;
  /** Venue name (nullable when only an area is known). */
  place: string | null;
  /** Address / area line. */
  location: string | null;
  /** ISO start time. */
  starts_at: string;
  /** ISO end time (optional). */
  ends_at: string | null;
  /** Short activity label understood by the planner (e.g. "Coffee", "Date"). */
  activity: string;
  /** One human "why this fits you" sentence rendered as the card subtitle. */
  why: string;
};

/** Default proposed slot: ~48h out, on the hour, at a relaxed early-evening time. */
export function nextDefaultDateSlotIso(now: Date = new Date()): string {
  const dt = new Date(now.getTime() + 48 * 3600_000);
  dt.setHours(18, 0, 0, 0);
  return dt.toISOString();
}

/** Derive a concise activity label from a plan title (best-effort). */
function activityFromTitle(title: string | undefined): string {
  const t = (title ?? "").toLowerCase();
  if (t.includes("coffee") || t.includes("café") || t.includes("cafe")) return "Coffee";
  if (t.includes("walk") || t.includes("stroll")) return "Walk";
  if (t.includes("dinner") || t.includes("restaurant") || t.includes("food")) return "Dinner";
  if (t.includes("drink") || t.includes("wine") || t.includes("bar") || t.includes("cocktail")) return "Drinks";
  if (t.includes("museum") || t.includes("gallery") || t.includes("art")) return "Museum";
  return "Date";
}

/** Curated, always-available fallback so the first-date card is never blank. */
export function curatedFirstDateOption(city?: string | null, now: Date = new Date()): RomanceFirstDateOption {
  const place = city && city.trim() ? `a cosy café in ${city.trim()}` : "a cosy café nearby";
  return {
    title: city && city.trim() ? `Coffee in ${city.trim()}` : "Coffee to start",
    place: null,
    location: city && city.trim() ? city.trim() : null,
    starts_at: nextDefaultDateSlotIso(now),
    ends_at: null,
    activity: "Coffee",
    why: `A relaxed first meet at ${place} — easy to talk, low pressure, and simple to extend if the conversation flows.`,
  };
}

/** Map a Winkly Plan option to a first-date option shape. */
function fromPlanOption(opt: WinklyPlanOption, startsAtIso: string): RomanceFirstDateOption {
  const venueName = opt.venue?.name?.trim() || null;
  const venueAddr = opt.venue?.address?.trim() || null;
  const activity = activityFromTitle(opt.title);
  const title = venueName ? `${activity} at ${venueName}` : opt.title?.trim() || `${activity} to start`;
  return {
    title,
    place: venueName,
    location: venueAddr,
    starts_at: startsAtIso,
    ends_at: null,
    activity,
    why: resolveFitReason(opt) ?? FIT_REASON_FALLBACK,
  };
}

/**
 * Build 1–2 concrete first-date options for a fresh romance match.
 * Tries the AI gateway first; on any failure returns a curated single option.
 */
export async function buildRomanceFirstDateOptions(params: {
  meId: string;
  partnerUserId: string;
  city?: string | null;
}): Promise<RomanceFirstDateOption[]> {
  const { partnerUserId, city } = params;
  const startsAtIso = nextDefaultDateSlotIso();

  try {
    const res = await callWinklyPlan({
      context: {
        mode: "romance",
        city: city ?? undefined,
        date_from: startsAtIso,
        partner_user_id: partnerUserId,
        activity_hint: "relaxed first date",
        user_prompt: "Propose one easy, low-pressure first date for a brand-new match.",
        presentation: "decisive",
      },
    });
    const options = Array.isArray(res?.options) ? res.options : [];
    const mapped = options
      .filter((o): o is WinklyPlanOption => !!o && typeof o === "object")
      .map((o) => fromPlanOption(o, startsAtIso))
      .filter((o) => o.title.trim().length > 0);
    if (mapped.length > 0) return mapped.slice(0, 2);
  } catch {
    // fall through to curated fallback
  }

  return [curatedFirstDateOption(city)];
}
