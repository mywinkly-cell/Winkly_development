export type RomanceIcebreakerSelf = {
  interests?: string[];
  city?: string | undefined;
};

export type RomanceIcebreakerTarget = {
  name: string;
  chipItems: string[];
  city: string;
};

function normalizeTag(s: string): string {
  return s.trim().toLowerCase();
}

/** Deterministic super-like opener from overlapping profile signals (no network). */
export function buildRomanceSuperLikeIcebreaker(
  self: RomanceIcebreakerSelf | null,
  target: RomanceIcebreakerTarget | null,
): string {
  if (!target?.name?.trim()) {
    return "I'd love to connect — your profile stood out.";
  }
  const first = target.name.trim().split(/\s+/)[0] ?? target.name;
  const selfInts = (self?.interests ?? []).map(normalizeTag).filter(Boolean);
  const otherRaw = target.chipItems ?? [];
  const overlap = otherRaw.find((tag) => selfInts.includes(normalizeTag(tag)));
  if (overlap) {
    return `${first}, ${overlap} jumped out — I'm into that too. Would love to compare notes.`;
  }
  const selfCity = self?.city?.trim();
  const theirCity = target.city?.trim();
  if (selfCity && theirCity && normalizeTag(selfCity) === normalizeTag(theirCity)) {
    return `${first}, always fun to spot someone else who gets ${theirCity}. Open to coffee or a walk sometime?`;
  }
  if (otherRaw.length > 0) {
    const topic = otherRaw[0];
    return `${first}, curious what drew you to ${topic} — I'd love to hear your take.`;
  }
  return `${first}, your vibe clicked — mind if I say hi properly in chat?`;
}

/** AI-generated Super Like opener via Concierge; null on error or timeout (~4s). */
export async function buildRomanceSuperLikeIcebreakerAI(
  self: RomanceIcebreakerSelf | null,
  target: RomanceIcebreakerTarget | null,
  partnerUserId: string,
): Promise<string | null> {
  const { fetchSuperLikeIcebreakerAI } = await import("@/lib/ai/superLikeIcebreakerClient");
  return fetchSuperLikeIcebreakerAI({ partnerUserId, self, target });
}
