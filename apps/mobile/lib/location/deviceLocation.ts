/**
 * Get current device location and reverse-geocode to "City, Country" for Concierge pre-fill.
 * Country name is localized to the app language (default English) when isoCountryCode is available.
 */

import * as Location from "expo-location";
import { expandCountryForDisplay, normalizeLocationDisplayString } from "@/lib/location/countryDisplay";

function localityFromAddress(addr: Record<string, unknown> | null | undefined): string {
  if (!addr || typeof addr !== "object") return "";
  const s = (v: unknown) => (typeof v === "string" ? v.trim() : "") || "";
  return (
    s(addr.city) ||
    s(addr.town) ||
    s(addr.village) ||
    s(addr.municipality) ||
    s(addr.district) ||
    s(addr.subregion) ||
    s(addr.region) ||
    ""
  );
}

export type DeviceLocationResult =
  | { ok: true; display: string; city?: string; country?: string }
  | { ok: false; error?: string };

/**
 * Reverse-geocode coordinates to a single "City, Country" line (full country name, not ISO).
 * Use when you already have permission and lat/lng (e.g. profile "Use my location").
 */
export async function reverseGeocodeToDisplay(
  latitude: number,
  longitude: number,
  language?: string
): Promise<DeviceLocationResult> {
  const lang = language || "en";
  try {
    const addresses = await Location.reverseGeocodeAsync({ latitude, longitude });
    let cityName = "";
    let country = "";
    let isoCountryCode = "";
    for (const addr of addresses) {
      const a = addr as Record<string, unknown>;
      cityName = localityFromAddress(a);
      const rawCountry = (typeof a?.country === "string" ? a.country.trim() : "") || "";
      const iso = (typeof a?.isoCountryCode === "string" ? a.isoCountryCode.trim() : "") || "";
      if (cityName && (rawCountry || iso)) {
        country = rawCountry;
        isoCountryCode = iso;
        break;
      }
    }
    if (!cityName && addresses.length > 0) {
      const first = addresses[0] as Record<string, unknown>;
      cityName = localityFromAddress(first);
      country = (typeof first?.country === "string" ? first.country.trim() : "") || "";
      isoCountryCode = (typeof first?.isoCountryCode === "string" ? first.isoCountryCode.trim() : "") || "";
    }
    const countrySrc = (isoCountryCode || country).trim();
    const countryDisplay = countrySrc ? expandCountryForDisplay(countrySrc, lang) : "";
    const displayRaw =
      cityName && countryDisplay
        ? `${cityName}, ${countryDisplay}`
        : cityName || countryDisplay || "Current location";
    const display =
      displayRaw === "Current location"
        ? displayRaw
        : normalizeLocationDisplayString(displayRaw, lang);
    return {
      ok: true,
      display,
      city: cityName || undefined,
      country: countryDisplay || undefined,
    };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/**
 * Request foreground location permission, get current position, and reverse-geocode to "City, Country".
 * Use for Concierge default location when user hasn't set a profile city or wants "current location".
 * @param language App language code (e.g. from i18n) for country name; defaults to "en".
 */
export async function getDeviceLocationDisplay(
  language?: string
): Promise<DeviceLocationResult> {
  const lang = language || "en";
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") {
      return { ok: false, error: "Location permission denied" };
    }
    const pos = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
      mayShowUserSettingsDialog: true,
    });
    const { latitude, longitude } = pos.coords;
    return reverseGeocodeToDisplay(latitude, longitude, lang);
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
