// Analytics consent — GDPR / ePrivacy gate before PostHog or any product analytics.
// Tied to cookie consent on terms-cookies (covers analytics cookies per Privacy Policy).

import { getTermsAndCookiesAccepted } from "@/lib/legalFlags";

/** True when the user has accepted cookies (and thus analytics, where applicable). */
export async function getAnalyticsConsent(): Promise<boolean> {
  return getTermsAndCookiesAccepted();
}
