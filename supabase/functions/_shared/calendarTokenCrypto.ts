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
 * ── Key rotation (SEC-6a) ───────────────────────────────────────────────────
 * Blobs carry a version prefix so the key can be rotated without invalidating
 * every stored token at once. Decryption tries the current key first, then
 * CALENDAR_TOKEN_ENCRYPTION_KEY_PREVIOUS, so a rotation is:
 *
 *   1. CALENDAR_TOKEN_ENCRYPTION_KEY_PREVIOUS = <the old key>
 *   2. CALENDAR_TOKEN_ENCRYPTION_KEY          = <a new key from
 *                                                generateCalendarTokenEncryptionKey()>
 *   3. deploy — everything still decrypts, new writes use the new key
 *   4. let the sweep re-encrypt (any refresh writes a fresh blob), then drop
 *      the PREVIOUS secret
 *
 * ── Row binding via additionalData (SEC-6b, Sept 2026) ──────────────────────
 * The ciphertext is now bound to the owning user_id through AES-GCM
 * additionalData (AAD). The user_id is authenticated but NOT encrypted: to
 * decrypt a blob you must present the same user_id it was written under, so a
 * blob copied from one user's calendar_connections row into another's fails the
 * GCM auth-tag check and yields null. This closes the "move a blob between rows"
 * gap that key encryption alone left open (an attacker with service-role write
 * access could previously relocate a victim's tokens onto their own row).
 *
 * ── Blob formats (all still readable) ───────────────────────────────────────
 *   v2.iv.ciphertext   — current: AES-GCM with AAD = the user_id. Written when
 *                        a userId is supplied (every real call site does).
 *   v1.iv.ciphertext   — key-rotation format, no AAD. Still read; the next
 *                        token refresh rewrites it as v2.
 *   iv.ciphertext      — original legacy format, no version, no AAD. Still read.
 *
 * A v1/legacy blob decrypts without AAD even when a userId is supplied, so the
 * upgrade is transparent: existing connections keep working and silently become
 * v2-bound on their next refresh.
 */

export type StoredCalendarTokens = {
  access_token: string;
  refresh_token: string;
};

/** Version written for AAD-bound blobs. */
const VERSION_AAD = 2;
/** Version written when no userId is supplied (kept for completeness; real callers always bind). */
const VERSION_NO_AAD = 1;

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

/** AAD bytes for a user_id, or undefined when none is supplied. */
function aadFor(userId: string | null | undefined): Uint8Array | undefined {
  if (!userId) return undefined;
  return new TextEncoder().encode(`winkly:calendar_connections:user_id=${userId}`);
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

function currentKey(): Promise<CryptoKey | null> {
  return importKeyFromEnv("CALENDAR_TOKEN_ENCRYPTION_KEY");
}

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

/**
 * Encrypt tokens for storage.
 * @param userId  The owning calendar_connections.user_id. When supplied (every real
 *                call site does), the blob is bound to it via AAD and written as v2.
 * Returns null when CALENDAR_TOKEN_ENCRYPTION_KEY is missing/malformed — the caller must
 * then refuse to store tokens.
 */
export async function encryptCalendarTokens(
  tokens: StoredCalendarTokens,
  userId?: string | null,
): Promise<string | null> {
  const key = await currentKey();
  if (!key) return null;

  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(JSON.stringify(tokens));
  const aad = aadFor(userId);
  const params: AesGcmParams = aad
    ? { name: "AES-GCM", iv, additionalData: aad as BufferSource }
    : { name: "AES-GCM", iv };
  const ciphertext = await crypto.subtle.encrypt(params, key, plaintext);

  const version = aad ? VERSION_AAD : VERSION_NO_AAD;
  return `v${version}.${toBase64Url(iv)}.${toBase64Url(new Uint8Array(ciphertext))}`;
}

function parseBlob(blob: string): { version: number; iv: string; ciphertext: string } | null {
  const parts = blob.split(".");

  // Versioned format: v<n>.iv.ciphertext
  if (parts.length === 3) {
    const [v, iv, ciphertext] = parts;
    const m = /^v(\d+)$/.exec(v);
    if (!m || !iv || !ciphertext) return null;
    return { version: Number(m[1]), iv, ciphertext };
  }

  // LEGACY_FORMAT: iv.ciphertext — original, no version, no AAD.
  if (parts.length === 2) {
    const [iv, ciphertext] = parts;
    if (!iv || !ciphertext) return null;
    return { version: 0, iv, ciphertext };
  }

  return null;
}

/**
 * Decrypt a stored blob.
 * @param userId  The owning user_id. For a v2 (AAD-bound) blob this MUST match the
 *                user_id it was written under, or decryption fails and returns null.
 *                Ignored for v1/legacy blobs, so old connections keep working.
 * Returns null when no configured key can read the blob, or it is malformed/tampered/misbound.
 */
export async function decryptCalendarTokens(
  blob: string | null | undefined,
  userId?: string | null,
): Promise<StoredCalendarTokens | null> {
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

  // v2 blobs are AAD-bound and require the owning user_id; v1/legacy decrypt without AAD.
  const params: AesGcmParams = parsed.version >= VERSION_AAD
    ? { name: "AES-GCM", iv, additionalData: aadFor(userId) as BufferSource }
    : { name: "AES-GCM", iv };

  for (const key of keys) {
    try {
      const plaintext = await crypto.subtle.decrypt(params, key, ciphertext);
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
      // Wrong key for this blob, tampering, or a v2 blob presented with the wrong
      // (or missing) user_id — the GCM auth tag fails. Try the next key; if none
      // work we return null and the caller treats the connection as broken.
      continue;
    }
  }

  return null;
}

export function isCalendarKeyRotationInProgress(): boolean {
  return !!Deno.env.get("CALENDAR_TOKEN_ENCRYPTION_KEY_PREVIOUS")?.trim();
}

/** Generates a fresh 32-byte base64url key — used once, out-of-band, to provision CALENDAR_TOKEN_ENCRYPTION_KEY. */
export function generateCalendarTokenEncryptionKey(): string {
  return toBase64Url(crypto.getRandomValues(new Uint8Array(32)));
}
