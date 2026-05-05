// ────────────────────────────────────────────────
// Winkly Romance AI Helpers (Client-side heuristics)
// v1.0 – Safe, deterministic, no hallucinations
// All logic is based ONLY on user-provided fields.
// ────────────────────────────────────────────────

export type RomanceProfile = {
  id?: string;
  first_name?: string;
  age?: number;
  city?: string;
  interests?: string[];
  languages?: string[];
  bio_romance?: string;
  occupation?: string;
  compatibility?: number;
};

/**
 * Compute a compatibility score between self & other using
 * only overlapping structured fields. Pure heuristic.
 */
export function computeCompatibilityScore(params: {
  self?: RomanceProfile | null;
  other: RomanceProfile;
}): number {
  const { self, other } = params;

  // If backend already provided a score, use it.
  if (typeof other.compatibility === "number") {
    return clamp(Math.round(other.compatibility), 40, 99);
  }

  // No self profile? Use a neutral default.
  if (!self) return 78;

  let score = 70;

  // Shared interests
  const sharedInterests = intersect(self.interests, other.interests);
  score += Math.min(sharedInterests.length * 5, 15);

  // Shared languages
  const sharedLanguages = intersect(self.languages, other.languages);
  score += Math.min(sharedLanguages.length * 3, 9);

  // Same city
  if (
    self.city &&
    other.city &&
    self.city.toLowerCase().split(",")[0].trim() ===
      other.city.toLowerCase().split(",")[0].trim()
  ) {
    score += 7;
  }

  // Close age range
  if (self.age && other.age) {
    const diff = Math.abs(self.age - other.age);
    if (diff <= 2) score += 5;
    else if (diff <= 6) score += 3;
  }

  return clamp(Math.round(score), 55, 96);
}

/**
 * Short match tags for cards (max 1–2 pills usually).
 */
export function buildMatchTags(params: {
  self?: RomanceProfile | null;
  other: RomanceProfile;
}): string[] {
  const { self, other } = params;
  const tags: string[] = [];

  const sharedInterests = intersect(self?.interests, other.interests);
  if (sharedInterests.length > 0) {
    const sample = sharedInterests.slice(0, 2).join(", ");
    tags.push(`Shared: ${sample}`);
  }

  const sharedLanguages = intersect(self?.languages, other.languages);
  if (sharedLanguages.length > 0) {
    const sample = sharedLanguages.slice(0, 2).join(" & ");
    tags.push(`You both speak ${sample}`);
  }

  if (
    self?.city &&
    other.city &&
    self.city.toLowerCase().split(",")[0].trim() ===
      other.city.toLowerCase().split(",")[0].trim()
  ) {
    tags.push("Same city");
  }

  if (!tags.length) {
    tags.push("Good potential vibe match");
  }

  return tags;
}

/**
 * Very short conversation starter suggestion for matches/chats.
 */
export function buildConversationStarter(params: {
  self?: RomanceProfile | null;
  other: RomanceProfile;
}): string {
  const { other } = params;

  if (other.interests?.length) {
    const topic = other.interests[0];
    return `Ask about their interest in ${topic}.`;
  }

  if (other.city) {
    const cityName = other.city.split(",")[0].trim();
    return `Ask what they enjoy most in ${cityName}.`;
  }

  if (other.occupation) {
    return `Ask what they enjoy most about their work.`;
  }

  return "Ask what they’re excited about right now.";
}

/**
 * Insight text for Profile View – uses only visible profile fields.
 */
export function buildProfileInsight(profile: RomanceProfile): string {
  const parts: string[] = [];

  if (profile.interests?.length) {
    parts.push(
      `They seem to enjoy ${profile.interests
        .slice(0, 3)
        .join(", ")} — easy topics to connect over.`
    );
  }

  if (profile.bio_romance?.length) {
    const words = profile.bio_romance.split(/\s+/).length;
    if (words < 15) {
      parts.push(
        "Their bio is short and direct — likely someone who prefers real conversations over long texts."
      );
    } else if (words > 40) {
      parts.push(
        "Their detailed bio suggests they value clarity, self-awareness, and intentional connection."
      );
    }
  }

  if (profile.languages?.length && profile.languages.length >= 2) {
    parts.push(
      "Being multilingual often hints at openness to different cultures and experiences."
    );
  }

  if (profile.occupation) {
    parts.push(
      `Their work in ${profile.occupation} may influence their lifestyle, routine, and long-term goals.`
    );
  }

  if (!parts.length) {
    parts.push(
      "Take your time to read their profile and sense if your values and lifestyles align."
    );
  }

  return parts.join(" ");
}

// ────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────

function intersect(a?: string[] | null, b?: string[] | null): string[] {
  if (!a || !b) return [];
  const setB = new Set(b.map((x) => x.toLowerCase()));
  return a.filter((x) => setB.has(x.toLowerCase()));
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}
