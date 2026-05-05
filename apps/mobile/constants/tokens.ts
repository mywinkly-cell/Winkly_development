// apps/mobile/constants/tokens.ts
// Winkly Design Tokens — Premium, token-driven UI (spec v8.1)
// Typography: Inter (UI/body), Poppins Rounded (headlines/brand)
// Layout: 8pt grid, consistent radii

export const Colors = {
  // Brand
  primaryViolet: "#5A189A",
  secondaryViolet: "#7B2CBF",
  accentYellow: "#FFD60A",
  white: "#FFFFFF",
  softBlack: "#1C1C1E",

  // Mode colors (Identity Firewall — no cross-mode leakage)
  // Primary: main/solid card color. Accent: secondary buttons, background chips
  romance: { primary: "#E83838", secondary: "#FFEBEE", accent: "#FFEBEE" },
  friends: { primary: "#FF9100", secondary: "#FFF3E0", accent: "#FFF3E0" },
  business: { primary: "#007AFF", secondary: "#E3F2FD", accent: "#E3F2FD" },
  events: { primary: "#9D33FF", secondary: "#F3E5F5", accent: "#F3E5F5" },

  // Legacy aliases for backward compat (match mode primaries)
  accentCoral: "#E83838",   // romance
  accentMint: "#FF9100",   // friends
  accentNavy: "#007AFF",   // business
  accentVioletEvent: "#9D33FF", // events

  // Text
  textPrimary: "#1C1C1E",
  textSecondary: "#555555",
  gray800: "#5A5A5A",
  gray700: "#707070",
  gray600: "#8E8E93",
  gray500: "#AEAEB2",
  gray400: "#BDBDBD",
  gray300: "#C7C7CC",
  gray200: "#E5E5EA",
  gray100: "#F2F2F7",

  // Surfaces
  backgroundLight: "#FFFFFF",
  backgroundMuted: "#F9F7FB",
  background: "#F9F7FB",
  card: "#FFFFFF",
  border: "#E5E5EA",

  // Text aliases
  text: "#1C1C1E",
  mutedText: "#8E8E93",

  // Primary alias (brand)
  primary: "#5A189A",
  onPrimary: "#FFFFFF",

  // Feedback
  errorRed: "#E53935",
  successGreen: "#34C759",
};

export const Typography = {
  h1: {
    fontSize: 32,
    lineHeight: 40,
    fontWeight: "700" as const,
  },
  h2: {
    fontSize: 24,
    lineHeight: 32,
    fontWeight: "600" as const,
  },
  h3: {
    fontSize: 20,
    lineHeight: 28,
    fontWeight: "600" as const,
  },
  body: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: "400" as const,
  },
  caption: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "400" as const,
  },
  button: {
    fontSize: 16,
    lineHeight: 20,
    fontWeight: "600" as const,
  },
  /** "Winkly" in top header: bold, 10% bigger than h3 (20 → 22). Use with FontFamily.headingBold. */
  headerWinklyTitle: {
    fontSize: 22,
    lineHeight: 31,
    fontWeight: "700" as const,
  },
};

/** Unified top header bar dimensions (all app top headers use this). */
export const TOP_HEADER_BAR = {
  paddingTop: 8,
  paddingBottom: 12,
  minHeight: 56,
} as const;

export const Layout = {
  gridUnit: 8,
  /** Extra top padding for auth/onboarding screens; reduced with top spacer. */
  safeTopExtra: 12,
  radii: {
    card: 20,
    control: 12,
    avatar: 24,
  },
  spacing: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 24,
    xxl: 32,
  },
  touchTargetMin: 44,
  screenPadding: 20,
  /** Padding below Stack top spacer for screen content; reduced so content sits higher. */
  screenTopPadding: 12,
  /** Use TOP_HEADER_BAR for consistent top header size everywhere. */
  topHeaderBar: TOP_HEADER_BAR,
  /** Fixed content height for all bottom bars (paddingTop + row + paddingBottom base). Total bar height = bottomBarHeight + insets.bottom */
  bottomBarHeight: 76,
};

export const FontFamily = {
  heading: "Poppins_600SemiBold",
  headingBold: "Poppins_700Bold",
  body: "System",
};

export const Shadow = {
  card: {
    shadowColor: "#1C1C1E",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 4,
  },
  button: {
    shadowColor: "#5A189A",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
  },
};
