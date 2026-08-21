/**
 * Signed CSRF state for the cloud calendar OAuth connect flow (calendar-oauth-start /
 * calendar-oauth-callback). Carries {uid, provider} through the redirect so the public
 * callback endpoint — hit directly by Google/Microsoft with no Authorization header —
 * knows which user and provider a code belongs to, without trusting client-supplied values.
 * Modeled on _shared/authRedirectState.ts (same HMAC-SHA256 + timing-safe compare), but a
 * distinct secret so calendar OAuth security is not coupled to the email-link CSRF secret.
 */

export type CalendarOAuthProvider = "google" | "microsoft";

const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes — long enough for a real consent flow, short enough to limit replay.

function secret(): string | null {
  const s = Deno.env.get("CALENDAR_OAUTH_STATE_SECRET")?.trim();
  return s && s.length >= 16 ? s : null;
}

function toBase64Url(bytes: Uint8Array): string {
  const bin = String.fromCharCode(...bytes);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function hmacSha256Base64Url(key: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, enc.encode(message));
  return toBase64Url(new Uint8Array(sig));
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

function isProvider(v: unknown): v is CalendarOAuthProvider {
  return v === "google" || v === "microsoft";
}

export function isCalendarOAuthStateConfigured(): boolean {
  return secret() !== null;
}

/** Returns null when CALENDAR_OAUTH_STATE_SECRET is not configured (caller should refuse to start OAuth). */
export async function mintCalendarOAuthState(uid: string, provider: CalendarOAuthProvider): Promise<string | null> {
  const key = secret();
  if (!key) return null;
  const nonce = crypto.randomUUID();
  const exp = Date.now() + STATE_TTL_MS;
  const payload = `${uid}.${provider}.${nonce}.${exp}`;
  const sig = await hmacSha256Base64Url(key, payload);
  return `${payload}.${sig}`;
}

export type VerifiedCalendarOAuthState = { uid: string; provider: CalendarOAuthProvider };

/** Returns null when the state is missing, malformed, expired, or fails signature verification. */
export async function verifyCalendarOAuthState(state: string | null | undefined): Promise<VerifiedCalendarOAuthState | null> {
  const key = secret();
  if (!key) return null;
  if (!state || typeof state !== "string") return null;

  const parts = state.split(".");
  if (parts.length !== 5) return null;
  const [uid, provider, nonce, expStr, sig] = parts;
  if (!uid || !provider || !nonce || !expStr || !sig) return null;
  if (!isProvider(provider)) return null;

  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp < Date.now()) return null;
  // Reject states issued too far in the future (clock skew guard).
  if (exp > Date.now() + STATE_TTL_MS + 5 * 60 * 1000) return null;

  const payload = `${uid}.${provider}.${nonce}.${expStr}`;
  const expected = await hmacSha256Base64Url(key, payload);
  if (!timingSafeEqual(expected, sig)) return null;

  return { uid, provider };
}
