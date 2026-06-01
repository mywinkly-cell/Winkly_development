// apps/mobile/constants/config.ts
// Backwards-compatible named exports derived from the validated env module.
// Prefer importing useEnv()/getPublicEnv() from "@/lib/env" in new code.

import { getPublicEnv } from "@/lib/env";

const env = getPublicEnv();

// Auth redirect URL for email verification links.
// When set, Supabase redirects to this HTTPS page first; the page then forwards to winkly://callback.
export const AUTH_REDIRECT_URL = env.authRedirectUrl;

// PostHog analytics (optional). When key is not set, analytics are disabled.
export const POSTHOG_API_KEY = env.posthogApiKey;
export const POSTHOG_HOST = env.posthogHost;
