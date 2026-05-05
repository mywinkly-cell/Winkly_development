/**
 * Event categories for discovery (Winkly + external events).
 * Used for Events home strips and filtering.
 */

export const EVENT_CATEGORIES = [
  { id: "music_dancing", label: "Music & Dancing", icon: "musical-notes" },
  { id: "nightlife", label: "Nightlife", icon: "moon" },
  { id: "performing_arts", label: "Performing & Visual Arts", icon: "color-palette" },
  { id: "dating_networking", label: "Dating & Networking", icon: "people" },
  { id: "hobbies", label: "Hobbies", icon: "game-controller" },
  { id: "business", label: "Business", icon: "briefcase" },
  { id: "food_drink", label: "Food & Drink", icon: "restaurant" },
] as const;

export type EventCategoryId = (typeof EVENT_CATEGORIES)[number]["id"];

export type EventTimeRange = "day" | "week" | "month";
