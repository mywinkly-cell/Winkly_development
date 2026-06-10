// Client-side weather for Concierge (Open-Meteo, no API key).

import { expandCountryForDisplay, normalizeLocationDisplayString } from "@/lib/location/countryDisplay";
// Use to show weather for selected date/location and pass weather_snapshot to AI.
// Cache: weather by (lat,lng,date) or (city,date) TTL 5 min for repeat/refined requests.

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 min
const weatherByKey = new Map<string, { data: WeatherSnapshot | null; ts: number }>();

function cacheKeyWeather(lat: number, lng: number, date: string): string {
  return `w:${lat.toFixed(4)},${lng.toFixed(4)},${date}`;
}

function cacheKeyCity(city: string, date: string, country?: string, timeKey?: string): string {
  const base = `w:city:${(city || "").trim().toLowerCase()},${(country || "").trim().toLowerCase()},${date}`;
  return timeKey ? `${base},${timeKey}` : base;
}

function timeCacheKey(options?: WeatherTimeOptions): string {
  if (!options) return "";
  if (options.exactTimeHm?.trim()) return `t:${options.exactTimeHm.trim()}`;
  if (options.slotIso?.trim()) return `s:${options.slotIso.trim()}`;
  if (options.timeOfDay && options.timeOfDay !== "any") return `d:${options.timeOfDay}`;
  return "";
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

export type WeatherTimePreference =
  | "any"
  | "morning"
  | "lunch"
  | "lunchtime"
  | "afternoon"
  | "evening"
  | "when_free";

export type WeatherTimeOptions = {
  timeOfDay?: WeatherTimePreference;
  /** Local HH:mm — takes priority over timeOfDay when set. */
  exactTimeHm?: string;
  /** ISO start time for "when_free" calendar slots. */
  slotIso?: string;
};

export type WeatherSnapshot = {
  summary?: string;
  temp_min?: number;
  temp_max?: number;
  precipitation?: number;
  date?: string;
  weathercode?: number;
  /** Hourly temperature at the selected time (°C). */
  temp_at_time?: number;
  /** Local HH:mm used for the hourly forecast anchor. */
  forecast_hour?: string;
  /** Daily precipitation total (mm) when hourly precip is also present. */
  precipitation_day?: number;
  /** For date range: average over the period */
  avg_temp_min?: number;
  avg_temp_max?: number;
  /** Number of days with rain (precipitation > 0.5mm) over total days */
  rainy_days?: number;
  total_days?: number;
  /** e.g. "Mostly sunny" or "2 of 5 days rainy" */
  period_summary?: string;
};

const TIME_OF_DAY_HOUR: Record<string, number> = {
  morning: 9,
  lunch: 12,
  lunchtime: 12,
  afternoon: 15,
  evening: 19,
  when_free: 18,
};

/** Resolve local hour (0–23) for hourly forecast; null = daily summary only. */
export function resolveForecastHour(options?: WeatherTimeOptions): number | null {
  if (!options) return null;
  const hm = options.exactTimeHm?.trim();
  if (hm && /^\d{2}:\d{2}$/.test(hm)) {
    return Math.min(23, Math.max(0, parseInt(hm.slice(0, 2), 10)));
  }
  if (options.slotIso?.trim()) {
    const d = new Date(options.slotIso.trim());
    if (!Number.isNaN(d.getTime())) return d.getHours();
  }
  const tod = options.timeOfDay;
  if (tod && tod !== "any") return TIME_OF_DAY_HOUR[tod] ?? null;
  return null;
}

function dayKeyFromDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Pick a calendar free slot that falls on the selected plan date. */
export function pickSlotForDate(slots: string[], dateStr: string): string | undefined {
  if (!slots.length) return undefined;
  const match = slots.find((s) => {
    const d = new Date(s);
    return !Number.isNaN(d.getTime()) && dayKeyFromDate(d) === dateStr;
  });
  return match ?? slots[0];
}

export function buildWeatherTimeOptions(input: {
  timeOfDay?: string;
  exactTimeHm?: string;
  availableSlots?: string[];
  dateStr?: string;
}): WeatherTimeOptions | undefined {
  const exact = input.exactTimeHm?.trim();
  if (exact && /^\d{2}:\d{2}$/.test(exact)) return { exactTimeHm: exact };
  if (input.timeOfDay === "when_free" && input.availableSlots?.length) {
    const slot = input.dateStr
      ? pickSlotForDate(input.availableSlots, input.dateStr)
      : input.availableSlots[0];
    if (slot) return { timeOfDay: "when_free", slotIso: slot };
  }
  if (input.timeOfDay && input.timeOfDay !== "any") {
    return { timeOfDay: input.timeOfDay as WeatherTimePreference };
  }
  return undefined;
}

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

async function fetchDailySnapshot(lat: number, lng: number, date: string): Promise<WeatherSnapshot | null> {
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", String(lat));
  url.searchParams.set("longitude", String(lng));
  url.searchParams.set("daily", "weathercode,temperature_2m_max,temperature_2m_min,precipitation_sum");
  url.searchParams.set("timezone", "auto");
  url.searchParams.set("start_date", date);
  url.searchParams.set("end_date", date);
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
  return {
    date,
    temp_min: tempMin,
    temp_max: tempMax,
    precipitation: precip,
    weathercode: code,
    summary: summary ?? (tempMax != null ? `${tempMin ?? ""}–${tempMax}°C` : undefined),
  };
}

async function fetchHourlyAtTime(
  lat: number,
  lng: number,
  date: string,
  hour: number
): Promise<{ temp?: number; precip?: number; code?: number; forecast_hour: string } | null> {
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", String(lat));
  url.searchParams.set("longitude", String(lng));
  url.searchParams.set("hourly", "temperature_2m,weathercode,precipitation");
  url.searchParams.set("timezone", "auto");
  url.searchParams.set("start_date", date);
  url.searchParams.set("end_date", date);
  const res = await fetch(url.toString());
  if (!res.ok) return null;
  const data = await res.json();
  const hourly = data.hourly;
  if (!hourly?.time?.length) return null;
  const hh = String(hour).padStart(2, "0");
  const prefix = `${date}T${hh}:`;
  let i = (hourly.time as string[]).findIndex((t) => t.startsWith(prefix));
  if (i < 0) {
    i = (hourly.time as string[]).reduce((best, t, idx) => {
      if (!t.startsWith(date)) return best;
      const h = parseInt(t.slice(11, 13), 10);
      if (Number.isNaN(h)) return best;
      const dist = Math.abs(h - hour);
      return dist < best.dist ? { idx, dist } : best;
    }, { idx: -1, dist: 24 }).idx;
  }
  if (i < 0) return null;
  const timeStr = (hourly.time as string[])[i];
  const forecast_hour = timeStr?.length >= 16 ? timeStr.slice(11, 16) : `${hh}:00`;
  return {
    temp: hourly.temperature_2m?.[i],
    precip: hourly.precipitation?.[i],
    code: hourly.weathercode?.[i],
    forecast_hour,
  };
}

function mergeHourlyIntoSnapshot(base: WeatherSnapshot, hourly: NonNullable<Awaited<ReturnType<typeof fetchHourlyAtTime>>>): WeatherSnapshot {
  const codeSummary = hourly.code != null ? weatherCodeToSummary(hourly.code) : base.summary;
  const precipDay = base.precipitation;
  return {
    ...base,
    temp_at_time: hourly.temp,
    forecast_hour: hourly.forecast_hour,
    weathercode: hourly.code ?? base.weathercode,
    precipitation_day: precipDay,
    precipitation: hourly.precip ?? precipDay,
    summary: codeSummary,
  };
}

/**
 * Fetch one-day weather for a date at lat/lng. Returns a short snapshot for display and for weather_snapshot in concierge context.
 * When timeOptions is set, overlays hourly forecast for that part of the day.
 */
export async function getWeatherForDate(
  lat: number,
  lng: number,
  date: string,
  timeOptions?: WeatherTimeOptions
): Promise<WeatherSnapshot | null> {
  const tKey = timeCacheKey(timeOptions);
  const key = tKey ? `${cacheKeyWeather(lat, lng, date)},${tKey}` : cacheKeyWeather(lat, lng, date);
  const cached = getCached<WeatherSnapshot | null>(key);
  if (cached !== undefined) return cached;
  try {
    const daily = await fetchDailySnapshot(lat, lng, date);
    if (!daily) return null;
    const hour = resolveForecastHour(timeOptions);
    if (hour == null) {
      setCached(key, daily);
      return daily;
    }
    const hourly = await fetchHourlyAtTime(lat, lng, date, hour);
    const out = hourly ? mergeHourlyIntoSnapshot(daily, hourly) : daily;
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
  country?: string,
  timeOptions?: WeatherTimeOptions
): Promise<WeatherSnapshot | null> {
  const tKey = timeCacheKey(timeOptions);
  const key = cacheKeyCity(city, date, country, tKey || undefined);
  const cached = getCached<WeatherSnapshot | null>(key);
  if (cached !== undefined) return cached;
  const coords = country?.trim()
    ? await geocodeCityCountry(city, country)
    : await geocodeCity(city);
  if (!coords) return null;
  const out = await getWeatherForDate(coords.lat, coords.lng, date, timeOptions);
  setCached(key, out);
  return out;
}

/** Human-readable weather line for concierge forms (single day or range). */
export function formatWeatherDisplayText(
  w: WeatherSnapshot,
  opts: { singleDay: boolean; dateLabel?: string }
): string {
  if (!opts.singleDay) {
    const period = w.period_summary ?? "";
    const avg =
      w.avg_temp_min != null && w.avg_temp_max != null
        ? ` · Avg ${w.avg_temp_min}–${w.avg_temp_max}°C`
        : "";
    const rainy =
      w.rainy_days != null && w.total_days != null
        ? ` · ${w.rainy_days} of ${w.total_days} days rainy`
        : "";
    return `${period}${avg}${rainy}`.trim();
  }
  const datePart = opts.dateLabel ?? w.date ?? "";
  const dayRange =
    w.temp_min != null && w.temp_max != null ? ` · Day ${w.temp_min}–${w.temp_max}°C` : "";
  if (w.forecast_hour && w.temp_at_time != null) {
    const precip =
      w.precipitation != null && w.precipitation > 0.1 ? ` · ${w.precipitation} mm rain` : "";
    return `${datePart} · ${w.forecast_hour}: ${w.summary ?? ""} · ${Math.round(w.temp_at_time)}°C${dayRange}${precip}`.trim();
  }
  const precip =
    w.precipitation != null && w.precipitation > 0 ? ` · ${w.precipitation} mm rain` : "";
  return `${datePart}: ${w.summary ?? ""}${dayRange}${precip}`.trim();
}

export function weatherSnapshotToConciergePayload(w: WeatherSnapshot) {
  return {
    summary: w.summary,
    temp_min: w.temp_min,
    temp_max: w.temp_max,
    temp_at_time: w.temp_at_time,
    forecast_hour: w.forecast_hour,
    precipitation: w.precipitation,
    precipitation_day: w.precipitation_day,
    date: w.date,
    period_summary: w.period_summary,
    rainy_days: w.rainy_days,
    total_days: w.total_days,
    avg_temp_min: w.avg_temp_min,
    avg_temp_max: w.avg_temp_max,
  };
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
