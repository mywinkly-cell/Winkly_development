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

/**
 * Short, unit-aware label for a rough distance ("1 km", "100 m" / "0.6 mi", "330 ft"),
 * with the number formatted for `locale`. For copy like "rounded to about {{size}}".
 */
export function formatApproxDistance(
  meters: number,
  unit: DistanceUnit = getDefaultDistanceUnit(),
  locale?: string
): string {
  const num = (n: number) => {
    try {
      return new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(n);
    } catch {
      return String(n);
    }
  };
  if (unit === "mi") {
    const miles = meters / 1609.344;
    if (miles >= 0.5) return `${num(Math.round(miles * 10) / 10)} mi`;
    return `${num(Math.round((meters * 3.28084) / 10) * 10)} ft`;
  }
  if (meters >= 1000) return `${num(Math.round(meters / 100) / 10)} km`;
  return `${num(Math.round(meters))} m`;
}
