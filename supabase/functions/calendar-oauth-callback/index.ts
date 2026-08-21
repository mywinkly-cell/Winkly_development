/**
 * calendar-oauth-callback — hit directly by Google/Microsoft's OAuth redirect (a browser
 * navigation inside the app's WebBrowser.openAuthSessionAsync session, not an authenticated
 * app fetch — no Bearer JWT). verify_jwt = false in config.toml.
 *
 * Verifies the signed `state` (minted by calendar-oauth-start), exchanges the code for
 * tokens server-to-server, encrypts them, upserts calendar_connections, then serves an HTML
 * page that redirects to winkly://calendar-callback — WebBrowser.openAuthSessionAsync
 * resolves as soon as that scheme is hit, same mechanism the existing Google/Apple sign-in
 * flow relies on (apps/mobile/lib/auth/oauth.ts).
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyCalendarOAuthState, type CalendarOAuthProvider } from "../_shared/calendarOAuthState.ts";
import { encryptCalendarTokens } from "../_shared/calendarTokenCrypto.ts";
import { exchangeGoogleCode } from "../_shared/googleCalendar.ts";
import { exchangeMicrosoftCode } from "../_shared/microsoftGraph.ts";
import { syncConfirmedEventToCloud } from "../_shared/calendarSync.ts";

const SECURITY_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Content-Security-Policy":
    "default-src 'none'; base-uri 'none'; form-action 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'",
  "Cache-Control": "no-store, no-cache",
};

function callbackRedirectUri(): string {
  const base = (Deno.env.get("SUPABASE_URL") ?? "").replace(/\/$/, "");
  return `${base}/functions/v1/calendar-oauth-callback`;
}

function buildResultHtml(ok: boolean, provider: CalendarOAuthProvider | null, message: string): string {
  const deepLink = `winkly://calendar-callback?status=${ok ? "success" : "error"}${provider ? `&provider=${provider}` : ""}`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${ok ? "Calendar connected" : "Connection failed"}</title>
  <style>
    body{font-family:-apple-system,sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#F9F7FB;color:#1C1C1E;padding:24px;box-sizing:border-box;text-align:center}
    .spinner{width:48px;height:48px;border:4px solid #E5E5EA;border-top-color:#5A189A;border-radius:50%;animation:spin 0.8s linear infinite;margin-bottom:16px}
    @keyframes spin{to{transform:rotate(360deg)}}
    p{margin:8px 0;color:#555}
    a{color:#5A189A;font-weight:600}
  </style>
</head>
<body>
  <div class="spinner"></div>
  <p>${ok ? "Calendar connected — returning to Winkly..." : `Could not connect: ${message}`}</p>
  <p><a href="${deepLink}">Tap here if Winkly doesn't open automatically</a></p>
  <script>window.location.href = ${JSON.stringify(deepLink)};</script>
</body>
</html>`;
}

Deno.serve(async (req) => {
  const url = new URL(req.url);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: SECURITY_HEADERS });
  }
  if (req.method !== "GET") {
    return new Response("Method Not Allowed", { status: 405, headers: SECURITY_HEADERS });
  }

  const htmlHeaders = { ...SECURITY_HEADERS, "Content-Type": "text/html; charset=UTF-8" };

  const oauthError = url.searchParams.get("error");
  const state = url.searchParams.get("state");
  const code = url.searchParams.get("code");

  const verified = await verifyCalendarOAuthState(state);
  if (!verified) {
    return new Response(buildResultHtml(false, null, "This connection link is invalid or expired."), {
      status: 403,
      headers: htmlHeaders,
    });
  }

  if (oauthError || !code) {
    return new Response(
      buildResultHtml(false, verified.provider, oauthError ? "you didn't finish granting access." : "no authorization code was returned."),
      { status: 200, headers: htmlHeaders },
    );
  }

  try {
    const redirectUri = callbackRedirectUri();
    const tokenResult = verified.provider === "google"
      ? await exchangeGoogleCode(code, redirectUri)
      : await exchangeMicrosoftCode(code, redirectUri);

    if (!tokenResult || !tokenResult.refresh_token) {
      return new Response(
        buildResultHtml(false, verified.provider, "the token exchange failed. Please try connecting again."),
        { status: 200, headers: htmlHeaders },
      );
    }

    const encrypted = await encryptCalendarTokens({
      access_token: tokenResult.access_token,
      refresh_token: tokenResult.refresh_token,
    });
    if (!encrypted) {
      console.error("calendar-oauth-callback: CALENDAR_TOKEN_ENCRYPTION_KEY not configured");
      return new Response(buildResultHtml(false, verified.provider, "server is not configured to store calendar access yet."), {
        status: 200,
        headers: htmlHeaders,
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const expiresAt = new Date(Date.now() + tokenResult.expires_in * 1000).toISOString();
    const { error: upsertErr } = await supabase.from("calendar_connections").upsert(
      {
        user_id: verified.uid,
        provider: verified.provider,
        token_encrypted: encrypted,
        token_expires_at: expiresAt,
        scopes: verified.provider === "google" ? "calendar.events" : "Calendars.ReadWrite offline_access",
        last_sync_at: null,
      },
      { onConflict: "user_id,provider" },
    );

    if (upsertErr) {
      console.error("calendar-oauth-callback upsert:", upsertErr);
      return new Response(buildResultHtml(false, verified.provider, "could not save the connection. Please try again."), {
        status: 200,
        headers: htmlHeaders,
      });
    }

    // Backfill: sync this user's already-confirmed upcoming plans to the calendar they just
    // connected, so connecting later doesn't mean missing everything already on the Planner
    // (mirrors the device-calendar backfill-on-toggle in apps/mobile/lib/integrations/calendarSync.ts).
    try {
      const { data: parts } = await supabase
        .from("planner_participants")
        .select("planner_item_id")
        .eq("user_id", verified.uid)
        .in("role", ["owner", "attendee"]);
      const plannerItemIds = Array.from(new Set((parts ?? []).map((p: { planner_item_id: string }) => p.planner_item_id)));

      if (plannerItemIds.length > 0) {
        const { data: events } = await supabase
          .from("confirmed_events")
          .select("id")
          .in("planner_item_id", plannerItemIds)
          .gte("starts_at", new Date().toISOString())
          .limit(20);
        for (const ev of events ?? []) {
          await syncConfirmedEventToCloud(supabase, (ev as { id: string }).id);
        }
      }
    } catch (backfillErr) {
      console.warn("calendar-oauth-callback backfill:", backfillErr);
    }

    return new Response(buildResultHtml(true, verified.provider, ""), { status: 200, headers: htmlHeaders });
  } catch (e) {
    console.error("calendar-oauth-callback:", e);
    return new Response(buildResultHtml(false, verified.provider, "something went wrong. Please try again."), {
      status: 200,
      headers: htmlHeaders,
    });
  }
});
