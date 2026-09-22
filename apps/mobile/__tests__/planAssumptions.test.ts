import {
  ASSUMPTION_DETAILS_SECTION,
  ASSUMPTION_FIELDS,
  assumptionFromDetails,
  assumptionToDetailsPatch,
  mergePinnedAssumptions,
  parseBudgetValue,
  parsePlanAssumptions,
  parseSettingValue,
  parseWhenValue,
  pinnedContextFromDetails,
  planDayFromAssumptions,
  timeOfDayForHour,
} from "@/lib/ai/planAssumptions";
import { getPlanItChips, normalizePlanItRequest, planItExampleKey } from "@/lib/ai/planIt";

// Wednesday 2026-09-23, 14:10 local.
const NOW = new Date(2026, 8, 23, 14, 10, 0);

describe("parsePlanAssumptions", () => {
  it("parses the gateway shape into canonical order", () => {
    const out = parsePlanAssumptions(
      [
        { field: "area", label: "Maxvorstadt", value: "Maxvorstadt" },
        { field: "when", label: "Sat evening", value: "2026-09-26T19:00" },
        { field: "budget", label: "~€30 p.p.", value: "30 EUR" },
        { field: "setting", label: "Indoors", value: "indoor" },
      ],
      NOW
    );
    expect(out.map((a) => a.field)).toEqual(["when", "budget", "setting", "area"]);
    expect(out[0]).toEqual({ field: "when", label: "Sat evening", value: "2026-09-26T19:00" });
    expect(out[1].value).toBe("30 EUR");
  });

  it("returns [] for non-array / garbage input", () => {
    expect(parsePlanAssumptions(undefined, NOW)).toEqual([]);
    expect(parsePlanAssumptions({ field: "when" }, NOW)).toEqual([]);
    expect(parsePlanAssumptions("when", NOW)).toEqual([]);
    expect(parsePlanAssumptions([null, 3, "x", { field: "vibe", label: "Cozy" }], NOW)).toEqual([]);
  });

  it("drops a 'when' that is already in the past", () => {
    const out = parsePlanAssumptions(
      [
        { field: "when", label: "Today 9am", value: "2026-09-23T09:00" },
        { field: "budget", label: "~€20", value: "20 EUR" },
      ],
      NOW
    );
    expect(out.map((a) => a.field)).toEqual(["budget"]);
    expect(parsePlanAssumptions([{ field: "when", label: "Yesterday", value: "2026-09-22" }], NOW)).toEqual([]);
  });

  it("keeps a date-only 'when' for today and a timed one later today", () => {
    expect(parsePlanAssumptions([{ field: "when", label: "Today", value: "2026-09-23" }], NOW)).toHaveLength(1);
    expect(parsePlanAssumptions([{ field: "when", label: "Tonight", value: "2026-09-23T19:30" }], NOW)).toHaveLength(1);
  });

  it("keeps the label but strips malformed values", () => {
    const out = parsePlanAssumptions(
      [
        { field: "when", label: "Soon", value: "next friday" },
        { field: "budget", label: "Cheap", value: "cheap" },
        { field: "setting", label: "Mixed", value: "sometimes" },
      ],
      NOW
    );
    expect(out).toEqual([
      { field: "when", label: "Soon" },
      { field: "budget", label: "Cheap" },
      { field: "setting", label: "Mixed" },
    ]);
  });

  it("dedupes by field (first wins), trims and caps labels, drops empty chips", () => {
    const out = parsePlanAssumptions(
      [
        { field: "area", label: "  Schwabing   West  ", value: "Schwabing-West" },
        { field: "area", label: "Maxvorstadt", value: "Maxvorstadt" },
        { field: "budget", label: "   ", value: "" },
        { field: "setting", label: "x".repeat(80), value: "both" },
      ],
      NOW
    );
    expect(out[0]).toEqual({ field: "setting", label: "x".repeat(40), value: "either" });
    expect(out[1]).toEqual({ field: "area", label: "Schwabing West", value: "Schwabing-West" });
    expect(out).toHaveLength(2);
  });

  it("normalizes budget values", () => {
    expect(parsePlanAssumptions([{ field: "budget", label: "b", value: "eur 29.6" }], NOW)[0].value).toBe("30 EUR");
  });
});

describe("value parsers", () => {
  it("parseWhenValue accepts date and date-time, rejects roll-overs", () => {
    expect(parseWhenValue("2026-09-26T19:00")).toEqual({ date: new Date(2026, 8, 26, 19, 0), hasTime: true });
    expect(parseWhenValue("2026-09-26")?.hasTime).toBe(false);
    expect(parseWhenValue("2026-02-31")).toBeNull();
    expect(parseWhenValue("2026-09-26T25:00")).toBeNull();
    expect(parseWhenValue("Saturday")).toBeNull();
  });

  it("parseBudgetValue handles order, decimals and fallbacks", () => {
    expect(parseBudgetValue("30 EUR")).toEqual({ amount: 30, currency: "EUR" });
    expect(parseBudgetValue("GBP 45")).toEqual({ amount: 45, currency: "GBP" });
    expect(parseBudgetValue("25", "CHF")).toEqual({ amount: 25, currency: "CHF" });
    expect(parseBudgetValue("0 EUR")).toBeNull();
    expect(parseBudgetValue("free")).toBeNull();
  });

  it("parseSettingValue", () => {
    expect(parseSettingValue("Indoor")).toBe("indoor");
    expect(parseSettingValue("any")).toBe("either");
    expect(parseSettingValue("rooftop")).toBeNull();
  });

  it("timeOfDayForHour buckets", () => {
    expect([8, 12, 15, 19].map(timeOfDayForHour)).toEqual(["morning", "lunch", "afternoon", "evening"]);
  });
});

describe("chip → field mapping", () => {
  it("every assumption field opens exactly one details section", () => {
    expect(ASSUMPTION_DETAILS_SECTION).toEqual({
      when: "dateTime",
      budget: "budget",
      setting: "indoorOutdoor",
      area: "location",
    });
    const sections = ASSUMPTION_FIELDS.map((f) => ASSUMPTION_DETAILS_SECTION[f]);
    expect(new Set(sections).size).toBe(ASSUMPTION_FIELDS.length);
  });

  it("'when' prefills the date/time inputs", () => {
    expect(assumptionToDetailsPatch({ field: "when", label: "Sat evening", value: "2026-09-26T19:00" }, NOW)).toEqual({
      date: new Date(2026, 8, 26),
      dateEnd: undefined,
      singleDay: true,
      datePreset: "custom",
      timeOfDay: "evening",
    });
    expect(assumptionToDetailsPatch({ field: "when", label: "Tomorrow", value: "2026-09-24" }, NOW)).toMatchObject({
      datePreset: "tomorrow",
    });
    expect(assumptionToDetailsPatch({ field: "when", label: "Tonight", value: "2026-09-23T20:00" }, NOW)).toMatchObject({
      datePreset: "today",
      timeOfDay: "evening",
    });
    // Past or label-only 'when' never moves the date.
    expect(assumptionToDetailsPatch({ field: "when", label: "Earlier", value: "2026-09-23T08:00" }, NOW)).toEqual({});
    expect(assumptionToDetailsPatch({ field: "when", label: "Soon" }, NOW)).toEqual({});
  });

  it("'budget', 'setting' and 'area' map to their own inputs only", () => {
    expect(assumptionToDetailsPatch({ field: "budget", label: "~€30", value: "30 EUR" }, NOW)).toEqual({
      budgetAmount: "30",
      budgetCurrency: "EUR",
    });
    expect(assumptionToDetailsPatch({ field: "setting", label: "Indoors", value: "indoor" }, NOW)).toEqual({
      indoorOutdoor: "indoor",
    });
    expect(assumptionToDetailsPatch({ field: "setting", label: "Either", value: "either" }, NOW)).toEqual({
      indoorOutdoor: "any",
    });
    // Area is a hint — it must never overwrite the city in `location`.
    expect(assumptionToDetailsPatch({ field: "area", label: "Maxvorstadt", value: "Maxvorstadt" }, NOW)).toEqual({});
  });

  it("planDayFromAssumptions picks the inferred day", () => {
    expect(planDayFromAssumptions([{ field: "when", label: "Sat", value: "2026-09-26T19:00" }], NOW)).toEqual(
      new Date(2026, 8, 26)
    );
    expect(planDayFromAssumptions([{ field: "budget", label: "b", value: "30 EUR" }], NOW)).toBeNull();
  });
});

describe("pinned (user-corrected) fields", () => {
  const details = {
    location: "Munich, Germany",
    date: new Date(2026, 8, 26),
    singleDay: true,
    timeOfDay: "evening" as const,
    budgetAmount: "40",
    budgetCurrency: "EUR",
    indoorOutdoor: "outdoor" as const,
  };

  it("only pinned fields are sent, in canonical order", () => {
    expect(pinnedContextFromDetails(["budget", "when"], details)).toEqual({
      pinned_fields: ["when", "budget"],
      date_from: "2026-09-26",
      time_preference: "evening",
      budget_amount: 40,
      budget_currency: "EUR",
    });
    expect(pinnedContextFromDetails([], details)).toEqual({ pinned_fields: [] });
  });

  it("an exact start time wins over the time-of-day bucket", () => {
    expect(pinnedContextFromDetails(["when"], { ...details, exactTimeHm: "18:30" })).toEqual({
      pinned_fields: ["when"],
      date_from: "2026-09-26T18:30",
    });
  });

  it("a multi-day range sends date_to", () => {
    const out = pinnedContextFromDetails(["when"], {
      ...details,
      singleDay: false,
      dateEnd: new Date(2026, 8, 27),
    });
    expect(out.date_from).toBe("2026-09-26");
    expect(out.date_to).toBe("2026-09-27");
  });

  it("setting 'any' is still pinned; area uses the pin label then the city", () => {
    expect(pinnedContextFromDetails(["setting"], { ...details, indoorOutdoor: "any" })).toEqual({
      pinned_fields: ["setting"],
    });
    expect(
      pinnedContextFromDetails(["area"], { ...details, pinLabel: "Gärtnerplatz", latitude: 48.13, longitude: 11.57, searchRadiusKm: 2 })
    ).toEqual({
      pinned_fields: ["area"],
      area_hint: "Gärtnerplatz",
      latitude: 48.13,
      longitude: 11.57,
      search_radius_km: 2,
    });
    expect(pinnedContextFromDetails(["area"], details).area_hint).toBe("Munich");
  });

  it("an unusable budget is not pinned", () => {
    expect(pinnedContextFromDetails(["budget"], { ...details, budgetAmount: "" })).toEqual({ pinned_fields: [] });
  });

  it("assumptionFromDetails + mergePinnedAssumptions replace only the pinned chip", () => {
    const inferred = [
      { field: "when" as const, label: "Sat evening", value: "2026-09-26T19:00" },
      { field: "budget" as const, label: "~€30 p.p.", value: "30 EUR" },
    ];
    const pinnedBudget = assumptionFromDetails("budget", details);
    expect(pinnedBudget).toEqual({ field: "budget", label: "", value: "40 EUR" });
    expect(mergePinnedAssumptions(inferred, { budget: pinnedBudget })).toEqual([inferred[0], pinnedBudget]);
    expect(assumptionFromDetails("when", { ...details, exactTimeHm: "18:30" }).value).toBe("2026-09-26T18:30");
    expect(assumptionFromDetails("setting", details).value).toBe("outdoor");
  });
});

describe("Plan-it bar helpers", () => {
  it("suggests tonight / this weekend / something new on a weekday afternoon", () => {
    expect(getPlanItChips({ now: NOW })).toEqual(["tonight", "this_weekend", "something_new"]);
  });

  it("switches to tomorrow late in the evening and to next weekend on Sunday afternoon", () => {
    expect(getPlanItChips({ now: new Date(2026, 8, 23, 21, 0) })[0]).toBe("tomorrow");
    expect(getPlanItChips({ now: new Date(2026, 8, 27, 16, 0) })[1]).toBe("next_weekend");
  });

  it("leads with the person when opened from someone", () => {
    expect(getPlanItChips({ now: NOW, personName: "Anna" })).toEqual(["with_person", "tonight", "this_weekend"]);
    expect(getPlanItChips({ now: NOW, personName: "  " })[0]).toBe("tonight");
  });

  it("rotates placeholder examples per mode", () => {
    expect(planItExampleKey("romance", 0)).toBe("planIt.example.romance.1");
    expect(planItExampleKey("romance", 4)).toBe("planIt.example.romance.2");
    expect(planItExampleKey("business", 2)).toBe("planIt.example.friends.3");
  });

  it("normalizes the typed request", () => {
    expect(normalizePlanItRequest("  brunch   with Anna  ")).toBe("brunch with Anna");
    expect(normalizePlanItRequest(" a ")).toBeNull();
    expect(normalizePlanItRequest("x".repeat(500))).toHaveLength(200);
  });
});
