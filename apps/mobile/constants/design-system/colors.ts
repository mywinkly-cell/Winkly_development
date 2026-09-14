// apps/mobile/constants/design-system/colors.ts
// Winkly Design System — color primitives (palette + semantic + theme).
//
// This is the ONLY file that should contain color hex values for new work.
// Screens and components consume `useAppTheme().colors` (see theme.ts), never
// these raw scales directly, except when building a new primitive here.

/** Primary brand scale — violet. 600 is the brand primary (#5A189A). */
export const violet = {
  50: "#F7F0FC",
  100: "#ECDBF7",
  200: "#DAB8EF",
  300: "#C393E6",
  400: "#A466D6",
  500: "#7B2CBF",
  600: "#5A189A",
  700: "#47137A",
  800: "#350E5C",
  900: "#240940",
} as const;

/**
 * Neutral scale with a slight violet bias (hue ~265) instead of flat gray —
 * reads as premium rather than the iOS system-gray default. Used for surfaces,
 * borders, and text in both themes.
 */
export const neutral = {
  0: "#FFFFFF",
  50: "#FAF8FC",
  100: "#F3F0F8",
  150: "#EBE6F2",
  200: "#E1DAEC",
  300: "#CFC5DF",
  400: "#B3A6C9",
  500: "#8D7FA3",
  600: "#6B5F80",
  700: "#4F4560",
  800: "#362E44",
  900: "#211B2C",
  950: "#14101B",
  1000: "#000000",
} as const;

/** Semantic feedback colors. Each has a base, a soft bg tint, a border, and a dark-mode bg. */
export const semantic = {
  success: {
    base: "#1E9E5A",
    fg: "#FFFFFF",
    bg: "#E6F7EE",
    border: "#A6E6C4",
    bgDark: "#123321",
    borderDark: "#1D5A3B",
  },
  warning: {
    base: "#F5A524",
    fg: "#1C1330",
    bg: "#FFF6E5",
    border: "#FFD98C",
    bgDark: "#3D2A08",
    borderDark: "#7A5313",
  },
  error: {
    base: "#E53935",
    fg: "#FFFFFF",
    bg: "#FDECEA",
    border: "#F7B7B2",
    bgDark: "#3B1210",
    borderDark: "#6B2320",
  },
} as const;

export type ModeName = "romance" | "friends" | "business" | "events";

/** Per-mode accent colors (Identity Firewall — modes never blend). */
export const modeAccents: Record<
  ModeName,
  { primary: string; onPrimary: string; bg: string; bgDark: string; border: string }
> = {
  romance: { primary: "#E83838", onPrimary: "#FFFFFF", bg: "#FFEBEE", bgDark: "#3D1416", border: "#F5B8BB" },
  friends: { primary: "#FF9100", onPrimary: "#1C1330", bg: "#FFF3E0", bgDark: "#3D2A08", border: "#F7CE94" },
  business: { primary: "#007AFF", onPrimary: "#FFFFFF", bg: "#E3F2FD", bgDark: "#0B2A4A", border: "#A9D3F5" },
  events: { primary: "#9D33FF", onPrimary: "#FFFFFF", bg: "#F3E5F5", bgDark: "#2E1245", border: "#D9AFEB" },
};

/** Brand accent used sparingly for on-primary highlights (CTAs on violet, etc.). */
export const accentYellow = "#FFD60A";

/**
 * Fully resolved color tokens for one theme (light or dark). Components should
 * read from these semantic names, not from `violet`/`neutral` directly, so the
 * meaning ("surface", "border") stays stable while the underlying hex can move.
 */
export type ThemeColors = {
  // Surfaces
  background: string;
  backgroundMuted: string;
  surface: string;
  surfaceRaised: string;
  border: string;
  borderStrong: string;

  // Text
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  textInverse: string;

  // Brand
  primary: string;
  primaryPressed: string;
  onPrimary: string;
  secondary: string;

  // Semantic
  success: string;
  successBg: string;
  successBorder: string;
  warning: string;
  warningBg: string;
  warningBorder: string;
  error: string;
  errorBg: string;
  errorBorder: string;

  // Overlays
  overlay: string;
};

export const lightColors: ThemeColors = {
  background: neutral[50],
  backgroundMuted: "#F9F7FB",
  surface: neutral[0],
  surfaceRaised: neutral[0],
  border: neutral[200],
  borderStrong: neutral[300],

  textPrimary: "#1C1330",
  textSecondary: neutral[600],
  textMuted: neutral[500],
  textInverse: neutral[0],

  primary: violet[600],
  primaryPressed: violet[700],
  onPrimary: neutral[0],
  secondary: violet[500],

  success: semantic.success.base,
  successBg: semantic.success.bg,
  successBorder: semantic.success.border,
  warning: semantic.warning.base,
  warningBg: semantic.warning.bg,
  warningBorder: semantic.warning.border,
  error: semantic.error.base,
  errorBg: semantic.error.bg,
  errorBorder: semantic.error.border,

  overlay: "rgba(28, 19, 48, 0.45)",
};

export const darkColors: ThemeColors = {
  background: neutral[950],
  backgroundMuted: "#1A1526",
  surface: neutral[900],
  surfaceRaised: "#2A2338",
  border: neutral[800],
  borderStrong: neutral[700],

  textPrimary: neutral[100],
  textSecondary: neutral[400],
  textMuted: neutral[500],
  textInverse: "#1C1330",

  primary: violet[400],
  primaryPressed: violet[300],
  onPrimary: "#1C1330",
  secondary: violet[300],

  success: "#3FCB82",
  successBg: semantic.success.bgDark,
  successBorder: semantic.success.borderDark,
  warning: "#FFC24D",
  warningBg: semantic.warning.bgDark,
  warningBorder: semantic.warning.borderDark,
  error: "#FF6B67",
  errorBg: semantic.error.bgDark,
  errorBorder: semantic.error.borderDark,

  overlay: "rgba(0, 0, 0, 0.6)",
};

export function getModeAccent(mode: ModeName, scheme: "light" | "dark") {
  const accent = modeAccents[mode];
  return {
    primary: accent.primary,
    onPrimary: accent.onPrimary,
    bg: scheme === "dark" ? accent.bgDark : accent.bg,
    border: accent.border,
  };
}
