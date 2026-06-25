// weeklySpark — now DB-backed (reads weekly_sparks / weekly_spark_plans). We mock @/lib/supabase
// with a controllable chainable builder: every chain method returns the builder, and the terminal
// (await or .maybeSingle()) resolves to the next queued { data, error }. Names are mock-prefixed so
// jest allows them inside the hoisted factory.
const mockCalls: { table: string; method: string; args: unknown[] }[] = [];
const mockResultQueue: { data: unknown; error: unknown }[] = [];
const mockIsWeekendIdeasPeriod = jest.fn<boolean, []>();

jest.mock("@/lib/ai/proactiveSuggestion", () => ({
  isWeekendIdeasPeriod: () => mockIsWeekendIdeasPeriod(),
}));

jest.mock("@/lib/supabase", () => {
  const builderFor = (table: string) => {
    const next = () => mockResultQueue.shift() ?? { data: null, error: null };
    const b: Record<string, unknown> = {};
    const record = (method: string) => (...args: unknown[]) => {
      mockCalls.push({ table, method, args });
      return b;
    };
    for (const m of ["select", "insert", "update", "delete", "eq", "is", "or", "order", "limit"]) {
      b[m] = record(m);
    }
    b.maybeSingle = (...args: unknown[]) => {
      mockCalls.push({ table, method: "maybeSingle", args });
      return Promise.resolve(next());
    };
    // Thenable so `await <builder>` (queries that don't end in maybeSingle) resolves to a result.
    (b as { then: unknown }).then = (onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) =>
      Promise.resolve(next()).then(onF, onR);
    return b;
  };
  return { supabase: { from: (table: string) => builderFor(table) } };
});

import {
  getWeeklySparkWeekKey,
  isWeeklySparkAvailable,
  hasUnseenWeeklySpark,
  markWeeklySparkSeen,
  getCurrentWeeklySpark,
  distanceKm,
  WEEKLY_SPARK_LABEL_KEY,
  WEEKLY_SPARK_FOCUS_PARAM,
  WEEKLY_SPARK_FOCUS_VALUE,
} from "@/lib/ai/weeklySpark";

/** Monday on/after the given date. */
function mondayOnOrAfter(d: Date): Date {
  const x = new Date(d);
  while (x.getDay() !== 1) x.setDate(x.getDate() + 1);
  return x;
}

describe("weeklySpark", () => {
  beforeEach(() => {
    mockCalls.length = 0;
    mockResultQueue.length = 0;
    mockIsWeekendIdeasPeriod.mockReset();
    mockIsWeekendIdeasPeriod.mockReturnValue(false);
  });

  describe("getWeeklySparkWeekKey", () => {
    it("anchors to Monday and is stable across the whole Mon–Sun week", () => {
      const monday = mondayOnOrAfter(new Date(2026, 5, 1));
      const keys = new Set<string>();
      for (let i = 0; i < 7; i++) {
        const d = new Date(monday);
        d.setDate(monday.getDate() + i);
        keys.add(getWeeklySparkWeekKey(d));
      }
      expect(keys.size).toBe(1);
      const key = [...keys][0];
      expect(key).toBe(`${monday.getFullYear()}-${monday.getMonth() + 1}-${monday.getDate()}`);
      const [y, m, day] = key.split("-").map(Number);
      expect(new Date(y, m - 1, day).getDay()).toBe(1); // parses back to a Monday
    });

    it("yields a different key the following week", () => {
      const monday = mondayOnOrAfter(new Date(2026, 5, 1));
      const nextMonday = new Date(monday);
      nextMonday.setDate(monday.getDate() + 7);
      expect(getWeeklySparkWeekKey(monday)).not.toBe(getWeeklySparkWeekKey(nextMonday));
    });
  });

  describe("isWeeklySparkAvailable", () => {
    it("mirrors the weekend-ideas window", () => {
      mockIsWeekendIdeasPeriod.mockReturnValue(true);
      expect(isWeeklySparkAvailable()).toBe(true);
      mockIsWeekendIdeasPeriod.mockReturnValue(false);
      expect(isWeeklySparkAvailable()).toBe(false);
    });
  });

  describe("hasUnseenWeeklySpark", () => {
    // Coupled to the SAME source the Planner renders (getCurrentWeeklySpark): unseen + live + has
    // plans. First queued result = the spark row (maybeSingle); second = its plans (awaited).
    it("is true when an unseen, live spark with plans exists", async () => {
      mockResultQueue.push({
        data: { id: "s1", week_start: "2026-06-22", seen_at: null, expires_at: null },
        error: null,
      });
      mockResultQueue.push({ data: [{ id: "p1", slot: "solo", rank: 0, title: "x", fit_reason: "y" }], error: null });
      await expect(hasUnseenWeeklySpark()).resolves.toBe(true);
    });

    it("is false once the spark has been seen", async () => {
      mockResultQueue.push({
        data: { id: "s1", week_start: "2026-06-22", seen_at: "2026-06-22T10:00:00Z", expires_at: null },
        error: null,
      });
      mockResultQueue.push({ data: [{ id: "p1", slot: "solo", rank: 0, title: "x", fit_reason: "y" }], error: null });
      await expect(hasUnseenWeeklySpark()).resolves.toBe(false);
    });

    it("is false when the spark has no plans (never points at an empty section)", async () => {
      mockResultQueue.push({
        data: { id: "s1", week_start: "2026-06-22", seen_at: null, expires_at: null },
        error: null,
      });
      mockResultQueue.push({ data: [], error: null });
      await expect(hasUnseenWeeklySpark()).resolves.toBe(false);
    });

    it("is false when there is no live spark", async () => {
      mockResultQueue.push({ data: null, error: null });
      await expect(hasUnseenWeeklySpark()).resolves.toBe(false);
    });

    it("is false on a query error (never cries wolf)", async () => {
      mockResultQueue.push({ data: null, error: { message: "boom" } });
      await expect(hasUnseenWeeklySpark()).resolves.toBe(false);
    });
  });

  describe("markWeeklySparkSeen", () => {
    it("updates seen_at on the user's live spark", async () => {
      mockResultQueue.push({ data: null, error: null });
      await markWeeklySparkSeen();
      const upd = mockCalls.find((c) => c.table === "weekly_sparks" && c.method === "update");
      expect(upd).toBeTruthy();
      expect((upd?.args[0] as { seen_at?: string }).seen_at).toEqual(expect.any(String));
    });
  });

  describe("getCurrentWeeklySpark", () => {
    it("returns null when there is no live spark", async () => {
      mockResultQueue.push({ data: null, error: null }); // weekly_sparks maybeSingle
      await expect(getCurrentWeeklySpark()).resolves.toBeNull();
    });

    it("maps the spark + its plans, including a sponsor disclosure label", async () => {
      mockResultQueue.push({
        data: { id: "s1", week_start: "2026-06-22", seen_at: null, expires_at: null },
        error: null,
      });
      mockResultQueue.push({
        data: [
          {
            id: "p1",
            slot: "date",
            rank: 0,
            title: "Wine bar near you",
            fit_reason: "Matches your love of wine",
            place_id: "gp1",
            place_name: "Test Wine Bar",
            place_lat: 48.13,
            place_lng: 11.58,
            starts_at: "2026-06-26T17:30:00Z",
            ends_at: "2026-06-26T19:30:00Z",
            approx_price_cents: 2000,
            currency: "EUR",
            booking_url: "https://example.com",
            source: "sponsored",
            sponsored: true,
            external_ref: null,
            sponsor: { disclosure_label: "Partner pick" },
          },
        ],
        error: null,
      });

      const spark = await getCurrentWeeklySpark();
      expect(spark).not.toBeNull();
      expect(spark?.id).toBe("s1");
      expect(spark?.plans).toHaveLength(1);
      const plan = spark!.plans[0];
      expect(plan.slot).toBe("date");
      expect(plan.placeName).toBe("Test Wine Bar");
      expect(plan.approxPriceCents).toBe(2000);
      expect(plan.sponsored).toBe(true);
      expect(plan.sponsorDisclosureLabel).toBe("Partner pick");
    });
  });

  describe("distanceKm", () => {
    it("is ~0 for identical points and positive for distinct ones", () => {
      expect(distanceKm(48.137, 11.575, 48.137, 11.575)).toBeCloseTo(0, 5);
      // Munich centre → Marienplatz-ish, a few km.
      expect(distanceKm(48.137, 11.575, 48.10, 11.60)).toBeGreaterThan(1);
    });
  });

  it("exposes stable shared constants for label, focus param, and value", () => {
    expect(WEEKLY_SPARK_LABEL_KEY).toBe("weeklySpark.label");
    expect(WEEKLY_SPARK_FOCUS_PARAM).toBe("spark");
    expect(WEEKLY_SPARK_FOCUS_VALUE).toBe("1");
  });
});
