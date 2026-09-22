/**
 * Contextual "Plan something…" hint shown on person cards, event details and the planner.
 * Pure: copy selection + concierge route params. Screens pass in `t` and render the result.
 */

import type { Mode } from "@/types";

export type PlanHintMode = Mode | "all";

export type PlanHintPerson = {
  /** Display name or first name; only the first word is shown. */
  name?: string | null;
  /** The other person's interests / vibe chips. */
  interests?: readonly string[] | null;
};

export type PlanHintEvent = {
  title: string;
  venueName?: string | null;
};

export type PlanHintInput = {
  mode: PlanHintMode;
  person?: PlanHintPerson | null;
  /** The signed-in user's interests, used to find something in common with `person`. */
  selfInterests?: readonly string[] | null;
  event?: PlanHintEvent | null;
};

export type PlanHintCopy = {
  title: string;
  subtitle: string;
  /** Free-text request pre-filled into the concierge quick step. Only set for a person or an event. */
  request?: string;
};

export type Translate = (key: string, options?: Record<string, string>) => string;

/** First word of a display name ("Sam Taylor" → "Sam"). Empty string when unknown. */
export function firstNameOf(name: string | null | undefined): string {
  return (name ?? "").trim().split(/\s+/)[0] ?? "";
}

/** First of the person's interests the user also has (case/whitespace-insensitive), in the person's order. */
export function firstSharedInterest(
  selfInterests: readonly string[] | null | undefined,
  personInterests: readonly string[] | null | undefined
): string | null {
  if (!selfInterests?.length || !personInterests?.length) return null;
  const norm = (s: string) => s.trim().toLowerCase();
  const mine = new Set(selfInterests.map(norm).filter(Boolean));
  const hit = personInterests.find((i) => typeof i === "string" && mine.has(norm(i)));
  return hit?.trim() || null;
}

const PERSON_KIND: Record<PlanHintMode, "friends" | "romance" | "business"> = {
  friends: "friends",
  romance: "romance",
  business: "business",
  events: "friends",
  all: "friends",
};

export function selectPlanHintCopy(input: PlanHintInput, t: Translate): PlanHintCopy {
  const { mode, person, event } = input;

  const name = firstNameOf(person?.name);
  if (person && name) {
    const kind = PERSON_KIND[mode];
    const interest = firstSharedInterest(input.selfInterests, person.interests);
    return {
      title: t(`planHint.person.${kind}.title`, { name }),
      subtitle: interest
        ? t("planHint.person.sharedInterest", { interest })
        : t("planHint.person.bothEnjoy"),
      request: interest
        ? t(`planHint.person.${kind}.requestShared`, { name, interest })
        : t(`planHint.person.${kind}.request`, { name }),
    };
  }

  const eventTitle = event?.title?.trim();
  if (eventTitle) {
    const venue = event?.venueName?.trim();
    return {
      title: t("planHint.event.title"),
      subtitle: t("planHint.event.subtitle", { title: eventTitle }),
      request: venue
        ? t("planHint.event.requestAtVenue", { title: eventTitle, venue })
        : t("planHint.event.request", { title: eventTitle }),
    };
  }

  if (mode === "all") {
    return { title: t("planner.conciergePromo.title"), subtitle: t("planner.conciergePromo.body") };
  }
  return { title: t(`planHint.mode.${mode}.title`), subtitle: t(`planHint.mode.${mode}.subtitle`) };
}

const PLANNER_TAB: Record<Mode, "dates" | "meetups" | "business" | "events"> = {
  romance: "dates",
  friends: "meetups",
  business: "business",
  events: "events",
};

function localDayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Local YYYY-MM-DD of an event start, or undefined when unparseable or already in the past. */
export function planDateForEvent(startsAtIso: string | null | undefined, now: Date = new Date()): string | undefined {
  if (!startsAtIso) return undefined;
  const d = new Date(startsAtIso);
  if (Number.isNaN(d.getTime())) return undefined;
  const day = localDayKey(d);
  return day >= localDayKey(now) ? day : undefined;
}

export type PlanHintRouteInput = {
  mode: Mode;
  request: string;
  partnerUserId?: string | null;
  partnerDisplayName?: string | null;
  /** YYYY-MM-DD to plan for (defaults to today in the concierge). */
  date?: string;
};

/**
 * Concierge route that lands straight on the quick-request step with the request pre-filled and
 * generates immediately — no intent/people/mode re-selection.
 */
export function buildPlanHintRoute(input: PlanHintRouteInput): {
  pathname: "/concierge";
  params: Record<string, string>;
} {
  const params: Record<string, string> = {
    source_screen: "planner",
    mode: input.mode,
    source_planner_tab: PLANNER_TAB[input.mode],
    initial_step: "quick",
    prefill_prompt: input.request,
    auto_generate: "1",
  };
  const partnerId = input.partnerUserId?.trim();
  if (partnerId) {
    params.partner_user_id = partnerId;
    const partnerName = input.partnerDisplayName?.trim();
    if (partnerName) params.partner_display_name = partnerName;
  }
  if (input.date && /^\d{4}-\d{2}-\d{2}$/.test(input.date)) params.prefill_date = input.date;
  return { pathname: "/concierge", params };
}
