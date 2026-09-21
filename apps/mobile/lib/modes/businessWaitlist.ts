// apps/mobile/lib/modes/businessWaitlist.ts
// Pure helpers for the Business "coming soon" waitlist. Persistence lives in
// lib/feedback/businessWaitlist.ts (app_feedback, screen = BUSINESS_WAITLIST_SCREEN).

export const BUSINESS_WAITLIST_SCREEN = "business_waitlist";

export const BUSINESS_WAITLIST_INTERESTS = ["experts_collaborators", "clients", "promote_venue", "something_else"] as const;

export type BusinessWaitlistInterest = (typeof BUSINESS_WAITLIST_INTERESTS)[number];

export const BUSINESS_WAITLIST_TEXT_MAX = 200;

/**
 * Serializes the waitlist answers into the app_feedback `note` column. Always non-empty (so the
 * insert passes the "rating or note" requirement) — a bare "Notify me" is still a signal.
 */
export function buildBusinessWaitlistNote(interests: readonly string[], text?: string | null): string {
  const known = new Set<string>(BUSINESS_WAITLIST_INTERESTS);
  const cleanInterests = BUSINESS_WAITLIST_INTERESTS.filter((i) => interests.includes(i) && known.has(i));
  const cleanText = (text ?? "").replace(/\s+/g, " ").trim().slice(0, BUSINESS_WAITLIST_TEXT_MAX);
  return JSON.stringify({ v: 1, interests: cleanInterests, text: cleanText || null });
}
