/**
 * Discover "Top 3 for you" — shared types + the reason-builder for people picks.
 *
 * The choice-reduction principle: half the app reduces choices (concierge), the
 * other half re-creates a research burden (long scroll lists). "Top 3 for you"
 * collapses a long candidate list into ≤3 ranked, reasoned picks so the full
 * scroll becomes a deliberate "see all", not the landing state.
 *
 * Ranking is NOT re-invented here. People picks reuse the EXISTING local
 * compatibility ranking (the top of each mode's already-ordered pool); this
 * module only turns the signals that ranking already computed (shared interests,
 * shared goals, distance, city) into the human "why this fits you" sentence
 * rendered by <FitReasonLine />. Events reuse the concierge's own ranking +
 * fit_reason (see lib/discover/eventTopPicks.ts).
 */

import type { DiscoverProfileItem } from "./types";

/** A single profile pick: an existing discover item plus its "why this fits you" line. */
export type DiscoverTopPick = DiscoverProfileItem & {
  /** One concrete sentence citing a real shared signal. Rendered as the card subtitle. */
  fitReason: string;
};

/** How many picks "Top 3 for you" shows. Kept central so every surface agrees. */
export const TOP_PICKS_LIMIT = 3;

/** People-specific fallback (no concrete signal available). References personal dimensions, not "great person!". */
export const PROFILE_FIT_FALLBACK = "Picked to match your interests and where you are.";

type ProfileFitReasonInput = {
  /** Interests this person shares with the viewer (already intersected upstream). */
  sharedInterests?: string[];
  /** Goals this person shares with the viewer (relationship/meetup goals). */
  sharedGoals?: string[];
  /** Distance in km when known (romance geo feed). */
  distanceKm?: number | null;
  /** True when this person is in the viewer's city. */
  sameCity?: boolean;
  mode: "romance" | "friends" | "business";
};

function goalsClause(goal: string, mode: ProfileFitReasonInput["mode"]): string {
  const g = goal.trim();
  if (!g) return PROFILE_FIT_FALLBACK;
  if (mode === "romance") return `You're both looking for ${g}.`;
  if (mode === "business") return `You share a goal — ${g}.`;
  return `You're both up for ${g}.`;
}

/**
 * Build the "why this fits you" line for a people pick, in priority order:
 * shared interests → shared goals → distance/city → graceful fallback.
 * Always returns a non-empty, concrete-leaning sentence.
 */
export function buildProfileFitReason(input: ProfileFitReasonInput): string {
  const interests = (input.sharedInterests ?? []).map((s) => s.trim()).filter(Boolean);
  if (interests.length >= 2) return `You both like ${interests[0]} and ${interests[1]}.`;
  if (interests.length === 1) return `You both like ${interests[0]}.`;

  const goals = (input.sharedGoals ?? []).map((s) => s.trim()).filter(Boolean);
  if (goals.length) return goalsClause(goals[0], input.mode);

  const km = input.distanceKm;
  if (typeof km === "number" && Number.isFinite(km) && km >= 0 && km < 50) {
    const label = km < 1 ? "under 1 km" : `${Math.round(km)} km`;
    return `Just ${label} away from you.`;
  }

  if (input.sameCity) return "Right in your city.";
  return PROFILE_FIT_FALLBACK;
}
