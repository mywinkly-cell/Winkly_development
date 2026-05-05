/**
 * Winkly AI Concierge Planning Flow — shared types and constants for the 7-step flow.
 * Step 1 Intent → 2 Activity Details → 3 Social → 4 Summary → 5 AI Suggestions → 6 Invite/Share → 7 Add to Planner
 */

import type { Mode } from "@/types";

export type ConciergeFlowStep =
  | "intent"
  | "activity"
  | "social"
  | "summary"
  | "suggestions"
  | "invite"
  | "add_to_planner";

/** Who is joining (Step 3). */
export type WhoJoining =
  | "just_me"
  | "invite_match"
  | "invite_friends"
  | "invite_business"
  | "invite_contacts"
  | "decide_later"
  | "share";

/** Date preset for quick selection. */
export type DatePreset = "today" | "tomorrow" | "weekend" | "custom";

/** Time of day. */
export type TimeOfDay = "any" | "morning" | "lunch" | "afternoon" | "evening";

/** Activity details collected in Step 2. */
export interface ActivityDetails {
  location: string;
  city?: string;
  country?: string;
  /** Optional notes from Step 1 (intent cards). */
  intentNotes?: string;
  /** Extra details (shown after card pick, Step 2). */
  additionalInfo?: string;
  /** Requirements / constraints (shown after card pick, Step 2). */
  mustHaves?: string;
  datePreset: DatePreset;
  date: Date;
  dateEnd?: Date;
  singleDay: boolean;
  timeOfDay: TimeOfDay;
  budgetAmount: string;
  budgetCurrency: string;
  /** Activity-specific: e.g. cuisine, atmosphere, indoor/outdoor for restaurants. */
  cuisine?: string;
  atmosphere?: string;
  indoorOutdoor?: "indoor" | "outdoor" | "any";
  /** Custom plan only: merged into the main planning prompt for the AI. */
  customPromptExtra?: string;
  /** Device / "where I am now" when distinct from destination (e.g. first GPS capture). */
  originLocationLabel?: string;
  /** Single-day optional precise start time HH:mm (local). */
  exactTimeHm?: string;
}

/** Full planning flow state (for persistence or deep link). */
export interface PlanningFlowState {
  step: ConciergeFlowStep;
  /** Selected activity key from Step 1 (e.g. "dinner", "coffee", "custom"). */
  activityKey: string | null;
  /** Human-readable activity label. */
  activityLabel: string | null;
  details: Partial<ActivityDetails>;
  whoJoining: WhoJoining | null;
  /** Selected partner for invite (match/connection). */
  partnerId: string | null;
  partnerDisplayName: string | null;
}

/** Activity button definition for Step 1 (icon + label + key). */
export interface ActivityButtonDef {
  key: string;
  label: string;
  icon: string; // Ionicons name
}

/**
 * General planning activities (shown in all modes).
 * Excludes event-type options (Concert, Workshop, Culture, Exhibition, Nightlife, Event/Party)
 * that duplicate Events mode — those can be suggested by the AI when they match a request.
 */
export const GENERAL_ACTIVITIES: ActivityButtonDef[] = [
  { key: "dinner_brunch", label: "Dinner / Brunch", icon: "restaurant-outline" },
  { key: "coffee", label: "Coffee meetup", icon: "cafe-outline" },
  { key: "fitness", label: "Fitness / Wellness", icon: "fitness-outline" },
  { key: "outdoor", label: "Outdoor activity", icon: "leaf-outline" },
  { key: "trip", label: "Trip", icon: "car-outline" },
  { key: "custom", label: "Custom plan", icon: "create-outline" },
];

/** Mode-specific activities (prioritized when in that mode). */
export const MODE_ACTIVITIES: Record<Mode, ActivityButtonDef[]> = {
  romance: [
    { key: "romantic_dinner", label: "Romantic dinner", icon: "heart-outline" },
    { key: "wine_bar", label: "Wine bar", icon: "wine-outline" },
    { key: "evening_walk", label: "Evening walk", icon: "moon-outline" },
    { key: "museum_date", label: "Museum date", icon: "images-outline" },
  ],
  friends: [
    { key: "brunch", label: "Brunch", icon: "restaurant-outline" },
    { key: "sports_games", label: "Sports or games", icon: "game-controller-outline" },
    { key: "hike", label: "Hike", icon: "trail-sign-outline" },
    { key: "drinks", label: "Drinks", icon: "wine-outline" },
  ],
  business: [
    { key: "coffee_chat", label: "Coffee chat", icon: "cafe-outline" },
    { key: "lunch_meeting", label: "Lunch meeting", icon: "briefcase-outline" },
    { key: "golf", label: "Golf", icon: "golf-outline" },
    { key: "networking", label: "Networking event", icon: "people-outline" },
  ],
  /** No event-type cards (concert, workshop, culture, exhibition, nightlife, event/party):
   *  they duplicate Events mode list/filter; AI can suggest them when they match a request. */
  events: [],
};

/** Get activity buttons for Step 1: mode-specific first, then general (no duplicates by key). */
export function getActivityButtonsForMode(mode: Mode): ActivityButtonDef[] {
  const modeList = MODE_ACTIVITIES[mode] ?? [];
  const seen = new Set(modeList.map((a) => a.key));
  const general = GENERAL_ACTIVITIES.filter((a) => !seen.has(a.key));
  return [...modeList, ...general];
}

/** Smart defaults inferred from activity (key + label). Used to pre-fill Step 2. */
export interface SmartDefaults {
  timeOfDay: TimeOfDay;
  budgetAmount: string;
  budgetCurrency: string;
  cuisine?: string;
  datePreset: DatePreset;
}

/** Infer time of day from activity: Brunch/Lunch → lunch, Dinner/Wine/Evening → evening, Fitness → morning, etc. */
const ACTIVITY_TIME: Record<string, TimeOfDay> = {
  dinner_brunch: "lunch",
  brunch: "lunch",
  coffee: "afternoon",
  coffee_chat: "morning",
  fitness: "morning",
  romantic_dinner: "evening",
  wine_bar: "evening",
  evening_walk: "evening",
  lunch_meeting: "lunch",
  drinks: "evening",
  nightlife: "evening",
  museum_date: "afternoon",
  exhibition: "afternoon",
  culture: "afternoon",
  outdoor: "afternoon",
  trip: "morning",
  event_party: "evening",
  custom: "any",
};

/** Median budget by category (restaurant ~50, coffee ~20, etc.). Currency-agnostic amount. */
const ACTIVITY_BUDGET: Record<string, number> = {
  dinner_brunch: 50,
  brunch: 45,
  romantic_dinner: 80,
  wine_bar: 40,
  coffee: 20,
  coffee_chat: 15,
  lunch_meeting: 35,
  fitness: 25,
  museum_date: 25,
  exhibition: 20,
  concert: 45,
  event_party: 50,
  nightlife: 40,
  trip: 60,
  outdoor: 15,
  hike: 10,
  golf: 80,
  networking: 30,
  workshop: 35,
};

/** Extract cuisine from label (e.g. "Japanese brunch" → Japanese, "Romantic dinner" → none). */
function inferCuisineFromLabel(label: string): string | undefined {
  const t = label.trim();
  if (!t) return undefined;
  const cuisines = [
    "Japanese", "Italian", "French", "Mexican", "Thai", "Indian", "Chinese",
    "Greek", "Spanish", "Korean", "Vietnamese", "Mediterranean", "American",
  ];
  for (const c of cuisines) {
    if (t.toLowerCase().startsWith(c.toLowerCase()) || t.toLowerCase().includes(` ${c.toLowerCase()}`))
      return c;
  }
  return undefined;
}

export function getSmartDefaultsForActivity(
  activityKey: string,
  activityLabel: string,
  currency: string = "EUR"
): SmartDefaults {
  const timeOfDay: TimeOfDay = ACTIVITY_TIME[activityKey] ?? "any";
  const budgetAmount = ACTIVITY_BUDGET[activityKey] != null
    ? String(ACTIVITY_BUDGET[activityKey])
    : "";
  const cuisine = inferCuisineFromLabel(activityLabel);
  return {
    timeOfDay,
    budgetAmount,
    budgetCurrency: currency,
    cuisine,
    datePreset: "today",
  };
}

/** Quick budget chip values (currency-agnostic amounts). */
export const BUDGET_QUICK_AMOUNTS = [20, 50, 100] as const;

/** Currency symbol for display. */
export function getCurrencySymbol(currency: string): string {
  const map: Record<string, string> = {
    EUR: "€", GBP: "£", USD: "$", CHF: "CHF ", PLN: "zł",
  };
  return map[currency] ?? currency + " ";
}

/** Inline AI hint for a field (short, subtle). */
export function getInlineHint(
  field: "location" | "cuisine" | "budget" | "date" | "time",
  context: {
    hasLocation?: boolean;
    /** True only after user tapped the GPS / current-location button (not profile preset). */
    locationFromGps?: boolean;
    cuisine?: string;
    activityLabel?: string;
  }
): string | undefined {
  switch (field) {
    case "location":
      if (!context.hasLocation) return undefined;
      if (context.locationFromGps) return "Using your current location";
      return undefined;
    case "cuisine":
      return context.cuisine
        ? "Popular choice for this activity"
        : undefined;
    case "budget":
      return "Typical range for this category";
    case "date":
      return "Quick picks — or choose custom";
    case "time":
      return "We matched this to your activity";
    default:
      return undefined;
  }
}
