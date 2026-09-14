// apps/mobile/constants/design-system/shadows.ts
// Winkly Design System — elevation levels.
//
// Shadows barely read on dark surfaces, so dark mode leans on a subtle border
// instead of a shadow (see theme.ts `elevation()`). Levels are additive: use
// the lowest level that communicates the right hierarchy (cards = 1, sheets/
// floating action buttons = 2, modals/popovers = 3).

import type { ViewStyle } from "react-native";

export type ElevationStyle = Pick<
  ViewStyle,
  "shadowColor" | "shadowOffset" | "shadowOpacity" | "shadowRadius" | "elevation"
>;

export const lightElevation: Record<1 | 2 | 3, ElevationStyle> = {
  1: {
    shadowColor: "#1C1330",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  2: {
    shadowColor: "#1C1330",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 14,
    elevation: 6,
  },
  3: {
    shadowColor: "#1C1330",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.16,
    shadowRadius: 28,
    elevation: 12,
  },
};

/** Dark mode: near-zero shadow opacity (shadows don't read on dark surfaces) + the caller adds a 1px border. */
export const darkElevation: Record<1 | 2 | 3, ElevationStyle> = {
  1: {
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 2,
  },
  2: {
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.36,
    shadowRadius: 14,
    elevation: 6,
  },
  3: {
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.45,
    shadowRadius: 28,
    elevation: 12,
  },
};
