/**
 * Winkly AI Concierge Planning Flow — shared types and constants for the 7-step flow.
 * Step 1 Intent → 2 Activity Details → 3 Social → 4 Summary → 5 AI Suggestions → 6 Invite/Share → 7 Add to Planner
 */

import i18n from "i18next";
import type { Mode } from "@/types";
import { categoriesForInterest } from "@/lib/ai/categoriesForInterest";

export type ConciergeFlowStep =
  | "intent"
  | "sub_activity"
  /** Trip-specific questions before activity details (location/dates). */
  | "trip_planning"
  /** Free-text quick request — skip the long activity form. */
  | "quick_request"
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
  /** Must-have ids (TripPlanningFlow MUST_HAVE_IDS), e.g. "photo_spots". */
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
  /** Optional venue search radius in kilometers around city or precise pin. */
  searchRadiusKm?: number;
  /** Optional precise map pin (search center). */
  latitude?: number;
  longitude?: number;
  /** Human-readable label for the precise pin (reverse-geocoded). */
  pinLabel?: string;
}

/** Optional search-radius chips shared by Quick plan + activity forms. */
export const PLANNING_RADIUS_KM_OPTIONS = [1, 2, 5, 10, 20] as const;

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

export const FOOD_AND_DRINKS_FORMAT_PROMPTS: Record<string, string> = {
  "Dinner / Brunch":
    "Sit-down meal — the meal itself is the social occasion. Time of day and atmosphere from the form determine whether this is dinner or brunch in feel.",
  "Drinks & bar":
    "Drinks-led — bar, wine bar, cocktail spot or pub. Food is optional. Pick a venue where the drinks and atmosphere are the draw.",
  Coffee:
    "Café meet — relaxed, no meal commitment. Pick a café with good seating and a conversation-friendly environment.",
  "Street food or market":
    "Casual food market, stalls or food hall — grazing and exploring rather than sitting down. Walkable, social, no booking required.",
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
      "Dinner / Brunch",
      "Drinks & bar",
      "Coffee",
      "Street food or market",
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
    ],
    modes: ["romance"],
    interestTags: ["fitness_wellness", "outdoors", "play"],
    subActivityPrompt: "What kind of activity?",
  },
  {
    key: "dance_music",
    label: "Dance & music",
    icon: "musical-notes-outline",
    subActivities: ["Social dance / class", "Live jazz bar", "Acoustic set", "Salsa / latin night"],
    modes: ["romance"],
    interestTags: ["music"],
    subActivityPrompt: "What sounds fun?",
  },
  {
    key: "experience",
    label: "Experience",
    icon: "star-outline",
    subActivities: ["Cooking class", "Tasting flight", "Boat / mini-excursion", "Photography walk"],
    modes: ["romance", "events"],
    interestTags: ["food_drink", "arts_culture"],
    subActivityPrompt: "What kind of experience?",
  },
  {
    key: "wellness",
    label: "Wellness",
    icon: "leaf-outline",
    subActivities: ["Spa / massage", "Sauna / bath", "Meditation / breathwork", "Thermal day pass"],
    modes: ["romance"],
    interestTags: ["fitness_wellness"],
    subActivityPrompt: "What kind of wellness?",
  },
  {
    key: "workshop_offsite",
    label: "Workshop / offsite",
    icon: "school-outline",
    subActivities: ["Creative workshop", "Strategy day space", "Retreat-style venue", "Team rituals block"],
    modes: ["romance", "events"],
    interestTags: ["other"],
    subActivityPrompt: "What kind of workshop or offsite?",
  },
  {
    key: "outdoors",
    label: "Outdoors",
    icon: "trail-sign-outline",
    subActivities: ["Hike", "Picnic", "Beach or waterfront", "Park stroll", "Scenic viewpoint"],
    modes: ["friends"],
    interestTags: ["outdoors"],
    subActivityPrompt: "What kind of outdoor plan?",
  },
  {
    key: "games_fun",
    label: "Games & fun",
    icon: "game-controller-outline",
    subActivities: ["Board-game café", "Bowling", "Arcade", "Escape room", "Mini golf"],
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
    subActivities: ["Watch a match", "Casual padel / hoops", "Running buddy laps", "Ice skating"],
    modes: ["friends"],
    interestTags: ["fitness_wellness", "play"],
    subActivityPrompt: "What kind of sport?",
  },
  {
    key: "music_nightlife",
    label: "Music & nightlife",
    icon: "moon-outline",
    subActivities: ["Live gig", "DJ night", "Karaoke room", "Late bites after show"],
    modes: ["friends", "events"],
    interestTags: ["music"],
    subActivityPrompt: "What kind of night out?",
  },
  {
    key: "fitness_wellness",
    label: "Fitness & wellness",
    icon: "fitness-outline",
    subActivities: ["Gym buddy slot", "Yoga / pilates", "HIIT class", "Recovery stretch / sauna"],
    modes: ["friends"],
    interestTags: ["fitness_wellness"],
    subActivityPrompt: "What kind of fitness or wellness?",
  },
  {
    key: "coffee_meeting",
    label: "Coffee meeting",
    icon: "cafe-outline",
    subActivities: ["Quick espresso", "Long catch-up", "Quiet laptop-friendly café", "Specialty tasting flight"],
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
    subActivities: ["Business lunch restaurant", "Casual counter-order", "Outdoor terrace lunch"],
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
    subActivities: ["Full round", "Driving range session", "Clubhouse drinks round", "Short lesson + range"],
    modes: ["business"],
    interestTags: ["fitness_wellness"],
    subActivityPrompt: "What kind of golf outing?",
  },
  {
    key: "industry_event",
    label: "Industry event",
    icon: "people-outline",
    subActivities: ["Conference / summit", "Meetup talk", "Trade fair floor", "Afterparty networking"],
    modes: ["business", "events"],
    interestTags: ["other"],
    subActivityPrompt: "What kind of industry event?",
  },
  {
    key: "walk_talk",
    label: "Walk & talk",
    icon: "navigate-outline",
    subActivities: ["Park loop agenda", "Waterfront stride", "Coffee-to-stroll", "Standing walking meeting"],
    modes: ["business"],
    interestTags: ["outdoors", "fitness_wellness"],
    subActivityPrompt: "What kind of walk & talk?",
  },
  {
    key: "business_dinner",
    label: "Business dinner",
    icon: "restaurant-outline",
    subActivities: ["Client dinner", "Team celebration", "Quiet steakhouse", "Chef's table style"],
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
    key: "quick",
    label: "Quick plan",
    icon: "flash-outline",
    subActivities: [],
    modes: ["romance", "friends", "business", "events"],
    interestTags: [],
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

/** Icon + one-line hint per sub-activity label (Step 1b grid). Hints are translated for display via conciergeCatalogI18n. */
export const SUB_ACTIVITY_META: Record<string, { icon: string; hint?: string }> = {
  "Dinner / Brunch": { icon: "restaurant-outline", hint: "Sit-down meal occasion" },
  "Drinks & bar": { icon: "wine-outline", hint: "Bar, wine bar or pub" },
  Coffee: { icon: "cafe-outline", hint: "Relaxed café meet" },
  "Street food or market": { icon: "storefront-outline", hint: "Markets & food halls" },
  "Theatre / show": { icon: "ticket-outline", hint: "Live performance" },
  "Museum / gallery": { icon: "images-outline", hint: "Explore exhibits" },
  Cinema: { icon: "film-outline", hint: "Movie outing" },
  Exhibition: { icon: "easel-outline", hint: "Special show or fair" },
  "Opera / classical": { icon: "musical-notes-outline", hint: "Classical performance" },
  "Tennis / padel": { icon: "tennisball-outline", hint: "Court sport" },
  Bowling: { icon: "bowling-ball-outline", hint: "Lanes & friendly competition" },
  "Cycling route": { icon: "bicycle-outline", hint: "Scenic ride together" },
  "Evening stroll": { icon: "walk-outline", hint: "Relaxed walk at dusk" },
  "Indoor climbing": { icon: "trending-up-outline", hint: "Bouldering or climbing gym" },
  "Social dance / class": { icon: "body-outline", hint: "Learn steps together" },
  "Live jazz bar": { icon: "musical-note-outline", hint: "Intimate live music" },
  "Acoustic set": { icon: "mic-outline", hint: "Small venue performance" },
  "Salsa / latin night": { icon: "flame-outline", hint: "Latin dance night" },
  "Cooking class": { icon: "restaurant-outline", hint: "Hands-on kitchen session" },
  "Tasting flight": { icon: "wine-outline", hint: "Curated tasting experience" },
  "Boat / mini-excursion": { icon: "boat-outline", hint: "Short scenic trip" },
  "Photography walk": { icon: "camera-outline", hint: "Explore with your camera" },
  "Spa / massage": { icon: "flower-outline", hint: "Relax and recharge" },
  "Sauna / bath": { icon: "water-outline", hint: "Thermal or sauna session" },
  "Meditation / breathwork": { icon: "leaf-outline", hint: "Calm, mindful session" },
  "Thermal day pass": { icon: "sunny-outline", hint: "Full-day wellness venue" },
  "Creative workshop": { icon: "brush-outline", hint: "Team creative session" },
  "Strategy day space": { icon: "bulb-outline", hint: "Focused offsite room" },
  "Retreat-style venue": { icon: "home-outline", hint: "Away-from-office setting" },
  "Team rituals block": { icon: "people-outline", hint: "Structured team time" },
  Hike: { icon: "trail-sign-outline", hint: "Trail or nature walk" },
  Picnic: { icon: "basket-outline", hint: "Outdoor food & blankets" },
  "Beach or waterfront": { icon: "water-outline", hint: "Coastal hangout" },
  "Park stroll": { icon: "leaf-outline", hint: "Easy walk in the park" },
  "Scenic viewpoint": { icon: "eye-outline", hint: "Photo-worthy lookout" },
  "Board-game café": { icon: "dice-outline", hint: "Games over drinks" },
  Arcade: { icon: "game-controller-outline", hint: "Classic arcade fun" },
  "Escape room": { icon: "key-outline", hint: "Puzzle adventure" },
  "Mini golf": { icon: "golf-outline", hint: "Light-hearted competition" },
  "Watch a match": { icon: "tv-outline", hint: "Live sport viewing" },
  "Casual padel / hoops": { icon: "basketball-outline", hint: "Pick-up sport" },
  "Running buddy laps": { icon: "footsteps-outline", hint: "Run together" },
  "Ice skating": { icon: "snow-outline", hint: "Rink session" },
  "Live gig": { icon: "musical-notes-outline", hint: "Concert or live set" },
  "DJ night": { icon: "disc-outline", hint: "Club or dance floor" },
  "Karaoke room": { icon: "mic-outline", hint: "Private karaoke session" },
  "Late bites after show": { icon: "fast-food-outline", hint: "Post-show food run" },
  "Gym buddy slot": { icon: "barbell-outline", hint: "Work out together" },
  "Yoga / pilates": { icon: "body-outline", hint: "Studio class" },
  "HIIT class": { icon: "flash-outline", hint: "High-intensity session" },
  "Recovery stretch / sauna": { icon: "fitness-outline", hint: "Active recovery" },
  "Quick espresso": { icon: "cafe-outline", hint: "Short focused meet" },
  "Long catch-up": { icon: "chatbubbles-outline", hint: "Unhurried conversation" },
  "Quiet laptop-friendly café": { icon: "laptop-outline", hint: "Work-friendly setting" },
  "Specialty tasting flight": { icon: "wine-outline", hint: "Curated coffee or tea" },
  "Business lunch restaurant": { icon: "restaurant-outline", hint: "Sit-down business lunch" },
  "Casual counter-order": { icon: "fast-food-outline", hint: "Quick casual lunch" },
  "Outdoor terrace lunch": { icon: "sunny-outline", hint: "Al fresco dining" },
  "Full round": { icon: "golf-outline", hint: "18-hole round" },
  "Driving range session": { icon: "golf-outline", hint: "Practice at the range" },
  "Clubhouse drinks round": { icon: "beer-outline", hint: "Post-game drinks" },
  "Short lesson + range": { icon: "school-outline", hint: "Coaching plus practice" },
  "Conference / summit": { icon: "podium-outline", hint: "Large industry event" },
  "Meetup talk": { icon: "megaphone-outline", hint: "Community talk or panel" },
  "Trade fair floor": { icon: "storefront-outline", hint: "Expo or trade show" },
  "Afterparty networking": { icon: "people-outline", hint: "Post-event mingle" },
  "Park loop agenda": { icon: "walk-outline", hint: "Walking meeting loop" },
  "Waterfront stride": { icon: "water-outline", hint: "Scenic walking route" },
  "Coffee-to-stroll": { icon: "cafe-outline", hint: "Coffee then a walk" },
  "Standing walking meeting": { icon: "footsteps-outline", hint: "Walk while you talk" },
  "Client dinner": { icon: "restaurant-outline", hint: "Formal client meal" },
  "Team celebration": { icon: "sparkles-outline", hint: "Celebrate together" },
  "Quiet steakhouse": { icon: "restaurant-outline", hint: "Low-key upscale dinner" },
  "Chef's table style": { icon: "star-outline", hint: "Premium dining experience" },
  Any: { icon: "ellipse-outline", hint: "Open to anything" },
};

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
    key: "quick_start",
    label: "Quick start",
    cards: [
      {
        key: "custom",
        label: "Custom plan",
        icon: "create-outline",
        sub: "Describe exactly what you have in mind",
        interestTags: [],
      },
      {
        key: "quick",
        label: "Quick plan",
        icon: "flash-outline",
        sub: "Type what you want — get venue options nearby",
        interestTags: [],
      },
    ],
  },
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
    key: "travel",
    label: "Travel",
    cards: [
      {
        key: "trip",
        label: "Trip",
        icon: "car-outline",
        sub: "Day trip or weekend away (1–n days)",
        interestTags: ["outdoors", "food_drink", "arts_culture"],
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
  { key: "custom", label: "Custom plan", icon: "create-outline", sub: "Your own idea", interestTags: [] },
  { key: "quick", label: "Quick plan", icon: "flash-outline", sub: "Type what you want — options nearby", interestTags: [] },
];

export type RankedCard = ActivityCardDef & {
  boosted: boolean;
  boostReason?: string;
  /** Shared interest behind `boostReason` (e.g. "food drink"), for a translated "Both love …" line. */
  boostInterest?: string;
};

/** Section headings from getIntentCards (English values; translated for display via conciergeCatalogI18n). */
export const INTENT_SECTION_LABELS = ["Dates & romance", "Meet-ups & friends", "Professional", "More options"] as const;

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
      const boostInterest = (shared ?? "this").replace(/_/g, " ");
      return {
        ...card,
        boosted: true,
        boostReason: `Both love ${boostInterest}`,
        boostInterest,
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
      ...GENERIC_TAIL.map((c) => ({ ...c, boosted: false })),
      ...crossModeCards,
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
  quick: "any",
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
  quick: 40,
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

/** Inline hints returned by getInlineHint (English values; translated for display via conciergeCatalogI18n). */
export const INLINE_HINT_TEXTS = [
  "Using your current location",
  "Popular choice for this activity",
  "Typical range for this category",
] as const;

/**
 * Merge trip questionnaire answers into Step 2 fields used by `buildPlanRequestText`.
 * The notes land in the (editable) request field, so they're written in the app language —
 * the AI reads any language.
 */
export function tripAnswersToActivityDetails(
  answers: TripPlanningAnswers,
  existingDetails: Partial<ActivityDetails>
): Partial<ActivityDetails> {
  const tr = (key: string, opts?: Record<string, unknown>) => i18n.t(`concierge.tripNotes.${key}`, opts);
  const destNote =
    answers.scope === "new_destination"
      ? answers.destinationDecided
        ? tr("destinationDecided")
        : answers.travelRadius
          ? tr("destinationUndecidedRadius", { radius: i18n.t(`concierge.trip.radius.${answers.travelRadius}`) })
          : tr("destinationUndecided")
      : "";
  const mustHaveStr = answers.mustHaves.length
    ? tr("mustHaves", { list: answers.mustHaves.map((id) => i18n.t(`concierge.trip.mustHave.${id}`)).join(", ") })
    : "";
  const radiusStr =
    answers.travelRadius && answers.scope === "new_destination" && !answers.destinationDecided
      ? tr("willingToTravel", { radius: i18n.t(`concierge.trip.radius.${answers.travelRadius}`) })
      : "";

  return {
    ...existingDetails,
    intentNotes: [
      tr("scope", { scope: tr(`scopeValue.${answers.scope}`) }),
      tr("vibe", { vibe: tr(`vibeValue.${answers.vibe}`), level: tr(`levelValue.${answers.activityLevel}`) }),
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
