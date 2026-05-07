/**
 * Winkly AI Concierge Planning Flow — shared types and constants for the 7-step flow.
 * Step 1 Intent → 2 Activity Details → 3 Social → 4 Summary → 5 AI Suggestions → 6 Invite/Share → 7 Add to Planner
 */

import type { Mode } from "@/types";
import { categoriesForInterest } from "@/lib/ai/categoriesForInterest";

export type ConciergeFlowStep =
  | "intent"
  | "sub_activity"
  /** Trip-specific questions before activity details (location/dates). */
  | "trip_planning"
  | "activity"
  | "social"
  | "summary"
  | "suggestions"
  | "invite"
  | "add_to_planner";

/** Trip planning mini-flow (Step 1b for activity key `trip`). */
export type TripScope = "own_city" | "nearby" | "new_destination";
export type TripVibe = "culture" | "food" | "outdoors" | "entertainment" | "mixed";
export type ActivityLevel = "easy" | "moderate" | "intense";
export type TravelRadius = "1h" | "2-3h" | "3-5h" | "5h+";

export interface TripPlanningAnswers {
  scope: TripScope;
  vibe: TripVibe;
  activityLevel: ActivityLevel;
  mustHaves: string[];
  /** Only meaningful when scope === "new_destination". */
  destinationDecided: boolean;
  travelRadius?: TravelRadius;
}

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
  /** Category-specific structured extras (serialized into plan_request_text). */
  categoryExtras?: CategoryExtras;
  /** Custom plan only: merged into the main planning prompt for the AI. */
  customPromptExtra?: string;
  /** Device / "where I am now" when distinct from destination (e.g. first GPS capture). */
  originLocationLabel?: string;
  /** Single-day optional precise start time HH:mm (local). */
  exactTimeHm?: string;
}

export type CategoryDetailsVariant = "standard" | "food_drink" | "trip";

export type CategoryExtras = {
  // Food & drink
  cuisine?: string;
  atmosphere?: string;
  indoorOutdoor?: "indoor" | "outdoor" | "any";
  groupSize?: number;
  occasion?: string;
  dietaryNotes?: string;
  privateRoom?: boolean;

  // Art & culture
  artSubType?: string;
  collectionType?: string;
  afterCulturePlan?: string;

  // Sport & activity
  sportSubType?: string;
  activityLevel?: string;
  terrain?: "any" | "flat" | "hilly" | "mixed";
  postActivityPlan?: string;

  // Dance & music
  musicSubType?: string;

  // Experience & wellness
  experienceSubType?: string;
  wellnessSubType?: string;

  // Business
  meetingGoal?: string;
  meetingCounterpart?: string;
  workFriendly?: boolean;
  golfSkill?: string;
  golfHoles?: number;
  industryFocus?: string;
  networkingGoal?: string;
  eventFormat?: string;
  specificEventInMind?: boolean;
  workshopType?: string;
  workshopGroupSize?: number;

  // Trip (kept for parity; trip step already uses intentNotes/mustHaves)
  tripScope?: string;
  tripVibe?: string;
  tripActivityLevel?: string;
  tripMustHaves?: string[];
  tripDestinationDecided?: boolean;
  tripTravelRadius?: string;
  numDays?: number;
};

/** Full planning flow state (for persistence or deep link). */
export interface PlanningFlowState {
  step: ConciergeFlowStep;
  /** Selected activity key from Step 1 (e.g. "dinner", "coffee", "custom"). */
  activityKey: string | null;
  /** Human-readable activity label. */
  activityLabel: string | null;
  subActivityKey: string | null;
  subActivityLabel: string | null;
  details: Partial<ActivityDetails>;
  whoJoining: WhoJoining | null;
  /** Selected partner for invite (match/connection). */
  partnerId: string | null;
  partnerDisplayName: string | null;
}

const SURPRISE = "Surprise me";

export const FOOD_AND_DRINKS_FORMAT_PROMPTS: Record<string, string> = {
  "Dinner / Brunch":
    "Sit-down meal — the meal itself is the social occasion. Time of day and atmosphere from the form determine whether this is dinner or brunch in feel.",
  "Drinks & bar":
    "Drinks-led — bar, wine bar, cocktail spot or pub. Food is optional. Pick a venue where the drinks and atmosphere are the draw.",
  Coffee:
    "Café meet — relaxed, no meal commitment. Pick a café with good seating and a conversation-friendly environment.",
  "Street food or market":
    "Casual food market, stalls or food hall — grazing and exploring rather than sitting down. Walkable, social, no booking required.",
  [SURPRISE]:
    "Choose the best food-related format for this person, mode, weather and time of day. Pick one and plan it.",
} as const;

/** Broad intent buckets — Step 2 narrows via `subActivities` chips where listed. */
export type ActivityCategory = {
  key: string;
  label: string;
  icon: string;
  subActivities: string[];
  modes: Mode[];
  /** Maps to `categoriesForInterest()` keys from ai-gateway. */
  interestTags: string[];
  subActivityPrompt?: string;
  /** When true, Step 2 shows cuisine / atmosphere (food-led categories). */
  foodRelated?: boolean;
  /** Drives which extras block to show in Activity details. */
  detailsVariant?: CategoryDetailsVariant;
};

export const ALL_ACTIVITY_CATEGORIES: ActivityCategory[] = [
  {
    key: "art_culture",
    label: "Art & culture",
    icon: "color-palette-outline",
    subActivities: [
      "Theatre / show",
      "Museum / gallery",
      "Cinema",
      "Exhibition",
      "Opera / classical",
      SURPRISE,
    ],
    modes: ["romance", "events"],
    interestTags: ["arts_culture"],
    subActivityPrompt: "What kind of cultural experience?",
  },
  {
    key: "dinner_drinks",
    label: "Dinner & drinks",
    icon: "wine-outline",
    subActivities: [
      "Fine dining",
      "Wine bar",
      "Cocktail lounge",
      "Casual bistro",
      "Rooftop or view spot",
      SURPRISE,
    ],
    modes: ["romance"],
    interestTags: ["food_drink"],
    foodRelated: true,
    detailsVariant: "food_drink",
    subActivityPrompt: "What kind of dinner or drinks?",
  },
  {
    key: "sport_activity",
    label: "Sport & activity",
    icon: "bicycle-outline",
    subActivities: [
      "Tennis / padel",
      "Bowling",
      "Cycling route",
      "Evening stroll",
      "Indoor climbing",
      SURPRISE,
    ],
    modes: ["romance"],
    interestTags: ["fitness_wellness", "outdoors", "play"],
    subActivityPrompt: "What kind of activity?",
  },
  {
    key: "dance_music",
    label: "Dance & music",
    icon: "musical-notes-outline",
    subActivities: ["Social dance / class", "Live jazz bar", "Acoustic set", "Salsa / latin night", SURPRISE],
    modes: ["romance"],
    interestTags: ["music"],
    subActivityPrompt: "What sounds fun?",
  },
  {
    key: "experience",
    label: "Experience",
    icon: "star-outline",
    subActivities: ["Cooking class", "Tasting flight", "Boat / mini-excursion", "Photography walk", SURPRISE],
    modes: ["romance", "events"],
    interestTags: ["food_drink", "arts_culture"],
    subActivityPrompt: "What kind of experience?",
  },
  {
    key: "wellness",
    label: "Wellness",
    icon: "leaf-outline",
    subActivities: ["Spa / massage", "Sauna / bath", "Meditation / breathwork", "Thermal day pass", SURPRISE],
    modes: ["romance"],
    interestTags: ["fitness_wellness"],
    subActivityPrompt: "What kind of wellness?",
  },
  {
    key: "workshop_offsite",
    label: "Workshop / offsite",
    icon: "school-outline",
    subActivities: ["Creative workshop", "Strategy day space", "Retreat-style venue", "Team rituals block", SURPRISE],
    modes: ["romance", "events"],
    interestTags: ["other"],
    subActivityPrompt: "What kind of workshop or offsite?",
  },
  {
    key: "outdoors",
    label: "Outdoors",
    icon: "trail-sign-outline",
    subActivities: ["Hike", "Picnic", "Beach or waterfront", "Park stroll", "Scenic viewpoint", SURPRISE],
    modes: ["friends"],
    interestTags: ["outdoors"],
    subActivityPrompt: "What kind of outdoor plan?",
  },
  {
    key: "games_fun",
    label: "Games & fun",
    icon: "game-controller-outline",
    subActivities: ["Board-game café", "Bowling", "Arcade", "Escape room", "Mini golf", SURPRISE],
    modes: ["friends"],
    interestTags: ["play"],
    subActivityPrompt: "What kind of games or fun?",
  },
  {
    key: "food_drinks",
    label: "Food & drinks",
    icon: "restaurant-outline",
    subActivities: [
      "Dinner / Brunch",
      "Drinks & bar",
      "Coffee",
      "Street food or market",
      SURPRISE,
    ],
    modes: ["friends"],
    interestTags: ["food_drink"],
    foodRelated: true,
    detailsVariant: "food_drink",
    subActivityPrompt: "What kind of food or drinks?",
  },
  {
    key: "sport",
    label: "Sport",
    icon: "trophy-outline",
    subActivities: ["Watch a match", "Casual padel / hoops", "Running buddy laps", "Ice skating", SURPRISE],
    modes: ["friends"],
    interestTags: ["fitness_wellness", "play"],
    subActivityPrompt: "What kind of sport?",
  },
  {
    key: "music_nightlife",
    label: "Music & nightlife",
    icon: "moon-outline",
    subActivities: ["Live gig", "DJ night", "Karaoke room", "Late bites after show", SURPRISE],
    modes: ["friends", "events"],
    interestTags: ["music"],
    subActivityPrompt: "What kind of night out?",
  },
  {
    key: "fitness_wellness",
    label: "Fitness & wellness",
    icon: "fitness-outline",
    subActivities: ["Gym buddy slot", "Yoga / pilates", "HIIT class", "Recovery stretch / sauna", SURPRISE],
    modes: ["friends"],
    interestTags: ["fitness_wellness"],
    subActivityPrompt: "What kind of fitness or wellness?",
  },
  {
    key: "coffee_meeting",
    label: "Coffee meeting",
    icon: "cafe-outline",
    subActivities: ["Quick espresso", "Long catch-up", "Quiet laptop-friendly café", "Specialty tasting flight", SURPRISE],
    modes: ["business"],
    interestTags: ["food_drink"],
    foodRelated: true,
    detailsVariant: "food_drink",
    subActivityPrompt: "What kind of coffee meeting?",
  },
  {
    key: "lunch_meeting",
    label: "Lunch meeting",
    icon: "fast-food-outline",
    subActivities: ["Business lunch restaurant", "Casual counter-order", "Outdoor terrace lunch", SURPRISE],
    modes: ["business"],
    interestTags: ["food_drink"],
    foodRelated: true,
    detailsVariant: "food_drink",
    subActivityPrompt: "What kind of lunch?",
  },
  {
    key: "golf",
    label: "Golf",
    icon: "golf-outline",
    subActivities: ["Full round", "Driving range session", "Clubhouse drinks round", "Short lesson + range", SURPRISE],
    modes: ["business"],
    interestTags: ["fitness_wellness"],
    subActivityPrompt: "What kind of golf outing?",
  },
  {
    key: "industry_event",
    label: "Industry event",
    icon: "people-outline",
    subActivities: ["Conference / summit", "Meetup talk", "Trade fair floor", "Afterparty networking", SURPRISE],
    modes: ["business", "events"],
    interestTags: ["other"],
    subActivityPrompt: "What kind of industry event?",
  },
  {
    key: "walk_talk",
    label: "Walk & talk",
    icon: "navigate-outline",
    subActivities: ["Park loop agenda", "Waterfront stride", "Coffee-to-stroll", "Standing walking meeting", SURPRISE],
    modes: ["business"],
    interestTags: ["outdoors", "fitness_wellness"],
    subActivityPrompt: "What kind of walk & talk?",
  },
  {
    key: "business_dinner",
    label: "Business dinner",
    icon: "restaurant-outline",
    subActivities: ["Client dinner", "Team celebration", "Quiet steakhouse", "Chef's table style", SURPRISE],
    modes: ["business"],
    interestTags: ["food_drink"],
    foodRelated: true,
    detailsVariant: "food_drink",
    subActivityPrompt: "What kind of business dinner?",
  },
  {
    key: "trip",
    label: "Trip",
    icon: "car-outline",
    subActivities: [],
    modes: ["romance", "friends", "business", "events"],
    interestTags: ["outdoors", "food_drink", "arts_culture"],
    detailsVariant: "trip",
  },
  {
    key: "custom",
    label: "Custom",
    icon: "create-outline",
    subActivities: [],
    modes: ["romance", "friends", "business", "events"],
    interestTags: [],
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Intent card catalogue (new routing + UI model)
// ─────────────────────────────────────────────────────────────────────────────

export type ActivityCardDef = {
  key: string;
  label: string;
  icon: string;
  sub: string;
  /** Maps to `categoriesForInterest()` keys from ai-gateway (used for boosting). */
  interestTags: string[];
};

export type PlannerGroup = {
  key: string;
  label: string;
  cards: ActivityCardDef[];
};

// ─── 1. Generic planner (All tab, no mode context) ─────────────────────────
// 11 cards in 5 named groups. No overlap between cards.
export const PLANNER_GROUPS: PlannerGroup[] = [
  {
    key: "food_social",
    label: "Food & social",
    cards: [
      {
        key: "food_drinks",
        label: "Food & drinks",
        icon: "restaurant-outline",
        sub: "Dinner, brunch, coffee, wine, cocktails",
        interestTags: ["food_drink"],
      },
      {
        key: "social_hangout",
        label: "Social hangout",
        icon: "people-outline",
        sub: "Group catch-up, games night, party",
        interestTags: ["play"],
      },
    ],
  },
  {
    key: "arts_entertainment",
    label: "Arts & entertainment",
    cards: [
      {
        key: "arts_culture",
        label: "Arts & culture",
        icon: "color-palette-outline",
        sub: "Museum, cinema, theatre, gallery",
        interestTags: ["arts_culture"],
      },
      {
        key: "music_nightlife",
        label: "Music & nightlife",
        icon: "musical-notes-outline",
        sub: "Concert, live music, club, festival",
        interestTags: ["music"],
      },
      {
        key: "experience",
        label: "Experience",
        icon: "rocket-outline",
        sub: "Cooking class, escape room, pottery",
        interestTags: ["play", "arts_culture"],
      },
    ],
  },
  {
    key: "active_outdoors",
    label: "Active & outdoors",
    cards: [
      {
        key: "sport_activity",
        label: "Sport & activity",
        icon: "fitness-outline",
        sub: "Tennis, bowling, padel, cycling, climbing",
        interestTags: ["fitness_wellness", "outdoors", "play"],
      },
      {
        key: "outdoors_nature",
        label: "Outdoors & nature",
        icon: "leaf-outline",
        sub: "Hike, kayak, park day, camping",
        interestTags: ["outdoors"],
      },
      {
        key: "wellness",
        label: "Wellness",
        icon: "heart-outline",
        sub: "Spa, yoga, gym class, sauna",
        interestTags: ["fitness_wellness"],
      },
    ],
  },
  {
    key: "work_networking",
    label: "Work & networking",
    cards: [
      {
        key: "work_meeting",
        label: "Work meeting",
        icon: "briefcase-outline",
        sub: "Coffee chat, lunch, walk & talk, golf",
        interestTags: [],
      },
      {
        key: "industry_event",
        label: "Industry event",
        icon: "people-circle-outline",
        sub: "Meetup, conference, networking drinks",
        interestTags: ["other"],
      },
    ],
  },
  {
    key: "travel_other",
    label: "Travel & other",
    cards: [
      {
        key: "trip",
        label: "Trip",
        icon: "car-outline",
        sub: "Day trip or weekend away (1–n days)",
        interestTags: ["outdoors", "food_drink", "arts_culture"],
      },
      {
        key: "surprise_me",
        label: "Surprise me",
        icon: "star-outline",
        sub: "AI picks based on your profile & weather",
        interestTags: [],
      },
      {
        key: "custom",
        label: "Custom plan",
        icon: "create-outline",
        sub: "Describe exactly what you have in mind",
        interestTags: [],
      },
    ],
  },
];

// ─── 2. Mode-specific cards (shown highlighted in Section 1) ─────────────────
export const MODE_CARDS: Record<Mode, ActivityCardDef[]> = {
  romance: [
    {
      key: "food_drinks_r",
      label: "Dinner & drinks",
      icon: "restaurant-outline",
      sub: "Romantic dinner, wine bar, cocktails, brunch",
      interestTags: ["food_drink"],
    },
    {
      key: "arts_culture_r",
      label: "Arts & culture",
      icon: "color-palette-outline",
      sub: "Museum, cinema, theatre, gallery, opera, exhibition",
      interestTags: ["arts_culture"],
    },
    {
      key: "dance_music_r",
      label: "Dance & music",
      icon: "musical-notes-outline",
      sub: "Dancing, live music, jazz bar, concert",
      interestTags: ["music"],
    },
    {
      key: "sport_activity_r",
      label: "Sport & activity",
      icon: "fitness-outline",
      sub: "Stroll, tennis, bowling, cycling, padel",
      interestTags: ["fitness_wellness", "outdoors"],
    },
    {
      key: "experience_r",
      label: "Experience",
      icon: "rocket-outline",
      sub: "Cooking class, pottery, escape room, boat",
      interestTags: ["play", "arts_culture"],
    },
    {
      key: "wellness_r",
      label: "Wellness",
      icon: "heart-outline",
      sub: "Spa, yoga, picnic, morning hike, sauna",
      interestTags: ["fitness_wellness"],
    },
    {
      key: "trip_r",
      label: "Trip",
      icon: "car-outline",
      sub: "Day trip or romantic weekend (1–n days)",
      interestTags: ["outdoors", "food_drink"],
    },
  ],
  friends: [
    {
      key: "food_drinks_f",
      label: "Food & drinks",
      icon: "beer-outline",
      sub: "Brunch, group dinner, craft beer, rooftop",
      interestTags: ["food_drink"],
    },
    {
      key: "outdoors_f",
      label: "Outdoors",
      icon: "trail-sign-outline",
      sub: "Hike, kayak, park day, cycling, camping",
      interestTags: ["outdoors", "fitness_wellness"],
    },
    {
      key: "games_fun_f",
      label: "Games & fun",
      icon: "game-controller-outline",
      sub: "Board games, bowling, escape room, arcade",
      interestTags: ["play"],
    },
    {
      key: "sport_f",
      label: "Sport",
      icon: "football-outline",
      sub: "Football, padel, tennis, basketball",
      interestTags: ["fitness_wellness"],
    },
    {
      key: "music_nightlife_f",
      label: "Music & nightlife",
      icon: "musical-notes-outline",
      sub: "Live gig, concert, club, festival, karaoke",
      interestTags: ["music"],
    },
    {
      key: "trip_f",
      label: "Group trip",
      icon: "car-outline",
      sub: "Day trip or overnight with the group",
      interestTags: ["outdoors", "food_drink"],
    },
  ],
  business: [
    {
      key: "coffee_b",
      label: "Coffee meeting",
      icon: "cafe-outline",
      sub: "Intro, pitch, check-in, collaboration",
      interestTags: [],
    },
    {
      key: "lunch_b",
      label: "Lunch meeting",
      icon: "briefcase-outline",
      sub: "Client lunch, working lunch, team lunch",
      interestTags: ["food_drink"],
    },
    {
      key: "golf_b",
      label: "Golf",
      icon: "golf-outline",
      sub: "9 or 18 holes, driving range",
      interestTags: ["fitness_wellness"],
    },
    {
      key: "industry_event_b",
      label: "Industry event",
      icon: "people-outline",
      sub: "Meetup, panel, drinks reception, conference",
      interestTags: [],
    },
    {
      key: "walk_talk_b",
      label: "Walk & talk",
      icon: "walk-outline",
      sub: "Informal outdoor meeting, park loop",
      interestTags: ["outdoors"],
    },
    {
      key: "business_dinner_b",
      label: "Business dinner",
      icon: "restaurant-outline",
      sub: "Client dinner, team celebration",
      interestTags: ["food_drink"],
    },
    {
      key: "workshop_b",
      label: "Workshop / offsite",
      icon: "easel-outline",
      sub: "Team workshop, brainstorm, training",
      interestTags: [],
    },
  ],
  events: [], // Events tab uses the All/generic layout
};

// ─── 3. Generic tail cards (always appended after mode-specific in mode contexts) ──
export const GENERIC_TAIL: ActivityCardDef[] = [
  { key: "surprise_me", label: "Surprise me", icon: "star-outline", sub: "AI picks the perfect plan", interestTags: [] },
  { key: "custom", label: "Custom plan", icon: "create-outline", sub: "Your own idea", interestTags: [] },
];

export type RankedCard = ActivityCardDef & {
  boosted: boolean;
  boostReason?: string;
};

export type IntentSection = {
  key: string;
  label: string;
  labelStyle?: "boosted" | "romance" | "friends" | "business" | "muted";
  cards: RankedCard[];
};

export type RankInput = {
  selfInterests: string[];
  partnerInterests?: string[];
};

function gatewayTagsForInterest(tag: string): string[] {
  return categoriesForInterest(tag);
}

export function getIntentCards(
  plannerScope: "all" | Mode,
  rankInput?: RankInput
): IntentSection[] {
  // ── Generic / All ────────────────────────────────────────────────────────
  if (plannerScope === "all" || plannerScope === "events") {
    return PLANNER_GROUPS.map((group) => ({
      key: group.key,
      label: group.label,
      labelStyle: "muted" as const,
      cards: group.cards.map((c) => ({ ...c, boosted: false })),
    }));
  }

  // ── Mode context (romance / friends / business) ───────────────────────────
  const modeCards = MODE_CARDS[plannerScope] ?? [];

  const ranked: RankedCard[] = modeCards.map((card) => {
    if (!rankInput) return { ...card, boosted: false };

    const selfCats = new Set(rankInput.selfInterests.flatMap(gatewayTagsForInterest));
    const partnerCats = rankInput.partnerInterests?.length
      ? new Set(rankInput.partnerInterests.flatMap(gatewayTagsForInterest))
      : null;

    const selfMatch = card.interestTags.some((t) => selfCats.has(t));
    const partnerMatch = partnerCats ? card.interestTags.some((t) => partnerCats.has(t)) : false;

    if (selfMatch && partnerMatch) {
      const shared = card.interestTags.find((t) => selfCats.has(t) && partnerCats?.has(t));
      return {
        ...card,
        boosted: true,
        boostReason: `Both love ${(shared ?? "this").replace(/_/g, " ")}`,
      };
    }
    if (selfMatch) return { ...card, boosted: true };
    return { ...card, boosted: false };
  });

  const hasBoosted = ranked.some((c) => c.boosted);
  const section1Cards = hasBoosted
    ? [...ranked.filter((c) => c.boosted), ...ranked.filter((c) => !c.boosted)]
    : ranked;

  const modeLabel =
    plannerScope === "romance" ? "Dates & romance"
    : plannerScope === "friends" ? "Meet-ups & friends"
    : "Professional";

  const modeLabelStyle =
    plannerScope === "romance" ? "romance"
    : plannerScope === "friends" ? "friends"
    : "business";

  const sections: IntentSection[] = [
    {
      key: "mode_cards",
      label: hasBoosted ? `✦ ${modeLabel}` : modeLabel,
      labelStyle: hasBoosted ? "boosted" : modeLabelStyle,
      cards: section1Cards,
    },
  ];

  const modeKeys = new Set(modeCards.map((c) => c.key));
  const crossModeCards: RankedCard[] = [
    { key: "arts_culture", label: "Arts & culture", icon: "color-palette-outline", sub: "Museum, cinema, gallery, exhibition", interestTags: ["arts_culture"], boosted: false },
    { key: "wellness", label: "Wellness", icon: "heart-outline", sub: "Spa, yoga, gym class, sauna", interestTags: ["fitness_wellness"], boosted: false },
    { key: "experience", label: "Experience", icon: "rocket-outline", sub: "Cooking class, escape room, pottery", interestTags: ["play"], boosted: false },
  ].filter((c) => !modeKeys.has(c.key));

  sections.push({
    key: "more",
    label: "More options",
    labelStyle: "muted",
    cards: [
      ...crossModeCards,
      ...GENERIC_TAIL.map((c) => ({ ...c, boosted: false })),
    ],
  });

  return sections;
}

const CATEGORY_BY_KEY: Record<string, ActivityCategory> = Object.fromEntries(
  ALL_ACTIVITY_CATEGORIES.map((c) => [c.key, c])
);

export function getActivityCategoryByKey(key: string | null | undefined): ActivityCategory | undefined {
  if (!key) return undefined;
  return CATEGORY_BY_KEY[key];
}

/** Categories shown for the Step 1 grid when focused on one mode. */
export function getCategoriesForMode(mode: Mode): ActivityCategory[] {
  return ALL_ACTIVITY_CATEGORIES.filter((c) => c.modes.includes(mode));
}

/** Smart defaults inferred from activity (key + label). Used to pre-fill Step 2. */
export interface SmartDefaults {
  timeOfDay: TimeOfDay;
  budgetAmount: string;
  budgetCurrency: string;
  cuisine?: string;
  datePreset: DatePreset;
}

/** Infer time of day from activity category key. */
const ACTIVITY_TIME: Record<string, TimeOfDay> = {
  art_culture: "afternoon",
  dinner_drinks: "evening",
  sport_activity: "afternoon",
  dance_music: "evening",
  experience: "afternoon",
  wellness: "morning",
  workshop_offsite: "morning",
  outdoors: "afternoon",
  games_fun: "afternoon",
  food_drinks: "evening",
  sport: "afternoon",
  music_nightlife: "evening",
  fitness_wellness: "morning",
  coffee_meeting: "morning",
  lunch_meeting: "lunch",
  golf: "afternoon",
  industry_event: "afternoon",
  walk_talk: "afternoon",
  business_dinner: "evening",
  trip: "morning",
  custom: "any",
  // ── Mode-specific intent keys (new taxonomy) ─────────────────────────────
  food_drinks_r: "evening",
  arts_culture_r: "afternoon",
  dance_music_r: "evening",
  sport_activity_r: "afternoon",
  experience_r: "afternoon",
  wellness_r: "morning",
  trip_r: "morning",
  food_drinks_f: "evening",
  outdoors_f: "afternoon",
  games_fun_f: "afternoon",
  sport_f: "afternoon",
  music_nightlife_f: "evening",
  trip_f: "morning",
  coffee_b: "morning",
  lunch_b: "lunch",
  golf_b: "afternoon",
  industry_event_b: "afternoon",
  walk_talk_b: "afternoon",
  business_dinner_b: "evening",
  workshop_b: "morning",
};

/** Median budget by category (currency-agnostic amounts). */
const ACTIVITY_BUDGET: Record<string, number> = {
  art_culture: 28,
  dinner_drinks: 75,
  sport_activity: 25,
  dance_music: 45,
  experience: 55,
  wellness: 85,
  workshop_offsite: 45,
  outdoors: 15,
  games_fun: 30,
  food_drinks: 45,
  sport: 25,
  music_nightlife: 50,
  fitness_wellness: 28,
  coffee_meeting: 15,
  lunch_meeting: 38,
  golf: 85,
  industry_event: 40,
  walk_talk: 12,
  business_dinner: 85,
  trip: 60,
  custom: 45,
  // ── Mode-specific intent keys (new taxonomy) ─────────────────────────────
  // Romance
  food_drinks_r: 85,
  arts_culture_r: 35,
  dance_music_r: 55,
  sport_activity_r: 30,
  experience_r: 65,
  wellness_r: 95,
  trip_r: 70,
  // Friends
  food_drinks_f: 55,
  outdoors_f: 20,
  games_fun_f: 35,
  sport_f: 30,
  music_nightlife_f: 60,
  trip_f: 70,
  // Business
  coffee_b: 18,
  lunch_b: 45,
  golf_b: 95,
  industry_event_b: 50,
  walk_talk_b: 15,
  business_dinner_b: 95,
  workshop_b: 60,
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
/** Merge trip questionnaire answers into Step 2 fields used by `buildPlanRequestText`. */
export function tripAnswersToActivityDetails(
  answers: TripPlanningAnswers,
  existingDetails: Partial<ActivityDetails>
): Partial<ActivityDetails> {
  const vibeMap: Record<TripVibe, string> = {
    culture: "culture and history",
    food: "food and local dining",
    outdoors: "outdoor activities and nature",
    entertainment: "shopping and entertainment",
    mixed: "a mixed day out",
  };
  const scopeMap: Record<TripScope, string> = {
    own_city: "day trip in my own city/area",
    nearby: "nearby getaway (short travel)",
    new_destination: "travel to a new destination",
  };
  const destNote =
    answers.scope === "new_destination"
      ? answers.destinationDecided
        ? "Destination is decided."
        : `Still deciding on destination.${answers.travelRadius ? ` Travel radius: ${answers.travelRadius}.` : ""}`
      : "";
  const mustHaveStr = answers.mustHaves.length
    ? `Must-haves: ${answers.mustHaves.join(", ")}.`
    : "";
  const radiusStr =
    answers.travelRadius && answers.scope === "new_destination" && !answers.destinationDecided
      ? `Willing to travel: ${answers.travelRadius}.`
      : "";

  return {
    ...existingDetails,
    intentNotes: [
      `Trip scope: ${scopeMap[answers.scope]}.`,
      `Trip vibe: ${vibeMap[answers.vibe]}. Activity level: ${answers.activityLevel}.`,
      destNote,
    ]
      .filter(Boolean)
      .join(" "),
    mustHaves: [mustHaveStr, radiusStr].filter(Boolean).join(" ") || existingDetails.mustHaves,
    singleDay: existingDetails.singleDay ?? true,
  };
}

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
      return undefined;
    case "time":
      return undefined;
    default:
      return undefined;
  }
}
