// Weekly Spark scheduling windows: work days stay in the evening, mornings move to the weekend,
// and slots never land on top of an existing planner item.

jest.mock("@/lib/supabase", () => ({
  supabase: { auth: { getUser: jest.fn(async () => ({ data: { user: null } })) } },
}));

jest.mock("@/lib/access/planner", () => ({
  getPlannerItems: jest.fn(async () => []),
}));

import {
  pickNonConflictingSparkStart,
  resolveThemeSlot,
  sparkPlanViolatesTiming,
} from "@/lib/ai/weekendIdeasPlans";
import {
  SMART_WEEKLY_SPARK_TIMING,
  type WeeklySparkTimingPrefs,
} from "@/lib/ai/weeklySparkSettings";
import type { WeeklySparkPlan } from "@/lib/ai/weeklySpark";

const CUSTOM_ANY_TIME: WeeklySparkTimingPrefs = {
  smart: false,
  weekdayParts: ["morning", "afternoon", "evening"],
  weekendParts: ["morning", "afternoon", "evening"],
};

function planAt(iso: string): WeeklySparkPlan {
  return { id: "p", slot: "solo", rank: 0, startsAt: iso } as unknown as WeeklySparkPlan;
}

describe("resolveThemeSlot (smart timing)", () => {
  it("keeps a weekday evening theme where it is", () => {
    const slot = resolveThemeSlot({ dow: 5, hour: 19 }, SMART_WEEKLY_SPARK_TIMING);
    expect(slot).toMatchObject({ dow: 5, hour: 19 });
  });

  it("moves a weekday morning theme to the weekend instead of forcing an evening", () => {
    const slot = resolveThemeSlot({ dow: 3, hour: 11 }, SMART_WEEKLY_SPARK_TIMING);
    expect([0, 6]).toContain(slot.dow);
    expect(slot.hour).toBe(11);
  });

  it("pushes a weekday afternoon theme out of working hours", () => {
    const slot = resolveThemeSlot({ dow: 2, hour: 14 }, SMART_WEEKLY_SPARK_TIMING);
    // afternoon is allowed at the weekend, so the day moves rather than the hour
    expect([0, 6]).toContain(slot.dow);
    expect(slot.hour).toBe(14);
  });

  it("does not put two themes in the same day+hour", () => {
    const used = new Set<string>();
    const a = resolveThemeSlot({ dow: 3, hour: 11 }, SMART_WEEKLY_SPARK_TIMING, used);
    const b = resolveThemeSlot({ dow: 1, hour: 11 }, SMART_WEEKLY_SPARK_TIMING, used);
    expect(`${a.dow}-${a.hour}`).not.toBe(`${b.dow}-${b.hour}`);
  });

  it("respects custom windows that allow anything", () => {
    const slot = resolveThemeSlot({ dow: 3, hour: 11 }, CUSTOM_ANY_TIME);
    expect(slot).toMatchObject({ dow: 3, hour: 11 });
  });

  it("shifts the hour when the daypart is banned on every day", () => {
    const eveningsOnly: WeeklySparkTimingPrefs = {
      smart: false,
      weekdayParts: ["evening"],
      weekendParts: ["evening"],
    };
    const slot = resolveThemeSlot({ dow: 6, hour: 11 }, eveningsOnly);
    expect(slot.hour).toBeGreaterThanOrEqual(17);
  });
});

describe("sparkPlanViolatesTiming", () => {
  it("flags a cron plan on a weekday morning under smart timing", () => {
    // 2026-08-05 is a Wednesday
    expect(sparkPlanViolatesTiming(planAt("2026-08-05T09:30:00"), SMART_WEEKLY_SPARK_TIMING)).toBe(true);
  });

  it("accepts a weekday evening and a weekend morning", () => {
    expect(sparkPlanViolatesTiming(planAt("2026-08-05T19:00:00"), SMART_WEEKLY_SPARK_TIMING)).toBe(false);
    // 2026-08-08 is a Saturday
    expect(sparkPlanViolatesTiming(planAt("2026-08-08T10:00:00"), SMART_WEEKLY_SPARK_TIMING)).toBe(false);
  });
});

describe("pickNonConflictingSparkStart", () => {
  it("stays inside the allowed hours and skips a busy block", () => {
    const from = new Date(2026, 7, 3, 9, 0, 0); // Mon 3 Aug 2026
    const friday19 = new Date(2026, 7, 7, 19, 0, 0);
    const busy = [
      {
        starts_at: friday19.toISOString(),
        ends_at: new Date(friday19.getTime() + 2 * 60 * 60 * 1000).toISOString(),
      },
    ];
    const start = pickNonConflictingSparkStart(5, 19, busy, from, [19, 18, 20, 17]);
    expect(start.getDay()).toBe(5);
    expect([17, 18, 20]).toContain(start.getHours());
  });

  it("ignores a legacy item with no end time beyond a normal outing length", () => {
    const from = new Date(2026, 7, 3, 9, 0, 0);
    const busy = [{ starts_at: new Date(2026, 2, 12, 18, 0, 0).toISOString(), ends_at: null }];
    const start = pickNonConflictingSparkStart(5, 19, busy, from, [19, 18, 20, 17]);
    expect(start.getHours()).toBe(19);
  });
});
