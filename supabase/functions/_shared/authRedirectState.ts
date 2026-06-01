/** Signed CSRF state for auth-redirect (email / magic-link flows). */

const STATE_TTL_MS = 60 * 60 * 1000; // 1 hour

function secret(): string | null {
  const s = Deno.env.get("AUTH_REDIRECT_STATE_SECRET")?.trim();
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

/** Returns null when AUTH_REDIRECT_STATE_SECRET is not configured. */
export function isAuthRedirectStateConfigured(): boolean {
  return secret() !== null;
}

export async function mintAuthRedirectState(): Promise<string | null> {
  const key = secret();
  if (!key) return null;
  const nonce = crypto.randomUUID();
  const exp = Date.now() + STATE_TTL_MS;
  const payload = `${nonce}.${exp}`;
  const sig = await hmacSha256Base64Url(key, payload);
  return `${payload}.${sig}`;
}

export async function verifyAuthRedirectState(state: string | null | undefined): Promise<boolean> {
  const key = secret();
  if (!key) return true; // dev / unset: do not block legacy email links
  if (!state || typeof state !== "string") return false;

  const parts = state.split(".");
  if (parts.length !== 3) return false;
  const [nonce, expStr, sig] = parts;
  if (!nonce || !expStr || !sig) return false;

  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp < Date.now()) return false;

  const payload = `${nonce}.${expStr}`;
  const expected = await hmacSha256Base64Url(key, payload);
  if (!timingSafeEqual(expected, sig)) return false;

  // Reject states issued too far in the future (clock skew guard).
  if (exp > Date.now() + 5 * 60 * 1000) return false;

  return true;
}

export { STATE_TTL_MS };
