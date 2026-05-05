// Auth redirect URL for email verification links.
// When set, Supabase redirects to this HTTPS page first; the page then forwards to winkly://callback.
// Fixes white page when links open in Gmail/in-app browser.
// Deploy auth-redirect/ to Vercel and add that URL to Supabase Redirect URLs.
export const AUTH_REDIRECT_URL =
  process.env.EXPO_PUBLIC_AUTH_REDIRECT_URL || "winkly://callback";

// PostHog analytics (optional). When key is not set, analytics are disabled.
export const POSTHOG_API_KEY = process.env.EXPO_PUBLIC_POSTHOG_API_KEY ?? "";
export const POSTHOG_HOST =
  process.env.EXPO_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com";
