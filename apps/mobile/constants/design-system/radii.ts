// apps/mobile/constants/design-system/radii.ts
// Winkly Design System — border radius scale.

export const radii = {
  none: 0,
  xs: 6,
  sm: 10,
  md: 14,
  lg: 20,
  xl: 28,
  pill: 999,
} as const;

export type RadiusKey = keyof typeof radii;
