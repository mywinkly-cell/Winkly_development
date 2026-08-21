/**
 * Google Calendar API client (OAuth authorize/token exchange + event/freeBusy calls).
 * Server-side only — GOOGLE_CLIENT_SECRET must never reach the mobile app.
 * Scope is deliberately narrow (`calendar.events`, not full `calendar`): create/edit/delete
 * events only, no ability to read/change the user's calendar list or settings.
 */

const AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const CALENDAR_API = "https://www.googleapis.com/calendar/v3";
const SCOPE = "https://www.googleapis.com/auth/calendar.events";

function clientId(): string | null {
  return Deno.env.get("GOOGLE_CLIENT_ID")?.trim() || null;
}
function clientSecret(): string | null {
  return Deno.env.get("GOOGLE_CLIENT_SECRET")?.trim() || null;
}

export function isGoogleCalendarConfigured(): boolean {
  return !!clientId() && !!clientSecret();
}

export function getGoogleAuthorizeUrl(state: string, redirectUri: string): string | null {
  const id = clientId();
  if (!id) return null;
  const params = new URLSearchParams({
    client_id: id,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: SCOPE,
    access_type: "offline",
    prompt: "consent", // force a refresh_token on every connect, not just the first ever consent.
    state,
  });
  return `${AUTHORIZE_URL}?${params.toString()}`;
}

export type GoogleTokenResult = { access_token: string; refresh_token?: string; expires_in: number };

export async function exchangeGoogleCode(code: string, redirectUri: string): Promise<GoogleTokenResult | null> {
  const id = clientId();
  const secret = clientSecret();
  if (!id || !secret) return null;

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: id,
      client_secret: secret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) return null;
  const data = await res.json().catch(() => null);
  if (!data?.access_token || typeof data.expires_in !== "number") return null;
  return { access_token: data.access_token, refresh_token: data.refresh_token, expires_in: data.expires_in };
}

export async function refreshGoogleAccessToken(refreshToken: string): Promise<{ access_token: string; expires_in: number } | null> {
  const id = clientId();
  const secret = clientSecret();
  if (!id || !secret) return null;

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: id,
      client_secret: secret,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) return null;
  const data = await res.json().catch(() => null);
  if (!data?.access_token || typeof data.expires_in !== "number") return null;
  return { access_token: data.access_token, expires_in: data.expires_in };
}

export async function revokeGoogleToken(token: string): Promise<void> {
  try {
    await fetch(REVOKE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token }),
    });
  } catch {
    // Best-effort — disconnect must still remove the local row even if Google's revoke call fails.
  }
}

export type CreateGoogleEventInput = {
  title: string;
  description?: string | null;
  location?: string | null;
  startIso: string;
  endIso: string;
};

export type CreateGoogleEventResult = { externalEventId: string; calendarId: string };

export async function createGoogleCalendarEvent(
  accessToken: string,
  input: CreateGoogleEventInput,
): Promise<CreateGoogleEventResult | null> {
  const res = await fetch(`${CALENDAR_API}/calendars/primary/events`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      summary: input.title,
      description: input.description ?? undefined,
      location: input.location ?? undefined,
      start: { dateTime: input.startIso },
      end: { dateTime: input.endIso },
    }),
  });
  if (!res.ok) return null;
  const data = await res.json().catch(() => null);
  if (!data?.id) return null;
  return { externalEventId: data.id, calendarId: "primary" };
}

export type GoogleFreeBusyBlock = { start: string; end: string };

export async function getGoogleFreeBusy(
  accessToken: string,
  timeMinIso: string,
  timeMaxIso: string,
): Promise<GoogleFreeBusyBlock[] | null> {
  const res = await fetch(`${CALENDAR_API}/freeBusy`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      timeMin: timeMinIso,
      timeMax: timeMaxIso,
      items: [{ id: "primary" }],
    }),
  });
  if (!res.ok) return null;
  const data = await res.json().catch(() => null);
  const busy = data?.calendars?.primary?.busy;
  if (!Array.isArray(busy)) return null;
  return busy
    .filter((b: unknown) => b && typeof (b as { start?: unknown }).start === "string" && typeof (b as { end?: unknown }).end === "string")
    .map((b: { start: string; end: string }) => ({ start: b.start, end: b.end }));
}
