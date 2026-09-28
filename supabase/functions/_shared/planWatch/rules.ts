// ─────────────────────────────────────────────────────────────────────────────
// When is a plan "affected" by weather or traffic? Pure rules used by plan-watch-cron and
// tested from the mobile Jest suite (apps/mobile/__tests__/planWatchRules.test.ts).
//
// The aim is few, useful alerts: only conditions that would really change a plan, and
// light rain / heat / cold only for plans that are clearly outdoors.
// ─────────────────────────────────────────────────────────────────────────────

export type WeatherCondition = "rain" | "heavy_rain" | "storm" | "snow" | "heat" | "cold";

/** One hour of Open-Meteo `hourly` data. */
export type HourlyWeather = {
  time: string; // ISO (UTC)
  precipitation?: number | null; // mm in that hour
  precipitationProbability?: number | null; // %
  weatherCode?: number | null; // WMO code
  temperature?: number | null; // °C
};

export type WeatherAssessment = { condition: WeatherCondition; severity: number; atIso: string };

const OUTDOOR_WORDS = [
  "outdoor", "open air", "open-air", "park", "garden", "picnic", "hike", "hiking", "walk", "beach", "lake",
  "biergarten", "beer garden", "rooftop", "terrace", "festival", "market", "bike", "cycling", "run", "running",
  "kayak", "boat", "zoo", "draußen", "wandern", "spaziergang", "see", "freibad", "terrasse", "dachterrasse",
  "boules", "golf", "tennis", "football", "fußball", "stadium", "stadion", "camping", "bbq", "grill",
];

/** Plan text (title, place, notes) mentions something that happens outdoors. */
export function isOutdoorPlan(text: string | null | undefined): boolean {
  const t = ` ${(text ?? "").toLowerCase()} `;
  return OUTDOOR_WORDS.some((w) => t.includes(w.length <= 4 ? ` ${w} ` : w));
}

function inWindow(h: HourlyWeather, startMs: number, endMs: number): boolean {
  const t = Date.parse(h.time);
  // The hour that contains the start counts too.
  return !Number.isNaN(t) && t + 3600_000 > startMs && t < endMs;
}

/**
 * The most severe condition during the plan (start → end, default 2 h), or null.
 * Severity 0–100; callers alert from ~40 up.
 */
export function assessWeather(
  hourly: HourlyWeather[],
  plan: { startsAt: string; endsAt?: string | null; outdoor: boolean },
): WeatherAssessment | null {
  const startMs = Date.parse(plan.startsAt);
  if (Number.isNaN(startMs)) return null;
  const endParsed = plan.endsAt ? Date.parse(plan.endsAt) : NaN;
  const endMs = Number.isNaN(endParsed) || endParsed <= startMs ? startMs + 2 * 3600_000 : endParsed;

  let best: WeatherAssessment | null = null;
  const consider = (condition: WeatherCondition, severity: number, atIso: string) => {
    if (!best || severity > best.severity) best = { condition, severity, atIso };
  };

  for (const h of hourly) {
    if (!inWindow(h, startMs, endMs)) continue;
    const code = h.weatherCode ?? 0;
    const precip = h.precipitation ?? 0;
    const prob = h.precipitationProbability ?? (precip > 0 ? 70 : 0);
    const temp = h.temperature;

    if ([95, 96, 99].includes(code) && prob >= 40) consider("storm", 85, h.time);
    if (([71, 73, 75, 77, 85, 86].includes(code) && precip >= 0.5) || (code >= 71 && code <= 77 && prob >= 60)) {
      consider("snow", code >= 75 ? 70 : 55, h.time);
    }
    if (precip >= 4 || ([65, 82].includes(code) && prob >= 60)) consider("heavy_rain", 70, h.time);
    if (plan.outdoor) {
      if (prob >= 60 && precip >= 0.3) consider("rain", 45, h.time);
      if (typeof temp === "number" && temp >= 33) consider("heat", 50, h.time);
      if (typeof temp === "number" && temp <= -10) consider("cold", 50, h.time);
    }
  }
  return best;
}

export type TrafficAssessment = { extraMinutes: number; leaveByIso: string };

/**
 * Traffic worth a heads-up: at least 15 min AND 30 % slower than usual. Returns when to
 * leave (arrival 5 min early) and how many extra minutes to expect.
 */
export function assessTraffic(input: {
  startsAt: string;
  normalSeconds: number;
  inTrafficSeconds: number;
  nowMs?: number;
}): TrafficAssessment | null {
  const start = Date.parse(input.startsAt);
  if (Number.isNaN(start) || input.normalSeconds <= 0 || input.inTrafficSeconds <= 0) return null;
  const extra = input.inTrafficSeconds - input.normalSeconds;
  if (extra < 15 * 60 || input.inTrafficSeconds < input.normalSeconds * 1.3) return null;
  const leaveBy = start - input.inTrafficSeconds * 1000 - 5 * 60_000;
  const now = input.nowMs ?? Date.now();
  return {
    extraMinutes: Math.round(extra / 60),
    leaveByIso: new Date(Math.max(leaveBy, now)).toISOString(),
  };
}

/** Plans the watcher looks at: weather up to 48 h ahead, traffic 30–150 min before start. */
export function watchWindows(startsAt: string, nowMs = Date.now()): { weather: boolean; traffic: boolean } {
  const start = Date.parse(startsAt);
  if (Number.isNaN(start) || start <= nowMs) return { weather: false, traffic: false };
  const mins = (start - nowMs) / 60_000;
  return { weather: mins <= 48 * 60, traffic: mins >= 30 && mins <= 150 };
}
