import {
  clampTimeOfDayToFutureIfToday,
  combineDateAndClockTime,
  filterFuturePlanOptions,
  formatLocalIsoDateTime,
  getMinimumPlanDateTime,
  isFutureIso,
  isSameCalendarDay,
  parseClockTimeFromText,
  resolveOptionClockTime,
  roundUpToNextSlot,
} from "@/lib/ai/planTimeValidation";

describe("planTimeValidation", () => {
  describe("roundUpToNextSlot / getMinimumPlanDateTime", () => {
    it("rounds up to the next 30-minute slot", () => {
      const now = new Date(2026, 0, 15, 14, 7, 0);
      const next = roundUpToNextSlot(now);
      expect(next.getHours()).toBe(14);
      expect(next.getMinutes()).toBe(30);
      expect(next.getTime()).toBeGreaterThan(now.getTime());
    });

    it("pushes to the next slot instead of staying put when already on a boundary", () => {
      const now = new Date(2026, 0, 15, 14, 30, 0);
      const next = roundUpToNextSlot(now);
      expect(next.getHours()).toBe(15);
      expect(next.getMinutes()).toBe(0);
    });

    it("getMinimumPlanDateTime is always strictly after now", () => {
      const now = new Date(2026, 0, 15, 23, 45, 0);
      const min = getMinimumPlanDateTime(now);
      expect(min.getTime()).toBeGreaterThan(now.getTime());
    });
  });

  describe("isSameCalendarDay", () => {
    it("is true for the same local day regardless of time", () => {
      expect(isSameCalendarDay(new Date(2026, 0, 15, 1, 0), new Date(2026, 0, 15, 23, 59))).toBe(true);
    });

    it("is false across midnight", () => {
      expect(isSameCalendarDay(new Date(2026, 0, 15, 23, 59), new Date(2026, 0, 16, 0, 0))).toBe(false);
    });
  });

  describe("clampTimeOfDayToFutureIfToday", () => {
    const now = new Date(2026, 0, 15, 14, 0, 0);

    it("leaves a future day's time untouched even if the clock time has 'passed' today", () => {
      const tomorrow = new Date(2026, 0, 16);
      const earlyTime = new Date(2000, 0, 1, 9, 0, 0);
      const result = clampTimeOfDayToFutureIfToday(tomorrow, earlyTime, now);
      expect(result.getHours()).toBe(9);
      expect(result.getMinutes()).toBe(0);
    });

    it("bumps a past time forward to the next valid slot when the day is today", () => {
      const today = new Date(2026, 0, 15);
      const pastTime = new Date(2000, 0, 1, 9, 0, 0);
      const result = clampTimeOfDayToFutureIfToday(today, pastTime, now);
      expect(result.getHours()).toBe(14);
      expect(result.getMinutes()).toBe(30);
    });

    it("leaves an already-future time today untouched", () => {
      const today = new Date(2026, 0, 15);
      const futureTime = new Date(2000, 0, 1, 20, 0, 0);
      const result = clampTimeOfDayToFutureIfToday(today, futureTime, now);
      expect(result.getHours()).toBe(20);
      expect(result.getMinutes()).toBe(0);
    });
  });

  describe("parseClockTimeFromText / resolveOptionClockTime", () => {
    it("parses 24h HH:mm", () => {
      expect(parseClockTimeFromText("19:00 - Dinner")).toEqual({ hour: 19, minute: 0 });
    });

    it("parses PM times without a colon", () => {
      expect(parseClockTimeFromText("7 PM")).toEqual({ hour: 19, minute: 0 });
    });

    it("parses AM times", () => {
      expect(parseClockTimeFromText("9:15 AM")).toEqual({ hour: 9, minute: 15 });
    });

    it("returns null when nothing parses", () => {
      expect(parseClockTimeFromText("sometime later")).toBeNull();
      expect(parseClockTimeFromText(undefined)).toBeNull();
    });

    it("prefers an explicit exactTimeHm over the itinerary text", () => {
      expect(
        resolveOptionClockTime({ itineraryTime: "19:00", exactTimeHm: "12:30" })
      ).toEqual({ hour: 12, minute: 30 });
    });

    it("falls back to the itinerary text when exactTimeHm is absent", () => {
      expect(resolveOptionClockTime({ itineraryTime: "8:00 PM" })).toEqual({ hour: 20, minute: 0 });
    });
  });

  describe("isFutureIso", () => {
    const now = new Date(2026, 0, 15, 12, 0, 0);

    it("is true for a future ISO timestamp", () => {
      expect(isFutureIso(new Date(2026, 0, 16).toISOString(), now)).toBe(true);
    });

    it("is false for a past ISO timestamp", () => {
      expect(isFutureIso(new Date(2026, 0, 14).toISOString(), now)).toBe(false);
    });

    it("treats a missing timestamp as not our call to police (kept)", () => {
      expect(isFutureIso(null, now)).toBe(true);
      expect(isFutureIso(undefined, now)).toBe(true);
    });
  });

  describe("filterFuturePlanOptions — the authoritative guard", () => {
    // Regression coverage for the bug this module exists to prevent: a plan suggestion whose
    // resolved start time is already in the past must never survive to be shown or saved.
    it("drops options whose resolved start is at or before now, keeps the rest", () => {
      const now = new Date(2026, 0, 15, 14, 0, 0);
      const baseDay = new Date(2026, 0, 15);
      type Option = { id: string; itinerary: { time: string }[] };
      const options: Option[] = [
        { id: "past-lunch", itinerary: [{ time: "12:00" }] }, // already elapsed today
        { id: "exactly-now", itinerary: [{ time: "14:00" }] }, // boundary: not strictly future
        { id: "future-dinner", itinerary: [{ time: "19:00" }] }, // still ahead
      ];

      const { kept, droppedCount } = filterFuturePlanOptions(
        options,
        (opt) => {
          const clock = resolveOptionClockTime({ itineraryTime: opt.itinerary[0]?.time });
          return clock ? combineDateAndClockTime(baseDay, clock.hour, clock.minute) : null;
        },
        now
      );

      expect(droppedCount).toBe(2);
      expect(kept.map((o) => o.id)).toEqual(["future-dinner"]);
    });

    it("keeps options with no resolvable time — not this guard's call to make", () => {
      const now = new Date(2026, 0, 15, 14, 0, 0);
      const baseDay = new Date(2026, 0, 15);
      type Option = { id: string; itinerary: { time: string }[] };
      const options: Option[] = [{ id: "no-time", itinerary: [{ time: "sometime" }] }];

      const { kept, droppedCount } = filterFuturePlanOptions(
        options,
        (opt) => {
          const clock = resolveOptionClockTime({ itineraryTime: opt.itinerary[0]?.time });
          return clock ? combineDateAndClockTime(baseDay, clock.hour, clock.minute) : null;
        },
        now
      );

      expect(droppedCount).toBe(0);
      expect(kept).toHaveLength(1);
    });

    it("an explicit exactTimeHm override still gets dropped when it's in the past", () => {
      const now = new Date(2026, 0, 15, 20, 0, 0);
      const baseDay = new Date(2026, 0, 15);
      type Option = { id: string; itinerary: { time: string }[] };
      const options: Option[] = [{ id: "stale-exact-time", itinerary: [{ time: "21:00" }] }];

      const { kept, droppedCount } = filterFuturePlanOptions(
        options,
        (opt) => {
          // Explicit user-chosen time (e.g. from the form) overrides the itinerary text, and it
          // has already passed even though the itinerary text alone would look future.
          const clock = resolveOptionClockTime({ itineraryTime: opt.itinerary[0]?.time, exactTimeHm: "18:00" });
          return clock ? combineDateAndClockTime(baseDay, clock.hour, clock.minute) : null;
        },
        now
      );

      expect(droppedCount).toBe(1);
      expect(kept).toHaveLength(0);
    });
  });

  describe("formatLocalIsoDateTime", () => {
    it("formats as YYYY-MM-DDTHH:mm with zero-padding", () => {
      expect(formatLocalIsoDateTime(new Date(2026, 0, 5, 9, 5, 0))).toBe("2026-01-05T09:05");
    });
  });
});
