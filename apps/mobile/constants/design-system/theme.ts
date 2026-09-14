// apps/mobile/constants/design-system/theme.ts
// Winkly Design System — theme composition + the `useAppTheme` hook.
//
// This is the single entry point primitives should import from. It resolves
// light/dark automatically from the OS color scheme.

import { useColorScheme } from "react-native";
import { darkColors, getModeAccent, lightColors, type ModeName, type ThemeColors } from "./colors";
import { darkElevation, lightElevation, type ElevationStyle } from "./shadows";
import { radii } from "./radii";
import { spacing } from "./spacing";
import { FontFamily, typeScale } from "./typography";

export type ColorScheme = "light" | "dark";

export type AppTheme = {
  scheme: ColorScheme;
  colors: ThemeColors;
  spacing: typeof spacing;
  radii: typeof radii;
  type: typeof typeScale;
  fontFamily: typeof FontFamily;
  /** Elevation level 1-3. Automatically switches to the dark-mode variant. */
  elevation: (level: 1 | 2 | 3) => ElevationStyle;
  /** Resolve a mode's accent color for the current color scheme. */
  modeAccent: (mode: ModeName) => ReturnType<typeof getModeAccent>;
};

function buildTheme(scheme: ColorScheme): AppTheme {
  const colors = scheme === "dark" ? darkColors : lightColors;
  const elevationSet = scheme === "dark" ? darkElevation : lightElevation;
  return {
    scheme,
    colors,
    spacing,
    radii,
    type: typeScale,
    fontFamily: FontFamily,
    elevation: (level) => elevationSet[level],
    modeAccent: (mode) => getModeAccent(mode, scheme),
  };
}

export const lightTheme = buildTheme("light");
export const darkTheme = buildTheme("dark");

/**
 * Resolves the current theme from the OS color scheme. Falls back to light
 * when the scheme is unavailable/null (e.g. some Android/web contexts).
 */
export function useAppTheme(): AppTheme {
  const scheme = useColorScheme();
  return scheme === "dark" ? darkTheme : lightTheme;
}
