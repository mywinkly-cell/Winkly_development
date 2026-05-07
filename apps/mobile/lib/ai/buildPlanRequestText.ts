/**
 * Builds a single natural-language block = what the user would type into Gemini
 * from the concierge form (topic, origin/destination, dates, time, budget, weather, sanitized persona).
 * Sent as plan_request_text; the LLM is only invoked when the user taps Generate.
 */

import type { ConciergeContext } from "@/lib/ai/conciergeClient";
import type { CategoryExtras } from "@/lib/ai/conciergePlanningFlow";

/**
 * Serializes CategoryExtras into natural-language lines for the AI prompt.
 * Appended to buildPlanRequestText output as additional context.
 */
export function serializeCategoryExtras(extras: CategoryExtras): string {
  const lines: string[] = [];

  // Food & drink
  if (extras.cuisine) lines.push(`Cuisine preference: ${extras.cuisine}.`);
  if (extras.atmosphere) lines.push(`Atmosphere: ${extras.atmosphere}.`);
  if (extras.indoorOutdoor && extras.indoorOutdoor !== "any") lines.push(`Setting: ${extras.indoorOutdoor}.`);
  if (extras.groupSize) lines.push(`Group size: ${extras.groupSize}.`);
  if (extras.occasion) lines.push(`Occasion: ${extras.occasion}.`);
  if (extras.dietaryNotes) lines.push(`Dietary requirements: ${extras.dietaryNotes}.`);
  if (extras.privateRoom) lines.push("Private room or secluded table preferred.");

  // Art & culture
  if (extras.artSubType) lines.push(`Cultural type: ${extras.artSubType}.`);
  if (extras.collectionType) lines.push(`Exhibition preference: ${extras.collectionType}.`);
  if (extras.afterCulturePlan && extras.afterCulturePlan !== "nothing")
    lines.push(`After the cultural visit: ${extras.afterCulturePlan}.`);

  // Sport & activity
  if (extras.sportSubType) lines.push(`Sport / activity: ${extras.sportSubType}.`);
  if (extras.activityLevel) lines.push(`Activity level: ${extras.activityLevel}.`);
  if (extras.terrain && extras.terrain !== "any") lines.push(`Terrain preference: ${extras.terrain}.`);
  if (extras.postActivityPlan && extras.postActivityPlan !== "nothing")
    lines.push(`After the activity: ${extras.postActivityPlan}.`);

  // Dance & music
  if (extras.musicSubType) lines.push(`Music / dance type: ${extras.musicSubType}.`);

  // Experience & wellness
  if (extras.experienceSubType) lines.push(`Experience type: ${extras.experienceSubType}.`);
  if (extras.wellnessSubType) lines.push(`Wellness type: ${extras.wellnessSubType}.`);

  // Business
  if (extras.meetingGoal) lines.push(`Meeting goal: ${extras.meetingGoal}.`);
  if (extras.meetingCounterpart) lines.push(`Meeting with: ${extras.meetingCounterpart}.`);
  if (extras.workFriendly) lines.push("Venue must have wifi and be quiet.");
  if (extras.golfSkill) lines.push(`Golf skill level: ${extras.golfSkill}.`);
  if (extras.golfHoles) lines.push(`Golf: ${extras.golfHoles} holes.`);
  if (extras.industryFocus) lines.push(`Industry focus: ${extras.industryFocus}.`);
  if (extras.networkingGoal) lines.push(`Networking goal: ${extras.networkingGoal}.`);
  if (extras.eventFormat) lines.push(`Event format preference: ${extras.eventFormat}.`);
  if (extras.specificEventInMind) lines.push("User has a specific event in mind — search external events first.");
  if (extras.workshopType) lines.push(`Workshop type: ${extras.workshopType}.`);
  if (extras.workshopGroupSize) lines.push(`Workshop group size: ${extras.workshopGroupSize}.`);

  // Trip
  if (extras.tripScope) lines.push(`Trip scope: ${extras.tripScope}.`);
  if (extras.tripVibe) lines.push(`Trip vibe: ${extras.tripVibe}.`);
  if (extras.tripActivityLevel) lines.push(`Trip activity level: ${extras.tripActivityLevel}.`);
  if (extras.tripMustHaves?.length) lines.push(`Trip must-haves: ${extras.tripMustHaves.join(", ")}.`);
  if (extras.tripDestinationDecided === false) lines.push("Destination not yet decided — AI should suggest.");
  if (extras.tripTravelRadius) lines.push(`Willing to travel: ${extras.tripTravelRadius}.`);
  if (extras.numDays && extras.numDays > 1)
    lines.push(
      `Multi-day plan: ${extras.numDays} days. Structure the plan day-by-day with morning, afternoon, and evening slots.`,
    );

  return lines.join("\n");
}

function formatDateLine(dateFrom?: string, dateTo?: string, singleDay?: boolean): string {
  if (!dateFrom) return "Date: not specified.";
  if (singleDay !== false && (!dateTo || dateFrom === dateTo)) {
    return `Date: ${dateFrom}.`;
  }
  return `Dates: ${dateFrom} to ${dateTo ?? dateFrom}.`;
}

/** Inclusive day count for YYYY-MM-DD bounds (trip length). */
export function inclusivePlanDayCount(dateFrom?: string, dateTo?: string): number {
  if (!dateFrom?.trim() || !dateTo?.trim()) return 1;
  const a = new Date(`${dateFrom.trim().slice(0, 10)}T12:00:00`);
  const b = new Date(`${dateTo.trim().slice(0, 10)}T12:00:00`);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return 1;
  const diff = Math.round((b.getTime() - a.getTime()) / 86400000);
  return Math.max(1, diff + 1);
}

function timePreferenceLine(
  timePreference?: string,
  availableSlots?: string[]
): string {
  if (availableSlots && availableSlots.length > 0) {
    return `When I'm free: ${availableSlots.slice(0, 6).join("; ")}${availableSlots.length > 6 ? " …" : ""}.`;
  }
  if (!timePreference || timePreference === "any") {
    return "Time of day: any.";
  }
  const map: Record<string, string> = {
    morning: "Morning",
    lunch: "Lunchtime",
    afternoon: "Afternoon",
    evening: "Evening",
    weekends: "Weekends",
    weekdays: "Weekdays",
    when_free: "When I'm free (see slots if any)",
  };
  return `Time of day: ${map[timePreference] ?? timePreference}.`;
}

function weatherBlock(w?: ConciergeContext["weather_snapshot"]): string {
  if (!w) return "Weather: not loaded for this request—use location and dates only.";
  const parts: string[] = [];
  if (w.period_summary) parts.push(w.period_summary);
  else if (w.summary) parts.push(w.summary);
  if (w.avg_temp_min != null && w.avg_temp_max != null) {
    parts.push(`Typical temps ~${w.avg_temp_min}–${w.avg_temp_max}°C.`);
  } else if (w.temp_min != null && w.temp_max != null) {
    parts.push(`Temps ${w.temp_min}–${w.temp_max}°C.`);
  }
  if (w.rainy_days != null && w.total_days != null && w.total_days > 1) {
    parts.push(`Rain on ${w.rainy_days} of ${w.total_days} day(s).`);
  } else if (w.precipitation != null) {
    parts.push(`Precipitation indicator: ${w.precipitation}.`);
  }
  if (w.date) parts.push(`(Forecast anchor: ${w.date}.)`);
  return `Weather (from the app for my destination area and dates—use this; do not substitute another city/day): ${parts.join(" ")}`.trim();
}

function budgetLine(
  amount?: number,
  currency?: string,
  tier?: "low" | "mid" | "high"
): string {
  const bits: string[] = [];
  if (amount != null && !Number.isNaN(amount)) {
    bits.push(`${amount} ${currency ?? ""}`.trim());
  }
  if (tier) bits.push(`(${tier} budget tier)`);
  if (bits.length === 0) return "Budget: not specified.";
  return `Budget: ${bits.join(" ")}.`;
}

/** How the user opened planning: Planner hub vs a mode area vs Chats. */
export type PlanningEntrySurface = "planner" | "chats" | "mode_context";

export type BuildPlanRequestTextInput = {
  /** Sub-profile / tab context: romance | friends | business | events */
  mode: string;
  /**
   * Where they opened AI from: use **Planner** when `source_screen === planner` from the Planner hub;
   * otherwise the active mode label is enough (mode_context / chats).
   */
  planningEntrySurface: PlanningEntrySurface;
  /** Activity / topic: e.g. "Romantic dinner", or user's freeform prompt */
  activityOrTopic: string;
  /** Destination area for the plan (city / area), same as before */
  city?: string;
  country?: string;
  /** Device / "where I am now" when distinct from destination (optional). */
  originLocationLabel?: string;
  /**
   * Optional: travel summary from origin → destination (e.g. from Maps). If omitted, the model may estimate.
   */
  travelFromOriginSummary?: string;
  /** When single-day: optional precise local time HH:mm (24h). */
  exactTimeHm?: string;
  dateFrom?: string;
  dateTo?: string;
  singleDay?: boolean;
  timePreference?: string;
  availableSlots?: string[];
  budgetAmount?: number;
  budgetCurrency?: string;
  budgetTier?: "low" | "mid" | "high";
  weatherSnapshot?: ConciergeContext["weather_snapshot"];
  /** Display name only — planning companion; not included in sanitized persona block. */
  partnerDisplayName?: string;
  /**
   * Sanitized requester persona (age, area, interests, lifestyle — no name, email, phone).
   * Built client-side via `formatSanitizedPersonaForConciergePrompt` or left empty when unavailable.
   */
  sanitizedRequesterPersona?: string;
  /** Optional known venue hint from Places / user (name + hours text). */
  venueName?: string;
  venueOpenHoursHint?: string;
  categoryExtras?: CategoryExtras;
  extraNotes?: string;
};

function modeLine(i: BuildPlanRequestTextInput): string {
  const m = i.mode.trim() || "events";
  if (i.planningEntrySurface === "planner") {
    return `Mode: Planner (planning context: ${m}).`;
  }
  return `Mode: ${m}.`;
}

function destinationPlaceLine(city?: string, country?: string): string {
  const place =
    city && country
      ? `${city}, ${country}`
      : city
        ? city
        : country
          ? country
          : "Location not specified.";
  return `Destination / plan area: ${place}.`;
}

/**
 * One block the user could paste into Gemini themselves; must stay in sync with form fields.
 */
export function buildPlanRequestText(i: BuildPlanRequestTextInput): string {
  const origin =
    i.originLocationLabel?.trim() ||
    (i.travelFromOriginSummary?.trim() ? "Same as destination or not captured separately." : undefined);
  const originLine = origin
    ? `Current location (origin): ${origin}.`
    : "Current location (origin): not set separately — assume destination area unless user implied travel.";

  const dest = destinationPlaceLine(i.city, i.country);
  const travel =
    i.travelFromOriginSummary?.trim()
      ? `Travel from origin to destination (app / estimate): ${i.travelFromOriginSummary.trim()}.`
      : "Travel time & distance: not calculated in-app — if origin ≠ destination, estimate in the plan and mention both; when the plan is shared, other participants should get timing from their own origin in the app (future: per-recipient routing).";

  const who = i.partnerDisplayName?.trim()
    ? `Planning with: ${i.partnerDisplayName.trim()}.`
    : "Who joins: not specified in the form (solo or decide later).";

  const persona =
    i.sanitizedRequesterPersona?.trim() ||
    "Requester persona (sanitized): use PRIMARY_USER from server context — do not use name, email, or phone.";

  const venue =
    i.venueName?.trim() || i.venueOpenHoursHint?.trim()
      ? `Venue hint: ${[i.venueName?.trim(), i.venueOpenHoursHint?.trim()].filter(Boolean).join(" — ")}.`
      : null;

  // IMPORTANT: Start with the activity/topic so downstream title seeding doesn't become "Mode: Planner…".
  const lines: string[] = [
    `Topic / activity: ${i.activityOrTopic.trim() || "Not specified"}.`,
    originLine,
    dest,
    travel,
  ];
  if (venue) lines.push(venue);

  lines.push(
    formatDateLine(i.dateFrom, i.dateTo, i.singleDay),
    timePreferenceLine(i.timePreference, i.availableSlots),
  );

  const numDays =
    i.singleDay === false && i.dateFrom && i.dateTo ? inclusivePlanDayCount(i.dateFrom, i.dateTo) : 1;
  if (numDays > 1) {
    lines.push(
      "Structure the plan as a day-by-day itinerary. Each day should have a morning, afternoon, and evening slot with specific venue suggestions.",
    );
  }

  if (i.singleDay !== false && i.exactTimeHm?.trim()) {
    lines.push(`Exact start time (local, single day): ${i.exactTimeHm.trim()}.`);
  }

  lines.push(
    budgetLine(i.budgetAmount, i.budgetCurrency, i.budgetTier),
    weatherBlock(i.weatherSnapshot),
    `Requester persona (sanitized — no name, email, phone): ${persona}`,
    who,
  );

  if (i.extraNotes?.trim()) {
    lines.push(`Additional notes: ${i.extraNotes.trim()}.`);
  }

  if (i.categoryExtras) {
    const s = serializeCategoryExtras(i.categoryExtras).trim();
    if (s) lines.push(s);
  }

  // Mode context goes last — it's metadata, not the topic.
  lines.push(modeLine(i));

  lines.push(
    "Constraints — verify together before finalizing options: (1) Date and time fit the user’s request. (2) Weather suits the activity (e.g. move outdoor plans indoor if rain/wind). (3) Venue opening hours must contain the requested arrival time — avoid proposing arrival near closing (e.g. <45 min before stated closing) unless the user asked for a short visit. (4) If anything conflicts, say so and suggest a concrete adjustment (different time, day, or venue).",
    'Output: suggest exactly three concrete plan options as JSON in the required schema. For EACH option include fields aligned with: Topic/activity; Place (city/country OR full address); Name of place; Google Maps link when a real place is named; opening hours when known; date/time; how requested time compares to hours; budget; weather fit; sanitized planning notes; links to official booking or tickets when known (never fabricate URLs). If a constraint cannot be satisfied, explain and offer alternatives.',
  );

  return lines.join("\n");
}
