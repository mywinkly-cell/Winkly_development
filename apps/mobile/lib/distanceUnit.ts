/**
 * Distance unit for display (km vs miles). Can be hooked to user_preferences later.
 * Default: use device locale (US/UK -> miles, else km).
 */
export type DistanceUnit = "km" | "mi";

export function getDefaultDistanceUnit(): DistanceUnit {
  if (typeof Intl === "undefined") return "km";
  const locale = Intl.DateTimeFormat().resolvedOptions?.().locale ?? "";
  if (/^en-(US|GB|LR|MM)/i.test(locale)) return "mi";
  return "km";
}

/** Format distance for display; only show if under maxKm (e.g. 15). Uses i18n when available. */
export function formatDistance(
  distanceKm: number | null | undefined,
  maxKm: number = 15,
  unit: DistanceUnit = getDefaultDistanceUnit()
): string | null {
  if (distanceKm == null || distanceKm < 0 || distanceKm >= maxKm) return null;
  try {
    const i18n = require("i18next");
    if (unit === "mi") {
      const miles = distanceKm * 0.621371;
      return miles < 1 ? i18n.t("common.miAway") : i18n.t("common.miAwayN", { count: Math.round(miles) });
    }
    return distanceKm < 1 ? i18n.t("common.kmAway") : i18n.t("common.kmAwayN", { count: Math.round(distanceKm) });
  } catch {
    if (unit === "mi") {
      const miles = distanceKm * 0.621371;
      return miles < 1 ? "< 1 mi away" : `${Math.round(miles)} mi away`;
    }
    return distanceKm < 1 ? "< 1 km away" : `${Math.round(distanceKm)} km away`;
  }
}
