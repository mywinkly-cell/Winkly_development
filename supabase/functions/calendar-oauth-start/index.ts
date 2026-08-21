/**
 * calendar-oauth-start — mint the Google/Microsoft consent URL for the current user.
 *
 * The mobile app calls this (authenticated, like every other function) to get a real
 * provider authorize URL, then opens that URL itself via WebBrowser.openAuthSessionAsync —
 * mirroring how apps/mobile/lib/auth/oauth.ts already does Google sign-in
 * (supabase.auth.signInWithOAuth({ skipBrowserRedirect: true }) → open the returned url).
 * This function never redirects itself; it only returns { url }.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, withCorsEmpty } from "../_shared/cors.ts";
import { mintCalendarOAuthState, type CalendarOAuthProvider } from "../_shared/calendarOAuthState.ts";
import { getGoogleAuthorizeUrl, isGoogleCalendarConfigured } from "../_shared/googleCalendar.ts";
import { getMicrosoftAuthorizeUrl, isMicrosoftGraphConfigured } from "../_shared/microsoftGraph.ts";

function isProvider(v: unknown): v is CalendarOAuthProvider {
  return v === "google" || v === "microsoft";
}

function callbackRedirectUri(): string {
  const base = (Deno.env.get("SUPABASE_URL") ?? "").replace(/\/$/, "");
  return `${base}/functions/v1/calendar-oauth-callback`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return withCorsEmpty(req, { status: 204 });
  }

  try {
    const cors = corsHeaders(req);
    const jsonHeaders = { "Content-Type": "application/json", ...Object.fromEntries(cors) };

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: jsonHeaders });
    }

    const token = authHeader.replace("Bearer ", "");
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Invalid session" }), { status: 401, headers: jsonHeaders });
    }

    const url = new URL(req.url);
    const provider = url.searchParams.get("provider");
    if (!isProvider(provider)) {
      return new Response(JSON.stringify({ error: "provider must be 'google' or 'microsoft'" }), {
        status: 400,
        headers: jsonHeaders,
      });
    }

    const providerConfigured = provider === "google" ? isGoogleCalendarConfigured() : isMicrosoftGraphConfigured();
    if (!providerConfigured) {
      return new Response(
        JSON.stringify({ status: "not_configured", message: `${provider} calendar sync is not configured yet.` }),
        { headers: jsonHeaders },
      );
    }

    const state = await mintCalendarOAuthState(user.id, provider);
    if (!state) {
      return new Response(JSON.stringify({ error: "Server not configured for calendar OAuth (missing state secret)" }), {
        status: 500,
        headers: jsonHeaders,
      });
    }

    const redirectUri = callbackRedirectUri();
    const authorizeUrl = provider === "google"
      ? getGoogleAuthorizeUrl(state, redirectUri)
      : getMicrosoftAuthorizeUrl(state, redirectUri);

    if (!authorizeUrl) {
      return new Response(JSON.stringify({ error: "Failed to build authorize URL" }), { status: 500, headers: jsonHeaders });
    }

    return new Response(JSON.stringify({ url: authorizeUrl }), { headers: jsonHeaders });
  } catch (e) {
    console.error("calendar-oauth-start:", e);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...Object.fromEntries(corsHeaders(req)) },
    });
  }
});
