// Winkly — shared "Interests" taxonomy used across the General profile.
//
// One canonical, category-grouped list (with emoji icons) so the same interest
// data can be reused in every mode (Romance, Friends) instead of being collected
// per sub-profile. Business keeps its own "Professional interests" list.
//
// Stored value is the plain `label` string (e.g. "Travel") to stay compatible
// with existing string[] interest columns and shared-interest highlighting.

export type InterestOption = {
  /** Stored + compared value. */
  label: string;
  /** Display icon. */
  emoji: string;
};

export type InterestCategory = {
  name: string;
  emoji: string;
  items: InterestOption[];
};

/** Max interests a user can pick for the General profile. */
export const GENERAL_INTERESTS_MAX = 10;

export const INTEREST_CATEGORIES: InterestCategory[] = [
  {
    name: "Sports & Fitness",
    emoji: "🏃",
    items: [
      { label: "Running", emoji: "🏃" },
      { label: "Gym", emoji: "🏋️" },
      { label: "Yoga", emoji: "🧘" },
      { label: "Cycling", emoji: "🚴" },
      { label: "Football", emoji: "⚽" },
      { label: "Basketball", emoji: "🏀" },
      { label: "Tennis", emoji: "🎾" },
      { label: "Swimming", emoji: "🏊" },
      { label: "Hiking", emoji: "🥾" },
      { label: "Climbing", emoji: "🧗" },
      { label: "Skiing", emoji: "🎿" },
      { label: "Martial arts", emoji: "🥋" },
      { label: "Golf", emoji: "⛳" },
    ],
  },
  {
    name: "Arts & Culture",
    emoji: "🎨",
    items: [
      { label: "Painting", emoji: "🎨" },
      { label: "Photography", emoji: "📷" },
      { label: "Museums", emoji: "🖼️" },
      { label: "Theater", emoji: "🎭" },
      { label: "Reading", emoji: "📚" },
      { label: "Writing", emoji: "✍️" },
      { label: "History", emoji: "🏛️" },
      { label: "Fashion", emoji: "👗" },
      { label: "Design", emoji: "🖌️" },
    ],
  },
  {
    name: "Music & Dance",
    emoji: "🎵",
    items: [
      { label: "Live music", emoji: "🎵" },
      { label: "Concerts", emoji: "🎤" },
      { label: "Dancing", emoji: "💃" },
      { label: "Instruments", emoji: "🎸" },
      { label: "DJing", emoji: "🎧" },
      { label: "Karaoke", emoji: "🎙️" },
    ],
  },
  {
    name: "Food & Drink",
    emoji: "🍽️",
    items: [
      { label: "Cooking", emoji: "🍳" },
      { label: "Baking", emoji: "🧁" },
      { label: "Coffee", emoji: "☕" },
      { label: "Wine", emoji: "🍷" },
      { label: "Craft beer", emoji: "🍺" },
      { label: "Foodie", emoji: "🍽️" },
      { label: "BBQ", emoji: "🍖" },
    ],
  },
  {
    name: "Travel & Outdoors",
    emoji: "✈️",
    items: [
      { label: "Travel", emoji: "✈️" },
      { label: "Camping", emoji: "⛺" },
      { label: "Beach", emoji: "🏖️" },
      { label: "Road trips", emoji: "🚗" },
      { label: "Nature", emoji: "🌿" },
      { label: "Backpacking", emoji: "🎒" },
      { label: "Fishing", emoji: "🎣" },
    ],
  },
  {
    name: "Tech & Gaming",
    emoji: "🎮",
    items: [
      { label: "Gaming", emoji: "🎮" },
      { label: "Coding", emoji: "💻" },
      { label: "Gadgets", emoji: "📱" },
      { label: "AI", emoji: "🤖" },
      { label: "Crypto", emoji: "🪙" },
      { label: "Board games", emoji: "♟️" },
      { label: "Esports", emoji: "🕹️" },
    ],
  },
  {
    name: "Lifestyle & Social",
    emoji: "🌟",
    items: [
      { label: "Movies", emoji: "🎬" },
      { label: "Podcasts", emoji: "🎙️" },
      { label: "Volunteering", emoji: "🤝" },
      { label: "Pets", emoji: "🐶" },
      { label: "Meditation", emoji: "🧘" },
      { label: "Sustainability", emoji: "♻️" },
      { label: "Nightlife", emoji: "🍸" },
      { label: "Festivals", emoji: "🎉" },
      { label: "Astrology", emoji: "🔮" },
      { label: "Entrepreneurship", emoji: "🚀" },
    ],
  },
];

/** Flat list of every interest option. */
export const ALL_INTEREST_OPTIONS: InterestOption[] = INTEREST_CATEGORIES.flatMap(
  (c) => c.items
);

const EMOJI_BY_LABEL: Record<string, string> = ALL_INTEREST_OPTIONS.reduce(
  (acc, o) => {
    acc[o.label.toLowerCase()] = o.emoji;
    return acc;
  },
  {} as Record<string, string>
);

/** Look up the icon for an interest label (falls back to a generic sparkle). */
export function interestEmoji(label: string): string {
  return EMOJI_BY_LABEL[label.trim().toLowerCase()] ?? "✨";
}
