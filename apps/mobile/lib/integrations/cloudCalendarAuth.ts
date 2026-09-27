// apps/mobile/lib/integrations/cloudCalendarAuth.ts
// Real Google Calendar / Outlook (Microsoft Graph) cloud sync — connect/disconnect flow.
// A separate OAuth app from sign-in (lib/auth/oauth.ts): this one requests calendar-write
// access and a long-lived refresh token, exchanged and stored server-side (calendar_connections),
// never on the device. Mirrors the same open-a-real-browser-session pattern as Google sign-in
// (WebBrowser.openAuthSessionAsync), but talks to our own calendar-oauth-* Edge Functions
// instead of Supabase Auth.

import * as WebBrowser from "expo-web-browser";
import { supabase } from "@/lib/supabase";

export type CloudCalendarProvider = "google" | "microsoft";

export type CloudCalendarConnectResult =
  | { ok: true }
  | { ok: false; reason: "cancelled" | "not_configured" | "failed"; message?: string };

/** Distinct from the sign-in redirect (winkly://callback) so an OS-level route never confuses the two flows. */
const CALENDAR_CALLBACK_REDIRECT = "winkly://calendar-callback";

async function callEdgeFunction(pathWithQuery: string, init: RequestInit): Promise<Response | null> {
  const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
  if (!SUPABASE_URL) return null;
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) return null;

  try {
    return await fetch(`${SUPABASE_URL.replace(/\/$/, "")}/functions/v1/${pathWithQuery}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
        ...(init.headers ?? {}),
      },
    });
  } catch {
    return null;
  }
}

/** Opens the provider's real consent screen and waits for the user to finish (or cancel/fail). */
export async function connectCloudCalendar(provider: CloudCalendarProvider): Promise<CloudCalendarConnectResult> {
  const res = await callEdgeFunction(`calendar-oauth-start?provider=${provider}`, { method: "GET" });
  if (!res || !res.ok) return { ok: false, reason: "failed", message: "Could not start the connection." };

  const data = await res.json().catch(() => null) as { url?: string; status?: string; message?: string } | null;
  if (data?.status === "not_configured") {
    return { ok: false, reason: "not_configured", message: data.message };
  }
  if (!data?.url) return { ok: false, reason: "failed", message: "No authorize URL returned." };

  const result = await WebBrowser.openAuthSessionAsync(data.url, CALENDAR_CALLBACK_REDIRECT, {
    showInRecents: true,
  });

  if (result.type === "cancel" || result.type === "dismiss") {
    return { ok: false, reason: "cancelled" };
  }
  if (result.type !== "success") {
    return { ok: false, reason: "failed", message: "Connection did not complete." };
  }

  // calendar-oauth-callback parked the (encrypted) tokens server-side and handed back a
  // one-time code; nothing is connected until this same signed-in user redeems it. That
  // binding is what stops someone else's consent link from attaching a calendar to their
  // account (SEC-10). The provider tokens themselves never reach the device.
  const params = parseCallbackParams(result.url);
  if (params.get("status") !== "success") {
    return { ok: false, reason: "failed", message: "Connection did not complete." };
  }
  const code = params.get("code");
  if (!code) return { ok: false, reason: "failed", message: "Connection did not complete." };

  const done = await callEdgeFunction("calendar-oauth-start?action=complete", {
    method: "POST",
    body: JSON.stringify({ code }),
  });
  if (!done?.ok) return { ok: false, reason: "failed", message: "Could not finish connecting your calendar." };
  return { ok: true };
}

/** Query params of the winkly://calendar-callback?… redirect (URL() is unreliable for custom schemes on RN). */
export function parseCallbackParams(callbackUrl: string): URLSearchParams {
  const q = callbackUrl.indexOf("?");
  if (q === -1) return new URLSearchParams();
  const hash = callbackUrl.indexOf("#", q);
  return new URLSearchParams(callbackUrl.slice(q + 1, hash === -1 ? undefined : hash));
}

/** Best-effort revoke at the provider + always removes the stored connection. */
export async function disconnectCloudCalendar(provider: CloudCalendarProvider): Promise<boolean> {
  const res = await callEdgeFunction("calendar-oauth-disconnect", {
    method: "POST",
    body: JSON.stringify({ provider }),
  });
  return !!res?.ok;
}

export type CloudCalendarConnectionStatus = {
  google: boolean;
  microsoft: boolean;
};

/** Which cloud providers the current user has connected, read directly from calendar_connections. */
export async function getCloudCalendarConnections(): Promise<CloudCalendarConnectionStatus> {
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) return { google: false, microsoft: false };

  const { data } = await supabase
    .from("calendar_connections")
    .select("provider")
    .eq("user_id", uid)
    .in("provider", ["google", "microsoft"]);

  const providers = new Set(((data ?? []) as { provider: string }[]).map((r) => r.provider));
  return { google: providers.has("google"), microsoft: providers.has("microsoft") };
}
