/**
 * Mirrors `categoriesForInterest` in `supabase/functions/ai-gateway/index.ts`
 * so the client can rank concierge categories against profile interests.
 */

export function normalizeInterestTag(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

export function categoriesForInterest(tag: string): string[] {
  const t = normalizeInterestTag(tag);
  const cats: string[] = [];
  const has = (re: RegExp) => re.test(t);
  if (has(/\b(tennis|padel|pickleball|badminton|squash|golf|running|jog|marathon|gym|lifting|strength|pilates|yoga|fitness|workout|crossfit|spin|cycling|bike|swim|boxing|martial)\b/))
    cats.push("fitness_wellness");
  if (has(/\b(hike|hiking|trail|climb|climbing|outdoor|camp|camping|kayak|paddle|surf|ski|snowboard|nature|park)\b/)) cats.push("outdoors");
  if (has(/\b(live music|concert|jazz|dj|club|vinyl|festival|karaoke|music)\b/)) cats.push("music");
  if (has(/\b(food|foodie|dinner|brunch|coffee|cafe|tea|wine|cocktail|bistro|restaurant|tasting)\b/)) cats.push("food_drink");
  if (has(/\b(museum|gallery|art|theatre|theater|cinema|film|book|reading|poetry|comedy)\b/)) cats.push("arts_culture");
  if (has(/\b(game|board game|chess|arcade|bowling|escape room|trivia)\b/)) cats.push("play");
  if (!cats.length) cats.push("other");
  return Array.from(new Set(cats));
}
