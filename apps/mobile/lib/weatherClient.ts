// Client-side weather for Concierge (Open-Meteo, no API key).

import { expandCountryForDisplay, normalizeLocationDisplayString } from "@/lib/location/countryDisplay";
// Use to show weather for selected date/location and pass weather_snapshot to AI.
// Cache: weather by (lat,lng,date) or (city,date) TTL 5 min for repeat/refined requests.

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 min
const weatherByKey = new Map<string, { data: WeatherSnapshot | null; ts: number }>();

function cacheKeyWeather(lat: number, lng: number, date: string): string {
  return `w:${lat.toFixed(4)},${lng.toFixed(4)},${date}`;
}

function cacheKeyCity(city: string, date: string, country?: string): string {
  return `w:city:${(city || "").trim().toLowerCase()},${(country || "").trim().toLowerCase()},${date}`;
}

function cacheKeyRange(city: string, from: string, to: string, country?: string): string {
  return `w:range:${(city || "").trim().toLowerCase()},${(country || "").trim().toLowerCase()},${from},${to}`;
}

function getCached<T>(key: string): T | undefined {
  const entry = weatherByKey.get(key);
  if (!entry || Date.now() - entry.ts > CACHE_TTL_MS) return undefined;
  return entry.data as T;
}

function setCached(key: string, data: WeatherSnapshot | null): void {
  weatherByKey.set(key, { data, ts: Date.now() });
}

export type WeatherSnapshot = {
  summary?: string;
  temp_min?: number;
  temp_max?: number;
  precipitation?: number;
  date?: string;
  weathercode?: number;
  /** For date range: average over the period */
  avg_temp_min?: number;
  avg_temp_max?: number;
  /** Number of days with rain (precipitation > 0.5mm) over total days */
  rainy_days?: number;
  total_days?: number;
  /** e.g. "Mostly sunny" or "2 of 5 days rainy" */
  period_summary?: string;
};

/**
 * Geocode city name to lat/lng via Open-Meteo (no key).
 */
export async function geocodeCity(city: string): Promise<{ lat: number; lng: number } | null> {
  if (!city?.trim()) return null;
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city.trim())}&count=1`;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const r = data.results?.[0];
    if (!r?.latitude || !r?.longitude) return null;
    return { lat: r.latitude, lng: r.longitude };
  } catch {
    return null;
  }
}

/**
 * Fetch one-day weather for a date at lat/lng. Returns a short snapshot for display and for weather_snapshot in concierge context.
 */
export async function getWeatherForDate(
  lat: number,
  lng: number,
  date: string
): Promise<WeatherSnapshot | null> {
  const key = cacheKeyWeather(lat, lng, date);
  const cached = getCached<WeatherSnapshot | null>(key);
  if (cached !== undefined) return cached;
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", String(lat));
  url.searchParams.set("longitude", String(lng));
  url.searchParams.set("daily", "weathercode,temperature_2m_max,temperature_2m_min,precipitation_sum");
  url.searchParams.set("timezone", "auto");
  url.searchParams.set("start_date", date);
  url.searchParams.set("end_date", date);
  try {
    const res = await fetch(url.toString());
    if (!res.ok) return null;
    const data = await res.json();
    const daily = data.daily;
    if (!daily?.time?.length) return null;
    const i = daily.time.findIndex((t: string) => t.startsWith(date));
    if (i < 0) return null;
    const tempMax = daily.temperature_2m_max?.[i];
    const tempMin = daily.temperature_2m_min?.[i];
    const precip = daily.precipitation_sum?.[i];
    const code = daily.weathercode?.[i];
    const summary = code != null ? weatherCodeToSummary(code) : undefined;
    const out: WeatherSnapshot = {
      date,
      temp_min: tempMin,
      temp_max: tempMax,
      precipitation: precip,
      weathercode: code,
      summary: summary ?? (tempMax != null ? `${tempMin ?? ""}–${tempMax}°C` : undefined),
    };
    setCached(key, out);
    return out;
  } catch {
    return null;
  }
}

function weatherCodeToSummary(code: number): string {
  if (code === 0) return "Clear";
  if (code <= 3) return "Partly cloudy";
  if (code <= 49) return "Foggy";
  if (code <= 59) return "Drizzle";
  if (code <= 69) return "Rain";
  if (code <= 79) return "Snow";
  if (code <= 84) return "Rain showers";
  if (code <= 94) return "Snow showers";
  if (code <= 99) return "Thunderstorm";
  return "Unknown";
}

/**
 * Fetch weather for a city and date. Geocodes then fetches forecast. Optional country improves accuracy.
 */
export async function getWeatherForCityAndDate(
  city: string,
  date: string,
  country?: string
): Promise<WeatherSnapshot | null> {
  const key = cacheKeyCity(city, date, country);
  const cached = getCached<WeatherSnapshot | null>(key);
  if (cached !== undefined) return cached;
  const coords = country?.trim()
    ? await geocodeCityCountry(city, country)
    : await geocodeCity(city);
  if (!coords) return null;
  const out = await getWeatherForDate(coords.lat, coords.lng, date);
  setCached(key, out);
  return out;
}

/**
 * Geocode "city, country" for better accuracy when country is provided.
 */
export async function geocodeCityCountry(city: string, country?: string): Promise<{ lat: number; lng: number } | null> {
  const countryNorm = country?.trim() ? expandCountryForDisplay(country, "en") : "";
  const query = countryNorm ? `${city.trim()}, ${countryNorm}` : city.trim();
  if (!query) return null;
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=1`;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const r = data.results?.[0];
    if (!r?.latitude || !r?.longitude) return null;
    return { lat: r.latitude, lng: r.longitude };
  } catch {
    return null;
  }
}

/** One autocomplete suggestion: "City, Country" display and parsed parts for API. */
export type LocationSuggestion = { display: string; city: string; country: string };

/**
 * Search for places by name; returns "City, Country" options for a single location field (premium autocomplete).
 * @param language App language code (e.g. from i18n) for localized place/country names; defaults to "en".
 */
export async function searchLocationAutocomplete(
  query: string,
  language?: string
): Promise<LocationSuggestion[]> {
  const q = query?.trim();
  if (!q || q.length < 2) return [];
  const lang = (language || "en").toLowerCase();
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=8&language=${lang}`;
  try {
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    const results = data.results ?? [];
    const seen = new Set<string>();
    return results
      .filter((r: { name?: string; country?: string }) => r?.name && r?.country)
      .map((r: { name: string; country: string }) => {
        const city = String(r.name).trim();
        const country = String(r.country).trim();
        const countryNorm = expandCountryForDisplay(country, lang);
        const display = normalizeLocationDisplayString(`${city}, ${countryNorm}`, lang);
        return { display, city, country: countryNorm };
      })
      .filter((s: LocationSuggestion) => {
        const key = s.display.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  } catch {
    return [];
  }
}

/**
 * Fetch weather for a date range; returns aggregated snapshot (avg temp, rainy days, period summary).
 */
export async function getWeatherForCityAndDateRange(
  city: string,
  dateFrom: string,
  dateTo: string,
  country?: string
): Promise<WeatherSnapshot | null> {
  const key = cacheKeyRange(city, dateFrom, dateTo, country);
  const cached = getCached<WeatherSnapshot | null>(key);
  if (cached !== undefined) return cached;
  const coords = country?.trim()
    ? await geocodeCityCountry(city, country)
    : await geocodeCity(city);
  if (!coords) return null;
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", String(coords.lat));
  url.searchParams.set("longitude", String(coords.lng));
  url.searchParams.set("daily", "weathercode,temperature_2m_max,temperature_2m_min,precipitation_sum");
  url.searchParams.set("timezone", "auto");
  url.searchParams.set("start_date", dateFrom);
  url.searchParams.set("end_date", dateTo);
  try {
    const res = await fetch(url.toString());
    if (!res.ok) return null;
    const data = await res.json();
    const daily = data.daily;
    if (!daily?.time?.length) return null;
    const times = daily.time as string[];
    const tempMins = (daily.temperature_2m_min ?? []) as number[];
    const tempMaxs = (daily.temperature_2m_max ?? []) as number[];
    const precips = (daily.precipitation_sum ?? []) as number[];
    const codes = (daily.weathercode ?? []) as number[];
    const n = times.length;
    let sumMin = 0, sumMax = 0, rainyCount = 0;
    let sunnyCount = 0, cloudyCount = 0;
    for (let i = 0; i < n; i++) {
      if (tempMins[i] != null) sumMin += tempMins[i];
      if (tempMaxs[i] != null) sumMax += tempMaxs[i];
      if ((precips[i] ?? 0) > 0.5) rainyCount++;
      const c = codes[i] ?? 0;
      if (c === 0) sunnyCount++;
      else if (c <= 3) cloudyCount++;
    }
    const avgTempMin = n ? Math.round(sumMin / n) : undefined;
    const avgTempMax = n ? Math.round(sumMax / n) : undefined;
    let period_summary = "";
    if (rainyCount === 0) period_summary = "No rain expected.";
    else if (rainyCount === n) period_summary = "Rain likely throughout.";
    else period_summary = `${rainyCount} of ${n} days with rain.`;
    if (sunnyCount >= n * 0.6) period_summary = "Mostly sunny. " + period_summary;
    else if (cloudyCount >= n * 0.5) period_summary = "Mixed skies. " + period_summary;
    const out: WeatherSnapshot = {
      date: `${dateFrom} – ${dateTo}`,
      temp_min: avgTempMin,
      temp_max: avgTempMax,
      avg_temp_min: avgTempMin,
      avg_temp_max: avgTempMax,
      precipitation: rainyCount > 0 ? 1 : 0,
      rainy_days: rainyCount,
      total_days: n,
      period_summary: period_summary.trim(),
      summary: avgTempMin != null && avgTempMax != null ? `Avg ${avgTempMin}–${avgTempMax}°C` : undefined,
    };
    setCached(key, out);
    return out;
  } catch {
    return null;
  }
}
