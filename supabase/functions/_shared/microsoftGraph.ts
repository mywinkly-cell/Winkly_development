/**
 * Microsoft Graph API client (OAuth authorize/token exchange + event/freebusy calls).
 * Server-side only — MS_GRAPH_CLIENT_SECRET must never reach the mobile app.
 * Tenant "common" supports both work/school accounts and personal Outlook.com/Hotmail
 * accounts in one app registration.
 */

const AUTHORIZE_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/authorize";
const TOKEN_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/token";
const GRAPH_API = "https://graph.microsoft.com/v1.0";
const SCOPE = "offline_access Calendars.ReadWrite";

function clientId(): string | null {
  return Deno.env.get("MS_GRAPH_CLIENT_ID")?.trim() || null;
}
function clientSecret(): string | null {
  return Deno.env.get("MS_GRAPH_CLIENT_SECRET")?.trim() || null;
}

export function isMicrosoftGraphConfigured(): boolean {
  return !!clientId() && !!clientSecret();
}

export function getMicrosoftAuthorizeUrl(state: string, redirectUri: string): string | null {
  const id = clientId();
  if (!id) return null;
  const params = new URLSearchParams({
    client_id: id,
    redirect_uri: redirectUri,
    response_type: "code",
    response_mode: "query",
    scope: SCOPE,
    prompt: "consent", // force a fresh refresh_token every connect, matching the Google flow.
    state,
  });
  return `${AUTHORIZE_URL}?${params.toString()}`;
}

export type MicrosoftTokenResult = { access_token: string; refresh_token?: string; expires_in: number };

export async function exchangeMicrosoftCode(code: string, redirectUri: string): Promise<MicrosoftTokenResult | null> {
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
      scope: SCOPE,
    }),
  });
  if (!res.ok) return null;
  const data = await res.json().catch(() => null);
  if (!data?.access_token || typeof data.expires_in !== "number") return null;
  return { access_token: data.access_token, refresh_token: data.refresh_token, expires_in: data.expires_in };
}

export async function refreshMicrosoftAccessToken(refreshToken: string): Promise<{ access_token: string; expires_in: number } | null> {
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
      scope: SCOPE,
    }),
  });
  if (!res.ok) return null;
  const data = await res.json().catch(() => null);
  if (!data?.access_token || typeof data.expires_in !== "number") return null;
  return { access_token: data.access_token, expires_in: data.expires_in };
}

/**
 * Microsoft has no simple self-service "revoke this refresh token" Graph endpoint for
 * consumer apps (unlike Google's /revoke). Disconnect drops our stored copy; the user's
 * own standing consent grant can still be revoked by them directly at
 * https://account.live.com/consent/Manage or https://myapps.microsoft.com if they want that too.
 */
export function microsoftRevokeInstructionsUrl(): string {
  return "https://account.live.com/consent/Manage";
}

/** Strips the trailing 'Z'/offset from an ISO string — Graph wants a naive datetime + separate timeZone. */
function toGraphDateTime(iso: string): string {
  return iso.replace(/(\.\d+)?(Z|[+-]\d{2}:\d{2})$/, "");
}

export type CreateMicrosoftEventInput = {
  title: string;
  description?: string | null;
  location?: string | null;
  startIso: string;
  endIso: string;
};

export type CreateMicrosoftEventResult = { externalEventId: string; calendarId: string };

export async function createMicrosoftCalendarEvent(
  accessToken: string,
  input: CreateMicrosoftEventInput,
): Promise<CreateMicrosoftEventResult | null> {
  const res = await fetch(`${GRAPH_API}/me/events`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      subject: input.title,
      body: input.description ? { contentType: "text", content: input.description } : undefined,
      location: input.location ? { displayName: input.location } : undefined,
      start: { dateTime: toGraphDateTime(input.startIso), timeZone: "UTC" },
      end: { dateTime: toGraphDateTime(input.endIso), timeZone: "UTC" },
    }),
  });
  if (!res.ok) return null;
  const data = await res.json().catch(() => null);
  if (!data?.id) return null;
  return { externalEventId: data.id, calendarId: "primary" };
}

export type MicrosoftFreeBusyBlock = { start: string; end: string };

/**
 * No admin-free "getSchedule by email" for a plain delegated token, so free/busy is derived
 * from the user's own calendarView instead: any event whose showAs isn't 'free'/'workingElsewhere'
 * counts as busy. Equivalent result for our purposes (Concierge white-space merging), no extra
 * permission needed beyond Calendars.ReadWrite.
 */
export async function getMicrosoftFreeBusy(
  accessToken: string,
  timeMinIso: string,
  timeMaxIso: string,
): Promise<MicrosoftFreeBusyBlock[] | null> {
  const params = new URLSearchParams({
    startDateTime: toGraphDateTime(timeMinIso) + "Z",
    endDateTime: toGraphDateTime(timeMaxIso) + "Z",
    $select: "start,end,showAs",
    $top: "100",
  });
  const res = await fetch(`${GRAPH_API}/me/calendarView?${params.toString()}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Prefer: 'outlook.timezone="UTC"',
    },
  });
  if (!res.ok) return null;
  const data = await res.json().catch(() => null);
  const events = data?.value;
  if (!Array.isArray(events)) return null;

  return events
    .filter((e: unknown) => {
      const ev = e as { showAs?: string; start?: { dateTime?: unknown }; end?: { dateTime?: unknown } };
      return (
        ev.showAs && ev.showAs !== "free" && ev.showAs !== "workingElsewhere" &&
        typeof ev.start?.dateTime === "string" && typeof ev.end?.dateTime === "string"
      );
    })
    .map((e: { start: { dateTime: string }; end: { dateTime: string } }) => ({
      start: e.start.dateTime.endsWith("Z") ? e.start.dateTime : `${e.start.dateTime}Z`,
      end: e.end.dateTime.endsWith("Z") ? e.end.dateTime : `${e.end.dateTime}Z`,
    }));
}
