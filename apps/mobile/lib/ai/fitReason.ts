/**
 * Fit-reason resolution — the pure logic behind the "Why this fits you" line.
 *
 * Kept free of React Native / expo-router imports so it can be reused by plain
 * modules (e.g. proactive proposal builders) and unit-tested in isolation. The
 * <FitReasonLine /> component re-exports these for convenience.
 */

/** Shown only if the gateway didn't return a concrete reason. References personal dimensions, not "great spot!". */
export const FIT_REASON_FALLBACK = "Picked to match your interests, location, and budget.";

/** Fields, in priority order, that may carry the per-option fit reason across surfaces. */
type FitReasonSource = {
  fit_reason?: unknown;
  why_this_fits?: unknown;
  logic_bridge?: unknown;
  mutual_fit_reason?: unknown;
  group_fit_notes?: unknown;
};

function firstNonEmpty(...vals: unknown[]): string | undefined {
  for (const v of vals) {
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return undefined;
}

/**
 * Pull the best available "why this fits you" sentence off an option-like object.
 * Prefers the canonical `fit_reason`, then legacy `why_this_fits` / `logic_bridge` /
 * `mutual_fit_reason`, then the first group-fit bullet. Returns undefined when none
 * exist so callers can decide whether to show the fallback.
 */
export function resolveFitReason(opt: FitReasonSource | null | undefined): string | undefined {
  if (!opt || typeof opt !== "object") return undefined;
  const direct = firstNonEmpty(opt.fit_reason, opt.why_this_fits, opt.logic_bridge, opt.mutual_fit_reason);
  if (direct) return direct;
  if (Array.isArray(opt.group_fit_notes)) return firstNonEmpty(...(opt.group_fit_notes as unknown[]));
  return undefined;
}
