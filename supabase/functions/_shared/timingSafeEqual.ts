/**
 * Constant-time string comparison for shared secrets (SEC-4, August 2026 audit).
 *
 * weather-pivot-cron and calendar-sync-sweep both compared their CRON_SECRET
 * with `!==`, which returns as soon as two bytes differ and so leaks the length
 * of the matching prefix. weekly-spark-cron already had the correct version
 * inline; this is that implementation, shared, so the three cannot drift again.
 *
 * Both endpoints already fail closed on a missing secret — this is defence in
 * depth, not the lock itself.
 */

/**
 * True when both strings are equal. Runtime depends on the length of `a`, never
 * on how many characters match.
 *
 * Note the length check: comparing strings of different lengths does return
 * early, which reveals the secret's length but not its content. That is the
 * standard trade-off, and length alone is not a useful oracle here.
 */
export function timingSafeEqual(a: string, b: string): boolean {
  if (typeof a !== "string" || typeof b !== "string") return false;
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * Guard for a service-role cron endpoint: reads the `x-cron-secret` header and
 * compares it with CRON_SECRET in constant time.
 *
 * Fails CLOSED — a missing or empty CRON_SECRET rejects every request rather
 * than waving them through. That is the property that matters most here: these
 * endpoints run with SUPABASE_SERVICE_ROLE_KEY and have verify_jwt = false.
 */
export function cronSecretOk(req: Request, envVar = "CRON_SECRET"): boolean {
  const expected = Deno.env.get(envVar) ?? "";
  const provided = req.headers.get("x-cron-secret") ?? "";
  if (!expected) return false;
  return timingSafeEqual(provided, expected);
}
