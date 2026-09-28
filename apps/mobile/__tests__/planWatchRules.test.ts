// Weather / traffic rules for plan alerts, and the localized push texts they produce.

import {
  assessTraffic,
  assessWeather,
  isOutdoorPlan,
  watchWindows,
} from "../../../supabase/functions/_shared/planWatch/rules";
import {
  PLAN_NOTIFY_LOCALES,
  planAlertPush,
  planChangePush,
} from "../../../supabase/functions/_shared/planNotify/messages";

const start = "2026-10-04T17:00:00Z";
const hour = (h: number, extra: Record<string, number>) => ({
  time: `2026-10-04T${String(h).padStart(2, "0")}:00:00Z`,
  ...extra,
});

describe("isOutdoorPlan", () => {
  it("spots outdoor plans", () => {
    expect(isOutdoorPlan("Picnic in the English Garden")).toBe(true);
    expect(isOutdoorPlan("Biergarten am Chinesischen Turm")).toBe(true);
    expect(isOutdoorPlan("Dinner at Tantris")).toBe(false);
  });
});

describe("assessWeather", () => {
  it("flags a thunderstorm during any plan", () => {
    const r = assessWeather([hour(17, { weatherCode: 95, precipitationProbability: 70 })], { startsAt: start, outdoor: false });
    expect(r).toMatchObject({ condition: "storm", severity: 85 });
  });

  it("flags light rain only for outdoor plans", () => {
    const hourly = [hour(18, { precipitation: 1, precipitationProbability: 80, weatherCode: 61 })];
    expect(assessWeather(hourly, { startsAt: start, outdoor: false })).toBeNull();
    expect(assessWeather(hourly, { startsAt: start, outdoor: true })?.condition).toBe("rain");
  });

  it("flags heavy rain indoors too, and picks the worst hour", () => {
    const r = assessWeather(
      [hour(17, { precipitation: 1, precipitationProbability: 80 }), hour(18, { precipitation: 6, precipitationProbability: 90 })],
      { startsAt: start, outdoor: true }
    );
    expect(r).toMatchObject({ condition: "heavy_rain", atIso: "2026-10-04T18:00:00Z" });
  });

  it("ignores weather outside the plan window", () => {
    const r = assessWeather([hour(10, { weatherCode: 95, precipitationProbability: 90 })], { startsAt: start, outdoor: true });
    expect(r).toBeNull();
  });

  it("flags heat and cold for outdoor plans", () => {
    expect(assessWeather([hour(17, { temperature: 35 })], { startsAt: start, outdoor: true })?.condition).toBe("heat");
    expect(assessWeather([hour(17, { temperature: -12 })], { startsAt: start, outdoor: true })?.condition).toBe("cold");
  });
});

describe("assessTraffic", () => {
  const now = Date.parse("2026-10-04T15:30:00Z");
  it("alerts on a real delay and says when to leave", () => {
    const r = assessTraffic({ startsAt: start, normalSeconds: 20 * 60, inTrafficSeconds: 45 * 60, nowMs: now });
    expect(r).toEqual({ extraMinutes: 25, leaveByIso: "2026-10-04T16:10:00.000Z" });
  });
  it("stays quiet for small delays", () => {
    expect(assessTraffic({ startsAt: start, normalSeconds: 60 * 60, inTrafficSeconds: 72 * 60, nowMs: now })).toBeNull();
    expect(assessTraffic({ startsAt: start, normalSeconds: 10 * 60, inTrafficSeconds: 20 * 60, nowMs: now })).toBeNull();
  });
});

describe("watchWindows", () => {
  const now = Date.parse("2026-10-04T15:30:00Z");
  it("checks weather up to 48h ahead and traffic 30–150 min before", () => {
    expect(watchWindows(start, now)).toEqual({ weather: true, traffic: true });
    expect(watchWindows("2026-10-07T17:00:00Z", now)).toEqual({ weather: false, traffic: false });
    expect(watchWindows("2026-10-04T15:40:00Z", now)).toEqual({ weather: true, traffic: false });
  });
});

describe("push texts", () => {
  it("covers all 26 app languages", () => {
    expect(PLAN_NOTIFY_LOCALES).toHaveLength(26);
  });

  it("writes the change in the recipient's language and time zone, with the reason", () => {
    const de = planChangePush({
      kind: "rescheduled",
      locale: "de",
      timeZone: "Europe/Berlin",
      actorName: "Anna",
      title: "Dinner",
      newStartsAt: "2026-10-04T17:30:00Z",
      reason: "Stau auf der A9",
    });
    expect(de.title).toBe("Plan verschoben");
    expect(de.body).toContain("Anna hat „Dinner“ auf");
    expect(de.body).toContain("19:30");
    expect(de.body).toContain("„") ;
    expect(de.body).toContain("Stau auf der A9");
  });

  it("falls back to English and leaves no placeholders anywhere", () => {
    for (const locale of [...PLAN_NOTIFY_LOCALES, "xx"]) {
      for (const kind of ["cancelled", "cant_make_it", "rescheduled", "restored", "heads_up"] as const) {
        const p = planChangePush({ kind, locale, title: "T", actorName: "A", newStartsAt: start });
        expect(`${p.title}${p.body}`).not.toMatch(/\{\w+\}/);
      }
      const w = planAlertPush({ kind: "weather", locale, title: "T", condition: "storm", atIso: start });
      const tr = planAlertPush({ kind: "traffic", locale, title: "T", extraMinutes: 20, leaveByIso: start });
      expect(`${w.title}${w.body}${tr.title}${tr.body}`).not.toMatch(/\{\w+\}/);
    }
  });
});
