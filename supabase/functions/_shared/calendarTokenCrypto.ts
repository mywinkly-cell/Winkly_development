/**
 * AES-256-GCM encryption for OAuth tokens stored in calendar_connections.token_encrypted.
 * Uses Deno's native WebCrypto (crypto.subtle) — no external dependency, same primitive
 * already used for HMAC signing in _shared/authRedirectState.ts / calendarOAuthState.ts.
 *
 * Tokens must never be stored in plaintext (calendar_connections has no service-role-only
 * carve-out beyond RLS, and a leaked refresh token grants standing calendar access). The key
 * (CALENDAR_TOKEN_ENCRYPTION_KEY) lives only in Edge Function secrets, never in the DB or the
 * mobile app — encrypt/decrypt only ever happens server-side.
 *
 * ── Key rotation (SEC-6, August 2026 audit) ─────────────────────────────────
 * The original format was `iv.ciphertext` with no key identifier, so rotating
 * the key made every stored token undecryptable at once and forced every user
 * to reconnect. In practice that means the key never gets rotated — including
 * after an incident, which is exactly when you need to.
 *
 * The format is now `v<n>.iv.ciphertext`. Decryption tries the current key
 * first and then CALENDAR_TOKEN_ENCRYPTION_KEY_PREVIOUS, so a rotation is:
 *
 *   1. CALENDAR_TOKEN_ENCRYPTION_KEY_PREVIOUS = <the old key>
 *   2. CALENDAR_TOKEN_ENCRYPTION_KEY          = <a new key from
 *                                                generateCalendarTokenEncryptionKey()>
 *   3. deploy — everything still decrypts, new writes use the new key
 *   4. let the sweep re-encrypt (any refresh writes a fresh blob), then drop
 *      the PREVIOUS secret
 *
 * Blobs written before this change have two segments and no version prefix.
 * They are still read correctly; see LEGACY_FORMAT below.
 *
 * Known gap, deliberately not closed here: the ciphertext is not bound to its
 * user_id via AES-GCM additionalData, so an attacker who could already *write*
 * to calendar_connections could move a blob between rows. That requires
 * service-role database access, at which point the tokens are readable anyway,
 * and closing it changes four call signatures. Tracked separately.
 */

export type StoredCalendarTokens = {
  access_token: string;
  refresh_token: string;
};

/** Version written by this build. Bump only if the cipher or payload shape changes. */
const CURRENT_VERSION = 1;

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

async function importKeyFromEnv(envVar: string): Promise<CryptoKey | null> {
  const raw = Deno.env.get(envVar)?.trim();
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

/** The key new blobs are written with. */
function currentKey(): Promise<CryptoKey | null> {
  return importKeyFromEnv("CALENDAR_TOKEN_ENCRYPTION_KEY");
}

/**
 * Keys to try when reading, newest first. During a rotation both are set; the
 * rest of the time PREVIOUS is unset and this is a one-element list.
 */
async function decryptionKeys(): Promise<CryptoKey[]> {
  const keys: CryptoKey[] = [];
  const current = await currentKey();
  if (current) keys.push(current);
  const previous = await importKeyFromEnv("CALENDAR_TOKEN_ENCRYPTION_KEY_PREVIOUS");
  if (previous) keys.push(previous);
  return keys;
}

export function isCalendarTokenCryptoConfigured(): boolean {
  return !!Deno.env.get("CALENDAR_TOKEN_ENCRYPTION_KEY")?.trim();
}

/** Returns null when CALENDAR_TOKEN_ENCRYPTION_KEY is missing/malformed — caller must refuse to store tokens. */
export async function encryptCalendarTokens(tokens: StoredCalendarTokens): Promise<string | null> {
  const key = await currentKey();
  if (!key) return null;

  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(JSON.stringify(tokens));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext);

  return `v${CURRENT_VERSION}.${toBase64Url(iv)}.${toBase64Url(new Uint8Array(ciphertext))}`;
}

function parseBlob(blob: string): { iv: string; ciphertext: string } | null {
  const parts = blob.split(".");

  // Current format: v<n>.iv.ciphertext
  if (parts.length === 3) {
    const [version, iv, ciphertext] = parts;
    if (!/^v\d+$/.test(version) || !iv || !ciphertext) return null;
    return { iv, ciphertext };
  }

  // LEGACY_FORMAT: iv.ciphertext, written before SEC-6. Same cipher and key,
  // just no version prefix — read it, and the next refresh rewrites it versioned.
  if (parts.length === 2) {
    const [iv, ciphertext] = parts;
    if (!iv || !ciphertext) return null;
    return { iv, ciphertext };
  }

  return null;
}

/** Returns null when no configured key can read the blob, or it is malformed/tampered (auth tag mismatch). */
export async function decryptCalendarTokens(blob: string | null | undefined): Promise<StoredCalendarTokens | null> {
  if (!blob) return null;

  const keys = await decryptionKeys();
  if (keys.length === 0) return null;

  const parsed = parseBlob(blob);
  if (!parsed) return null;

  let iv: BufferSource;
  let ciphertext: BufferSource;
  try {
    iv = fromBase64Url(parsed.iv) as BufferSource;
    ciphertext = fromBase64Url(parsed.ciphertext) as BufferSource;
  } catch {
    return null;
  }

  for (const key of keys) {
    try {
      const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
      const parsedJson = JSON.parse(new TextDecoder().decode(plaintext));
      if (
        parsedJson &&
        typeof parsedJson.access_token === "string" &&
        typeof parsedJson.refresh_token === "string"
      ) {
        return { access_token: parsedJson.access_token, refresh_token: parsedJson.refresh_token };
      }
      return null;
    } catch {
      // Wrong key for this blob (or tampering). Try the next one; if none work
      // we return null and the caller treats the connection as broken.
      continue;
    }
  }

  return null;
}

/** True when a rotation is in progress, i.e. a previous key is still configured. */
export function isCalendarKeyRotationInProgress(): boolean {
  return !!Deno.env.get("CALENDAR_TOKEN_ENCRYPTION_KEY_PREVIOUS")?.trim();
}

/** Generates a fresh 32-byte base64url key — used once, out-of-band, to provision CALENDAR_TOKEN_ENCRYPTION_KEY. */
export function generateCalendarTokenEncryptionKey(): string {
  return toBase64Url(crypto.getRandomValues(new Uint8Array(32)));
}
