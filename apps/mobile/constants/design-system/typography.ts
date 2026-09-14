// apps/mobile/constants/design-system/typography.ts
// Winkly Design System — type scale.
//
// Archivo (display/headings) + Public Sans (body/caption). Both are loaded in
// app/_layout.tsx via @expo-google-fonts. Never set fontSize/fontWeight/lineHeight
// ad hoc in a screen — pull a named style from `typeScale` instead.

export const FontFamily = {
  displayBold: "Archivo_700Bold",
  displaySemiBold: "Archivo_600SemiBold",
  headingSemiBold: "Archivo_600SemiBold",
  headingMedium: "Archivo_500Medium",
  bodyRegular: "PublicSans_400Regular",
  bodyMedium: "PublicSans_500Medium",
  bodySemiBold: "PublicSans_600SemiBold",
} as const;

export type TypeStyle = {
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  fontWeight: "400" | "500" | "600" | "700";
  letterSpacing?: number;
};

/**
 * The full type scale. Every screen-facing piece of text should map to one of
 * these — if nothing fits, that's a sign to add a new named style here rather
 * than hand-rolling a fontSize in a screen.
 */
export const typeScale: Record<
  "display" | "h1" | "h2" | "h3" | "bodyLarge" | "body" | "bodyMedium" | "caption" | "overline" | "button",
  TypeStyle
> = {
  display: {
    fontFamily: FontFamily.displayBold,
    fontSize: 36,
    lineHeight: 44,
    fontWeight: "700",
    letterSpacing: -0.5,
  },
  h1: {
    fontFamily: FontFamily.displayBold,
    fontSize: 28,
    lineHeight: 36,
    fontWeight: "700",
    letterSpacing: -0.25,
  },
  h2: {
    fontFamily: FontFamily.displaySemiBold,
    fontSize: 22,
    lineHeight: 29,
    fontWeight: "600",
  },
  h3: {
    fontFamily: FontFamily.headingSemiBold,
    fontSize: 18,
    lineHeight: 24,
    fontWeight: "600",
  },
  bodyLarge: {
    fontFamily: FontFamily.bodyRegular,
    fontSize: 17,
    lineHeight: 25,
    fontWeight: "400",
  },
  body: {
    fontFamily: FontFamily.bodyRegular,
    fontSize: 15,
    lineHeight: 22,
    fontWeight: "400",
  },
  bodyMedium: {
    fontFamily: FontFamily.bodyMedium,
    fontSize: 15,
    lineHeight: 22,
    fontWeight: "500",
  },
  caption: {
    fontFamily: FontFamily.bodyRegular,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "400",
  },
  overline: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "600",
    letterSpacing: 0.6,
  },
  button: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 16,
    lineHeight: 20,
    fontWeight: "600",
  },
};
