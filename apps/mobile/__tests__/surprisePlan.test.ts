// "Surprise me": server decision logic (shared, import-free module used by ai-gateway) and the
// client helpers that build the request and guard/render the three options.

import {
  addDays,
  hmToMinutes,
  isColdStart,
  isWetWeather,
  normalizeSurpriseOptions,
  pickSurpriseSlots,
  resolveLocalNow,
  shiftItinerary,
  summarizeSurpriseSignals,
  SURPRISE_MIN_LEAD_MINUTES,
  weatherLineForDate,
  weekdayOf,
  type LocalNow,
} from "../../../supabase/functions/_shared/surprise/surprise";

import {
  buildSurpriseContext,
  futureSurpriseOptions,
  parseSurpriseOptions,
  surpriseOptionStart,
  surpriseToPlannerPlan,
  type SurprisePlanOption,
} from "@/lib/ai/surprisePlan";

const now = (date: string, hour: number, minute = 0): LocalNow => ({ date, hour, minute, weekday: weekdayOf(date) });

// 2026-09-22 is a Tuesday.
const TUESDAY = "2026-09-22";

describe("calendar helpers", () => {
  it("adds days across month and year boundaries", () => {
    expect(addDays("2026-09-30", 1)).toBe("2026-10-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(weekdayOf(TUESDAY)).toBe(2);
  });

  it("parses HH:mm strictly", () => {
    expect(hmToMinutes("19:30")).toBe(19 * 60 + 30);
    expect(hmToMinutes("24:00")).toBeNull();
    expect(hmToMinutes("7pm")).toBeNull();
  });
});

describe("resolveLocalNow", () => {
  const serverNow = Date.UTC(2026, 8, 22, 12, 0); // 12:00 UTC

  it("trusts a plausible client wall clock", () => {
    const n = resolveLocalNow({ currentDateTimeLocal: "2026-09-22T14:05", timezone: "Europe/Berlin", nowMs: serverNow });
    expect(n).toEqual({ date: TUESDAY, hour: 14, minute: 5, weekday: 2 });
  });

  it("falls back to the time zone when the client clock is far off", () => {
    const n = resolveLocalNow({ currentDateTimeLocal: "2020-01-01T09:00", timezone: "Europe/Berlin", nowMs: serverNow });
    expect(n.date).toBe(TUESDAY);
    expect(n.hour).toBe(14); // CEST = UTC+2
  });

  it("falls back to UTC for garbage input", () => {
    const n = resolveLocalNow({ currentDateTimeLocal: 42, timezone: "Not/AZone", nowMs: serverNow });
    expect(n).toEqual({ date: TUESDAY, hour: 12, minute: 0, weekday: 2 });
  });
});

describe("pickSurpriseSlots", () => {
  it("gives three vibes on three different days (Tuesday morning)", () => {
    const slots = pickSurpriseSlots(now(TUESDAY, 10));
    expect(slots.map((s) => s.vibe)).toEqual(["cosy", "active", "social"]);
    expect(slots[0]).toMatchObject({ date: TUESDAY, start: "19:00", label: "Today evening" });
    expect(slots[1]).toMatchObject({ date: "2026-09-26", start: "10:30", label: "Saturday daytime" });
    expect(slots[2]).toMatchObject({ date: "2026-09-25", start: "19:30", label: "Friday evening" });
    expect(new Set(slots.map((s) => s.date)).size).toBe(3);
  });

  it("moves an evening that's too close to the next suitable day", () => {
    // Friday 20:30: tonight's cosy/social windows are gone.
    const slots = pickSurpriseSlots(now("2026-09-25", 20, 30));
    expect(slots.every((s) => s.date > "2026-09-25")).toBe(true);
    expect(new Set(slots.map((s) => s.date)).size).toBe(3);
    expect(slots[0]).toMatchObject({ vibe: "cosy", date: "2026-09-26", label: "Tomorrow evening" });
  });

  it("prefers the vibe's favourite weekday over a nearer fallback day", () => {
    // Tuesday: Thursday is nearer, but Friday is the social night.
    const social = pickSurpriseSlots(now(TUESDAY, 10))[2];
    expect(social.label).toBe("Friday evening");
  });

  it("pushes a same-day start past the lead time", () => {
    // Tuesday 17:00 → earliest acceptable start is 18:30, default 19:00 still fits.
    const [cosy] = pickSurpriseSlots(now(TUESDAY, 17));
    expect(cosy.date).toBe(TUESDAY);
    expect(cosy.earliest).toBe("18:30");
    expect(cosy.start).toBe("19:00");
  });

  it("never returns a slot that starts too soon, at any hour of any weekday", () => {
    for (let d = 0; d < 7; d++) {
      const date = addDays(TUESDAY, d);
      for (let h = 0; h < 24; h++) {
        for (const m of [0, 45]) {
          const n = now(date, h, m);
          const nowMin = h * 60 + m;
          for (const s of pickSurpriseSlots(n)) {
            expect(s.date >= date).toBe(true);
            if (s.date === date) {
              expect(hmToMinutes(s.start)!).toBeGreaterThanOrEqual(nowMin + SURPRISE_MIN_LEAD_MINUTES);
              expect(hmToMinutes(s.earliest)!).toBeGreaterThanOrEqual(nowMin + SURPRISE_MIN_LEAD_MINUTES);
            }
            expect(hmToMinutes(s.start)!).toBeLessThanOrEqual(hmToMinutes(s.latest)!);
          }
        }
      }
    }
  });
});

describe("summarizeSurpriseSignals", () => {
  it("is empty for a brand-new user (cold start)", () => {
    const s = summarizeSurpriseSignals({ interests: [], hobbies: [], wishlist: [], reviews: [] });
    expect(isColdStart(s)).toBe(true);
  });

  it("dedupes interests and splits reviews into loved / disliked", () => {
    const s = summarizeSurpriseSignals({
      interests: ["Jazz", "jazz", " Hiking "],
      hobbies: [],
      wishlist: ["Try the rooftop cinema"],
      reviews: [
        { rating: 5, activity_type: "dinner", venue: "Luigi's" },
        { rating: 2, activity_type: "karaoke", venue: null },
        { rating: 3, would_repeat: true, activity_type: "bouldering" },
      ],
    });
    expect(s.interests).toEqual(["Jazz", "Hiking"]);
    expect(s.wishlist_not_done_yet).toEqual(["Try the rooftop cinema"]);
    expect(s.recently_loved).toEqual(["dinner @ Luigi's", "bouldering"]);
    expect(s.recently_disliked).toEqual(["karaoke"]);
    expect(isColdStart(s)).toBe(false);
  });
});

describe("weather", () => {
  const daily = {
    time: ["2026-09-22", "2026-09-23"],
    weathercode: [61, 1],
    temperature_2m_max: [14.4, 21],
    temperature_2m_min: [8.6, 11],
    precipitation_sum: [6.2, 0],
  };

  it("summarizes one day and flags wet weather", () => {
    const wet = weatherLineForDate(daily, "2026-09-22");
    expect(wet).toBe("rain, 9–14°C, 6 mm precipitation");
    expect(isWetWeather(wet)).toBe(true);
    const dry = weatherLineForDate(daily, "2026-09-23");
    expect(dry).toBe("clear, 11–21°C");
    expect(isWetWeather(dry)).toBe(false);
  });

  it("returns null outside the forecast", () => {
    expect(weatherLineForDate(daily, "2026-10-30")).toBeNull();
    expect(weatherLineForDate(null, "2026-09-22")).toBeNull();
  });
});

describe("normalizeSurpriseOptions", () => {
  const slots = pickSurpriseSlots(now(TUESDAY, 10));
  const opt = (venue: string, times: string[]) => ({
    title: `${venue} plan`,
    venue: { name: venue },
    itinerary: times.map((time, i) => ({ time, description: `step ${i}` })),
  });

  it("pins each option to its vibe's slot and letters them A/B/C", () => {
    const { options, missing } = normalizeSurpriseOptions(
      [
        { vibe: "social", option: opt("Night Market", ["19:45"]) },
        { vibe: "cosy", option: opt("Wine Bar", ["19:00", "20:30"]) },
        { vibe: "active", option: opt("Climbing Hall", ["11:00"]) },
      ],
      slots,
    );
    expect(missing).toEqual([]);
    expect(options.map((o) => [o.option_id, o.vibe, o.venue.name])).toEqual([
      ["A", "cosy", "Wine Bar"],
      ["B", "active", "Climbing Hall"],
      ["C", "social", "Night Market"],
    ]);
    expect(options[0]).toMatchObject({ date: slots[0].date, start_time: "19:00" });
    expect(options[1]).toMatchObject({ date: slots[1].date, start_time: "11:00" });
  });

  it("shifts an itinerary that starts outside the window, keeping the gaps", () => {
    const { options } = normalizeSurpriseOptions([{ vibe: "cosy", option: opt("Café", ["09:00", "10:15"]) }], slots);
    expect(options[0].start_time).toBe(slots[0].start);
    expect(options[0].itinerary.map((s) => s.time)).toEqual(["19:00", "20:15"]);
  });

  it("refuses a repeated venue and reports the vibe as missing", () => {
    const { options, missing } = normalizeSurpriseOptions(
      [
        { vibe: "cosy", option: opt("Same Place", ["19:00"]) },
        { vibe: "active", option: opt("same place!", ["10:30"]) },
      ],
      slots,
    );
    expect(options.map((o) => o.vibe)).toEqual(["cosy"]);
    expect(missing).toEqual(["active", "social"]);
  });

  it("assigns options without a usable vibe to the free vibes in order", () => {
    const { options } = normalizeSurpriseOptions(
      [
        { vibe: "cozy", option: opt("Bookshop Café", ["19:00"]) },
        { vibe: "??", option: opt("Park Run", ["10:30"]) },
        { vibe: undefined, option: opt("Quiz Pub", ["20:00"]) },
      ],
      slots,
    );
    expect(options.map((o) => [o.vibe, o.venue.name])).toEqual([
      ["cosy", "Bookshop Café"],
      ["active", "Park Run"],
      ["social", "Quiz Pub"],
    ]);
  });

  it("gives a step-less option a single step at the slot start", () => {
    const { options } = normalizeSurpriseOptions([{ vibe: "social", option: opt("Food Hall", []) }], slots);
    expect(options[0].itinerary).toEqual([{ time: slots[2].start, description: "Food Hall plan" }]);
  });
});

describe("shiftItinerary", () => {
  it("leaves unparseable steps alone", () => {
    expect(
      shiftItinerary(
        [
          { time: "18:00", description: "a" },
          { time: "later", description: "b" },
        ],
        "19:30",
      ),
    ).toEqual([
      { time: "19:30", description: "a" },
      { time: "later", description: "b" },
    ]);
  });
});

// ── Client ────────────────────────────────────────────────────────────────────

const raw = (over: Partial<SurprisePlanOption> & Record<string, unknown> = {}) => ({
  option_id: "A",
  vibe: "cosy",
  date: "2026-09-22",
  start_time: "19:00",
  character_label: "Cosy",
  title: "Wine and small plates",
  why_this_fits: "You love wine bars.",
  fit_reason: "You saved this wine bar.",
  itinerary: [{ time: "19:00", description: "Wine" }],
  venue: { name: "Weinbar", address: "Street 1", google_maps_link: "https://maps.example", estimated_cost: "€20–30" },
  weather_note: "Dry evening.",
  duration_minutes: 120,
  ...over,
});

describe("buildSurpriseContext", () => {
  it("sends location + clock and never a user prompt", () => {
    const ctx = buildSurpriseContext({
      mode: "friends",
      city: " Munich ",
      country: "",
      now: new Date(2026, 8, 22, 9, 5),
      timezone: "Europe/Berlin",
      appLanguage: "de",
    });
    expect(ctx).toMatchObject({
      mode: "friends",
      surprise: true,
      city: "Munich",
      current_datetime_local: "2026-09-22T09:05",
      timezone: "Europe/Berlin",
      app_language: "de",
    });
    expect(ctx).not.toHaveProperty("country");
    expect(ctx).not.toHaveProperty("user_prompt");
    expect(ctx).not.toHaveProperty("activity_hint");
  });
});

describe("parseSurpriseOptions", () => {
  it("keeps valid options in vibe order and drops broken ones", () => {
    const out = parseSurpriseOptions([
      raw({ vibe: "social", option_id: "C", venue: { name: "Market" } as SurprisePlanOption["venue"] }),
      raw({ vibe: "cosy" }),
      raw({ vibe: "cosy", title: "duplicate vibe" }),
      raw({ vibe: "active", date: "Saturday" }),
      raw({ vibe: "active", venue: { name: "" } as SurprisePlanOption["venue"] }),
      "nonsense",
    ]);
    expect(out.map((o) => o.vibe)).toEqual(["cosy", "social"]);
    expect(out[1].venue).toEqual({ name: "Market", address: "", google_maps_link: "", estimated_cost: "" });
  });

  it("returns [] for a non-array", () => {
    expect(parseSurpriseOptions(undefined)).toEqual([]);
  });
});

describe("future guard", () => {
  it("reads the local start and drops anything not strictly in the future", () => {
    const opts = parseSurpriseOptions([
      raw({ vibe: "cosy", date: "2026-09-22", start_time: "19:00" }),
      raw({ vibe: "active", date: "2026-09-26", start_time: "10:30", venue: { name: "Hall" } as SurprisePlanOption["venue"] }),
    ]);
    expect(surpriseOptionStart(opts[0])).toEqual(new Date(2026, 8, 22, 19, 0));
    const at1900 = new Date(2026, 8, 22, 19, 0);
    expect(futureSurpriseOptions(opts, at1900).map((o) => o.vibe)).toEqual(["active"]);
    expect(futureSurpriseOptions(opts, new Date(2026, 8, 22, 12, 0))).toHaveLength(2);
  });
});

describe("surpriseToPlannerPlan", () => {
  it("keeps venue + id and synthesizes a step when the itinerary is empty", () => {
    const [opt] = parseSurpriseOptions([raw({ itinerary: [] })]);
    const plan = surpriseToPlannerPlan(opt);
    expect(plan.option_id).toBe("A");
    expect(plan.venue.name).toBe("Weinbar");
    expect(plan.itinerary).toEqual([{ time: "19:00", description: "Wine and small plates" }]);
  });
});
