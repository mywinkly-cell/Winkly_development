// ────────────────────────────────────────────────
// Winkly Friends AI Helpers (Client-side heuristics)
// Same pattern as Romance; uses Friends sub-profile fields
// ────────────────────────────────────────────────

export type FriendsProfile = {
  id?: string;
  display_name?: string;
  first_name?: string;
  city?: string;
  interests?: string[];
  vibe_tags?: string[];
  about?: string;
  meetup_style?: string[];
  compatibility?: number;
};

/**
 * Compute a compatibility score between self & other using
 * overlapping Friends sub-profile fields.
 */
export function computeFriendsCompatibility(params: {
  self?: FriendsProfile | null;
  other: FriendsProfile;
}): number {
  const { self, other } = params;

  if (typeof other.compatibility === "number") {
    return Math.min(99, Math.max(40, Math.round(other.compatibility)));
  }

  if (!self) return 78;

  let score = 70;

  const selfInterests = [...(self.interests ?? []), ...(self.vibe_tags ?? [])];
  const otherInterests = [...(other.interests ?? []), ...(other.vibe_tags ?? [])];
  const shared = intersect(selfInterests, otherInterests);
  score += Math.min(shared.length * 5, 15);

  if (
    self.city &&
    other.city &&
    self.city.toLowerCase().split(",")[0].trim() ===
      other.city.toLowerCase().split(",")[0].trim()
  ) {
    score += 7;
  }

  return Math.min(96, Math.max(55, Math.round(score)));
}

/**
 * Short match tags for Friends cards.
 */
export function buildFriendsMatchTags(params: {
  self?: FriendsProfile | null;
  other: FriendsProfile;
}): string[] {
  const { self, other } = params;
  const tags: string[] = [];

  const selfInterests = [...(self?.interests ?? []), ...(self?.vibe_tags ?? [])];
  const otherInterests = [...(other.interests ?? []), ...(other.vibe_tags ?? [])];
  const shared = intersect(selfInterests, otherInterests);
  if (shared.length > 0) {
    tags.push(`Shared: ${shared.slice(0, 2).join(", ")}`);
  }

  if (
    self?.city &&
    other.city &&
    self.city.toLowerCase().split(",")[0].trim() ===
      other.city.toLowerCase().split(",")[0].trim()
  ) {
    tags.push("Same city");
  }

  if (other.vibe_tags?.length) {
    tags.push(other.vibe_tags.slice(0, 2).join(" · "));
  }

  if (!tags.length) {
    tags.push("Good potential vibe match");
  }

  return tags;
}

function intersect(a: string[], b: string[]): string[] {
  if (!a?.length || !b?.length) return [];
  const setB = new Set(b.map((x) => x.toLowerCase()));
  return a.filter((x) => setB.has(x.toLowerCase()));
}
