/**
 * Discover — daily recommendation and like limits (Free tier).
 * 4 new profiles per curated category per day; Free = 1 like per day from Recommended section.
 * Liked-you / Recommended: first 3 cards visible to Free; rest blurred until Super/Premium.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";

const PREFIX = "winkly_discover_";

function todayKey(mode: "romance" | "friends"): string {
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  return `${PREFIX}${mode}_date_${today}`;
}

function likesKey(mode: "romance" | "friends"): string {
  const today = new Date().toISOString().slice(0, 10);
  return `${PREFIX}${mode}_rec_likes_${today}`;
}

const CATEGORY_PER_DAY = 4;
const FREE_VISIBLE_BEFORE_BLUR = 3;
const FREE_LIKES_PER_DAY_RECOMMENDATIONS = 1;

/** Number of recommendation slots consumed today (shown cards). Reset at midnight. */
export async function getRecommendationsConsumedToday(
  mode: "romance" | "friends"
): Promise<number> {
  const key = todayKey(mode);
  const raw = await AsyncStorage.getItem(key);
  if (!raw) return 0;
  const data = JSON.parse(raw) as { count?: number };
  return Math.min(CATEGORY_PER_DAY, data?.count ?? 0);
}

/** Record that we showed one more recommendation today (max 4). */
export async function incrementRecommendationsShownToday(
  mode: "romance" | "friends"
): Promise<number> {
  const key = todayKey(mode);
  const raw = await AsyncStorage.getItem(key);
  const data = raw ? (JSON.parse(raw) as { count?: number }) : {};
  const count = Math.min(CATEGORY_PER_DAY, (data.count ?? 0) + 1);
  await AsyncStorage.setItem(key, JSON.stringify({ count, date: new Date().toISOString().slice(0, 10) }));
  return count;
}

/** Number of likes sent today from Recommended section (Free tier limit = 1). */
export async function getRecommendationLikesSentToday(
  mode: "romance" | "friends"
): Promise<number> {
  const key = likesKey(mode);
  const raw = await AsyncStorage.getItem(key);
  if (!raw) return 0;
  const data = JSON.parse(raw) as { count?: number };
  return data?.count ?? 0;
}

/** Record a like sent from Recommended section. Returns new count. */
export async function incrementRecommendationLikeSentToday(
  mode: "romance" | "friends"
): Promise<number> {
  const key = likesKey(mode);
  const raw = await AsyncStorage.getItem(key);
  const data = raw ? (JSON.parse(raw) as { count?: number }) : {};
  const count = (data.count ?? 0) + 1;
  await AsyncStorage.setItem(key, JSON.stringify({ count, date: new Date().toISOString().slice(0, 10) }));
  return count;
}

export const DISCOVER_LIMITS = {
  categoryPerDay: CATEGORY_PER_DAY,
  /** @deprecated use categoryPerDay */
  recommendationsPerDay: CATEGORY_PER_DAY,
  freeVisibleBeforeBlur: FREE_VISIBLE_BEFORE_BLUR,
  freeLikesPerDayFromRecommendations: FREE_LIKES_PER_DAY_RECOMMENDATIONS,
} as const;
