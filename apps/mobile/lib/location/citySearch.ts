/**
 * City search with city + country — uses Nominatim (OpenStreetMap) for global autocomplete.
 * Location is always stored as "City, Country".
 */

import { expandCountryForDisplay } from "@/lib/location/countryDisplay";

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
const USER_AGENT = "WinklyApp/1.0 (info@mywinkly.de)";

export type CityCountry = { city: string; country: string };

function cityFromAddress(addr: Record<string, string>): string {
  return (
    addr.city ??
    addr.town ??
    addr.village ??
    addr.municipality ??
    addr.county ??
    addr.state ??
    ""
  ).trim();
}

function countryFromAddress(addr: Record<string, string>): string {
  return (addr.country ?? "").trim();
}

/**
 * Search for places by query; returns up to 10 results as { city, country }.
 * Use debounced (e.g. 300ms) when wiring to text input.
 * @param language App language for normalizing country (ISO → full name when needed).
 */
export async function searchCities(query: string, language = "en"): Promise<CityCountry[]> {
  const q = query.trim();
  if (q.length < 2) return [];

  const params = new URLSearchParams({
    q,
    format: "json",
    addressdetails: "1",
    limit: "10",
  });

  try {
    const res = await fetch(`${NOMINATIM_URL}?${params.toString()}`, {
      method: "GET",
      headers: { "User-Agent": USER_AGENT },
    });
    if (!res.ok) return [];
    const data = (await res.json()) as Array<{
      address?: Record<string, string>;
      display_name?: string;
    }>;
    const seen = new Set<string>();
    const out: CityCountry[] = [];
    for (const item of data) {
      const addr = item.address ?? {};
      const city = cityFromAddress(addr);
      const country = countryFromAddress(addr);
      if (!city && !country) {
        const name = (item.display_name ?? "").split(",")[0]?.trim();
        if (name && country) {
          const key = `${name}|${country}`;
          if (!seen.has(key)) {
            seen.add(key);
            out.push({ city: name, country });
          }
        }
        continue;
      }
      if (!country) continue;
      const key = `${city || country}|${country}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ city: city || country, country });
    }
    return out.map((row) => ({
      ...row,
      country: expandCountryForDisplay(row.country, language),
    }));
  } catch {
    return [];
  }
}
