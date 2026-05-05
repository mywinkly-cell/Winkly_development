import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { normalizeLocationDisplayString } from "@/lib/location/countryDisplay";

/**
 * Returns a formatter for location strings stored as "City, Country" (or ISO country),
 * using the current app language — use anywhere you display `user_profiles.city` or similar.
 */
export function useFormatLocationDisplay(): (loc: string | null | undefined) => string {
  const { i18n } = useTranslation();
  const lang = i18n?.language ?? "en";
  return useCallback(
    (loc: string | null | undefined) => {
      const s = loc?.trim();
      if (!s) return "";
      return normalizeLocationDisplayString(s, lang);
    },
    [lang]
  );
}

/** Memoized single value when you only need one string normalized. */
export function useNormalizedLocation(loc: string | null | undefined): string {
  const fmt = useFormatLocationDisplay();
  return useMemo(() => fmt(loc), [fmt, loc]);
}
