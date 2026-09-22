// apps/mobile/components/ds/revealCardsTiming.ts
// Pure timing for <RevealCards> — kept free of Reanimated so it can be unit-tested.

export const REVEAL_STAGGER_MS = 120;
export const REVEAL_FLIP_MS = 460;
export const REVEAL_FADE_MS = 220;

/** Delay before card `index` starts flipping. Negative/NaN inputs clamp to 0. */
export function revealDelayMs(index: number, staggerMs: number = REVEAL_STAGGER_MS): number {
  if (!Number.isFinite(index) || !Number.isFinite(staggerMs)) return 0;
  return Math.max(0, Math.floor(index)) * Math.max(0, staggerMs);
}

/** Time until every card is face-up; 0 for an empty list. */
export function revealTotalMs(
  count: number,
  opts: { reduceMotion: boolean; staggerMs?: number; flipMs?: number; fadeMs?: number }
): number {
  if (!Number.isFinite(count) || count <= 0) return 0;
  if (opts.reduceMotion) return opts.fadeMs ?? REVEAL_FADE_MS;
  return revealDelayMs(count - 1, opts.staggerMs) + (opts.flipMs ?? REVEAL_FLIP_MS);
}

/**
 * Flip progress p ∈ [0, 1] → which face shows and its rotateY (degrees).
 * The back turns 0→90° while visible; the front turns -90→0° once p passes 0.5.
 * Opacity swaps at the midpoint so it works without backfaceVisibility (unreliable on Android).
 * Marked as a worklet so RevealCards can call it from useAnimatedStyle.
 */
export function flipFaces(p: number): { backDeg: number; frontDeg: number; frontVisible: boolean } {
  "worklet";
  const c = Math.min(1, Math.max(0, p));
  return { backDeg: c * 180, frontDeg: c * 180 - 180, frontVisible: c >= 0.5 };
}
