// apps/mobile/constants/design-system/spacing.ts
// Winkly Design System — 8pt spacing scale. Every margin/padding/gap in new
// components should reference `spacing.*` instead of a raw number.

export const spacing = {
  none: 0,
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  huge: 40,
  massive: 48,
  jumbo: 64,
} as const;

export type SpacingKey = keyof typeof spacing;
