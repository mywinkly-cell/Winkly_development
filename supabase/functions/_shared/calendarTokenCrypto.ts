/**
 * AES-256-GCM encryption for OAuth tokens stored in calendar_connections.token_encrypted.
 * Uses Deno's native WebCrypto (crypto.subtle) — no external dependency, same primitive
 * already used for HMAC signing in _shared/authRedirectState.ts / calendarOAuthState.ts.
 *
 * Tokens must never be stored in plaintext (calendar_connections has no service-role-only
 * carve-out beyond RLS, and a leaked refresh token grants standing calendar access). The key
 * (CALENDAR_TOKEN_ENCRYPTION_KEY) lives only in Edge Function secrets, never in the DB or the
 * mobile app — encrypt/decrypt only ever happens server-side.
 */

export type StoredCalendarTokens = {
  access_token: string;
  refresh_token: string;
};

function toBase64Url(bytes: Uint8Array): string {
  const bin = String.fromCharCode(...bytes);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(s: string): Uint8Array {
  const padded = s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4);
  const bin = atob(padded);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function importKey(): Promise<CryptoKey | null> {
  const raw = Deno.env.get("CALENDAR_TOKEN_ENCRYPTION_KEY")?.trim();
  if (!raw) return null;
  let keyBytes: Uint8Array;
  try {
    keyBytes = fromBase64Url(raw);
  } catch {
    return null;
  }
  if (keyBytes.length !== 32) return null; // AES-256 requires a 32-byte key.
  return crypto.subtle.importKey("raw", keyBytes as BufferSource, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

export function isCalendarTokenCryptoConfigured(): boolean {
  return !!Deno.env.get("CALENDAR_TOKEN_ENCRYPTION_KEY")?.trim();
}

/** Returns null when CALENDAR_TOKEN_ENCRYPTION_KEY is missing/malformed — caller must refuse to store tokens. */
export async function encryptCalendarTokens(tokens: StoredCalendarTokens): Promise<string | null> {
  const key = await importKey();
  if (!key) return null;

  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(JSON.stringify(tokens));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext);

  return `${toBase64Url(iv)}.${toBase64Url(new Uint8Array(ciphertext))}`;
}

/** Returns null when the key is missing, or the blob is malformed/tampered (auth tag mismatch). */
export async function decryptCalendarTokens(blob: string | null | undefined): Promise<StoredCalendarTokens | null> {
  if (!blob) return null;
  const key = await importKey();
  if (!key) return null;

  const parts = blob.split(".");
  if (parts.length !== 2) return null;
  const [ivPart, ciphertextPart] = parts;

  try {
    const iv = fromBase64Url(ivPart) as BufferSource;
    const ciphertext = fromBase64Url(ciphertextPart) as BufferSource;
    const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
    const parsed = JSON.parse(new TextDecoder().decode(plaintext));
    if (parsed && typeof parsed.access_token === "string" && typeof parsed.refresh_token === "string") {
      return { access_token: parsed.access_token, refresh_token: parsed.refresh_token };
    }
    return null;
  } catch {
    return null;
  }
}

/** Generates a fresh 32-byte base64url key — used once, out-of-band, to provision CALENDAR_TOKEN_ENCRYPTION_KEY. */
export function generateCalendarTokenEncryptionKey(): string {
  return toBase64Url(crypto.getRandomValues(new Uint8Array(32)));
}
