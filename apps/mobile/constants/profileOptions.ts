// Winkly profile option lists — sub-profile fields

// ─── Core onboarding ────────────────────────────────────────────────────────
/** "Looking for" — who the user wants to be matched with (core profile). */
export const LOOKING_FOR_OPTIONS = ["Women", "Men", "Everyone"];

/**
 * Activity preferences — Winkly's differentiator. Collected during onboarding
 * as fun visual cards and stored as tags that drive the activity
 * recommendation engine. Max 10 selections (see ACTIVITY_PREFERENCES_MAX).
 */
export const ACTIVITY_PREFERENCES_MAX = 10;

export type ActivityPreferenceOption = {
  /** Stable tag stored in the profile. */
  key: string;
  /** Display label shown on the card. */
  label: string;
  /** Emoji shown on the card (kept playful, not a dry form). */
  emoji: string;
};

/** Pre-selected on onboarding step 3 so the grid never feels blank. */
export const POPULAR_ACTIVITY_PREFERENCE_KEYS = ["coffee", "restaurants", "hiking"] as const;

export const ACTIVITY_PREFERENCE_OPTIONS: ActivityPreferenceOption[] = [
  { key: "hiking", label: "Hiking", emoji: "🥾" },
  { key: "restaurants", label: "Restaurants", emoji: "🍽️" },
  { key: "coffee", label: "Coffee", emoji: "☕" },
  { key: "museums", label: "Museums & Art", emoji: "🎨" },
  { key: "concerts", label: "Concerts", emoji: "🎵" },
  { key: "sports", label: "Sports", emoji: "⚽" },
  { key: "movies", label: "Movies", emoji: "🎬" },
  { key: "travel", label: "Travel", emoji: "✈️" },
  { key: "nightlife", label: "Nightlife", emoji: "🍸" },
  { key: "fitness", label: "Fitness", emoji: "💪" },
  { key: "beach", label: "Beach", emoji: "🏖️" },
  { key: "gaming", label: "Gaming", emoji: "🎮" },
  { key: "photography", label: "Photography", emoji: "📷" },
  { key: "cooking", label: "Cooking", emoji: "🍳" },
  { key: "dancing", label: "Dancing", emoji: "💃" },
  { key: "festivals", label: "Festivals", emoji: "🎉" },
  { key: "theater", label: "Theater", emoji: "🎭" },
  { key: "reading", label: "Reading", emoji: "📚" },
  { key: "nature", label: "Nature & Outdoors", emoji: "🌿" },
  { key: "wine_tasting", label: "Wine Tasting", emoji: "🍷" },
];

// ─── Common (e.g. filters: preferred language) ─────────────────────────────
export const LANGUAGE_OPTIONS = [
  "Any",
  "English",
  "German",
  "Ukrainian",
  "Spanish",
  "French",
  "Italian",
  "Portuguese",
  "Dutch",
  "Polish",
  "Russian",
  "Turkish",
  "Arabic",
  "Chinese",
  "Japanese",
  "Korean",
  "Other",
];

// ─── Romance ───────────────────────────────────────────────────────────────
export const LIFESTYLE_ROMANCE = [
  "Very active (sport 3–5x/week)",
  "Moderately active",
  "Walks & light movement",
  "Mostly relaxed / home-oriented",
  "Spontaneous bursts of activity",
  "Night owl",
  "Early bird",
];

export const SMOKING_OPTIONS = [
  "No",
  "Yes, cigarettes",
  "Yes, weed",
  "Yes, both",
  "Socially",
  "Prefer not to say",
];

export const ALCOHOL_OPTIONS = [
  "No",
  "Yes, socially",
  "Yes, regularly",
  "Rarely",
  "Prefer not to say",
];

export const KIDS_OPTIONS = [
  "No kids",
  "Have kids",
  "Don't want kids",
  "Want kids",
  "Open to kids",
  "Prefer not to say",
];

export const SEXUAL_VIEWS_OPTIONS = [
  "Straight (Heterosexual)",
  "Gay",
  "Lesbian",
  "Bisexual",
  "Pansexual",
  "Asexual",
  "Queer",
  "Questioning / Exploring",
  "Prefer not to say",
];

export const RELATIONSHIP_GOALS_OPTIONS = [
  "Something serious",
  "Long-term / life partner",
  "Marriage",
  "Keeping it casual",
  "Friends first, see where it goes",
  "Open to whatever",
  "Not sure yet",
];

export const RELIGION_OPTIONS = [
  "Agnostic",
  "Atheist",
  "Buddhist",
  "Christian",
  "Hindu",
  "Jewish",
  "Muslim",
  "Spiritual",
  "Other",
  "Prefer not to say",
];

export const POLITICAL_VIEWS_OPTIONS = [
  "Liberal",
  "Moderate",
  "Conservative",
  "Apolitical",
  "Other",
  "Prefer not to say",
];

export const VALUES_OPTIONS = [
  "Honesty",
  "Family",
  "Adventure",
  "Growth",
  "Loyalty",
  "Creativity",
  "Independence",
  "Emotional maturity",
  "Kindness",
  "Ambition",
  "Balance",
  "Communication",
  "Trust",
  "Open-mindedness",
  "Humor",
];

// ─── Shared (Romance + Friends) ─────────────────────────────────────────────
export const PETS_OPTIONS = [
  "No pets",
  "Dogs",
  "Cats",
  "Birds",
  "Other pets",
  "Love pets",
];

export const ALLERGIES_OPTIONS = [
  "None",
  "Peanuts",
  "Gluten",
  "Dairy",
  "Shellfish",
  "Tree nuts",
  "Allergic to pets",
  "Other",
  "Prefer not to say",
];

export const FOOD_OPTIONS = [
  "Omnivore",
  "Vegetarian",
  "Vegan",
  "Pescatarian",
  "Flexitarian",
  "Keto",
  "Halal",
  "Kosher",
  "Other",
  "Prefer not to say",
];

// ─── Friends ───────────────────────────────────────────────────────────────
export const MEETUP_GOALS_OPTIONS = [
  "Meeting in real life",
  "Sport buddy",
  "Coffee chats",
  "Hiking & outdoor",
  "Cultural events",
  "Gaming",
  "Travel buddy",
  "Study buddy",
  "Small groups",
  "Large gatherings",
];

export const STATUS_OPTIONS = [
  "Single",
  "Married",
  "In a relationship",
  "Divorced",
  "Widowed",
  "Prefer not to say",
];

export const KIDS_FRIENDS_OPTIONS = [
  "No kids",
  "Have kids",
  "Expecting",
  "Toddlers",
  "Older kids",
  "Prefer not to say",
];

// ─── Business ──────────────────────────────────────────────────────────────
export const INDUSTRY_OPTIONS = [
  "Technology",
  "Finance",
  "Healthcare",
  "Marketing",
  "Consulting",
  "Education",
  "Real estate",
  "Retail",
  "Manufacturing",
  "Creative",
  "Legal",
  "Other",
];

export const ROLE_OPTIONS = [
  "Founder",
  "Executive",
  "Manager",
  "Specialist",
  "Consultant",
  "Freelancer",
  "Student",
  "Investor",
  "Other",
];

export const NETWORKING_GOALS_OPTIONS = [
  "Partnerships",
  "Hiring",
  "Mentorship",
  "Sales & clients",
  "Investor relations",
  "Collaboration",
  "Freelance opportunities",
  "Industry events",
  "Learning & growth",
];

export const SKILLS_POPULAR_BUSINESS = ["Project management", "Marketing", "Sales", "Leadership", "Data analytics"];

export const BUSINESS_NETWORKING_GOALS = [
  "Open to advising",
  "Looking for co-founder",
  "Hiring",
  "Seeking investment",
  "Open to collaboration",
  "Freelance & consulting",
  "Building partnerships",
  "Looking for mentorship",
  "Offering mentorship",
] as const;

export const BUSINESS_ROLE_TYPES = [
  "Founder / CEO",
  "Co-founder",
  "C-suite",
  "Investor",
  "Angel investor",
  "VC",
  "Engineer",
  "Product manager",
  "Designer",
  "Sales & BD",
  "Marketing",
  "Consultant",
  "Freelancer",
  "Researcher",
  "Other",
] as const;

export const BUSINESS_INDUSTRIES = [
  "Tech & SaaS",
  "Fintech",
  "HealthTech",
  "E-commerce",
  "Creative & Media",
  "Real Estate",
  "Legal & Compliance",
  "Education",
  "Climate tech",
  "Mobility & Logistics",
  "Consumer",
  "B2B Services",
  "Other",
] as const;

export const BUSINESS_FILTER_CHIPS: {
  label: string;
  roleType?: string;
  goal?: string;
}[] = [
  { label: "All" },
  { label: "Founders", roleType: "Founder / CEO" },
  { label: "Investors", roleType: "Investor" },
  { label: "Engineers", roleType: "Engineer" },
  { label: "Designers", roleType: "Designer" },
  { label: "Consultants", roleType: "Consultant" },
  { label: "Open to advise", goal: "Open to advising" },
  { label: "Hiring", goal: "Hiring" },
];

// ─── Interests: 5 most popular per mode + users can add custom ─────────────
export const INTEREST_POPULAR_ROMANCE = ["Travel", "Music", "Food", "Fitness", "Movies"];
export const INTEREST_POPULAR_FRIENDS = ["Hiking", "Coffee", "Travel", "Movies", "Fitness"];
export const INTEREST_POPULAR_BUSINESS = ["Tech", "Networking", "Marketing", "Leadership", "Innovation"];
