// Accessibility helpers — 44pt minimum touch targets (WCAG / iOS HIG / Material).

import { Layout } from "@/constants/tokens";

/** Default hitSlop when visual control is already ≥44pt. */
export const HIT_SLOP = { top: 8, bottom: 8, left: 8, right: 8 } as const;

/** Expands touch area so visual size + hitSlop meets Layout.touchTargetMin (44). */
export function hitSlopForSize(visualSize: number) {
  const extra = Math.max(0, Math.ceil((Layout.touchTargetMin - visualSize) / 2));
  return { top: extra, bottom: extra, left: extra, right: extra };
}
