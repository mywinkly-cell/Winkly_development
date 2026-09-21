import en from "@/lib/i18n/locales/en.json";
import {
  buildPlanHintRoute,
  firstNameOf,
  firstSharedInterest,
  planDateForEvent,
  selectPlanHintCopy,
  type Translate,
} from "@/lib/ai/planHint";

const strings = en as Record<string, string>;

/** Real English copy with i18next-style {{param}} interpolation; throws on unknown keys. */
const t: Translate = (key, options) => {
  const s = strings[key];
  if (s == null) throw new Error(`missing en key: ${key}`);
  return s.replace(/\{\{(\w+)\}\}/g, (_, p: string) => options?.[p] ?? `{{${p}}}`);
};

describe("firstNameOf", () => {
  it("takes the first word and trims", () => {
    expect(firstNameOf("  Sam Taylor ")).toBe("Sam");
    expect(firstNameOf("Ana")).toBe("Ana");
  });
  it("returns empty for missing names", () => {
    expect(firstNameOf(null)).toBe("");
    expect(firstNameOf("   ")).toBe("");
  });
});

describe("firstSharedInterest", () => {
  it("matches case- and whitespace-insensitively, in the person's order", () => {
    expect(firstSharedInterest(["hiking", " Bouldering "], ["Jazz", "bouldering", "Hiking"])).toBe("bouldering");
  });
  it("returns null with nothing in common or missing lists", () => {
    expect(firstSharedInterest(["yoga"], ["jazz"])).toBeNull();
    expect(firstSharedInterest(undefined, ["jazz"])).toBeNull();
    expect(firstSharedInterest(["jazz"], [])).toBeNull();
  });
});

describe("selectPlanHintCopy", () => {
  it("friends card with a shared interest", () => {
    const copy = selectPlanHintCopy(
      { mode: "friends", person: { name: "Sam Taylor", interests: ["bouldering", "jazz"] }, selfInterests: ["Bouldering"] },
      t
    );
    expect(copy.title).toBe("Plan something with Sam");
    expect(copy.subtitle).toBe("You both like bouldering");
    expect(copy.request).toContain("Sam");
    expect(copy.request).toContain("bouldering");
  });

  it("friends card without shared interests falls back to the generic subtitle", () => {
    const copy = selectPlanHintCopy({ mode: "friends", person: { name: "Sam", interests: ["jazz"] }, selfInterests: ["yoga"] }, t);
    expect(copy.title).toBe("Plan something with Sam");
    expect(copy.subtitle).toBe("Winkly will find something you’d both enjoy");
    expect(copy.request).toBe("Something fun for me and Sam to do together");
  });

  it("romance card is a first date", () => {
    const copy = selectPlanHintCopy({ mode: "romance", person: { name: "Lea" } }, t);
    expect(copy.title).toBe("Plan a first date with Lea");
    expect(copy.request).toContain("first date with Lea");
  });

  it("business card is a meeting", () => {
    expect(selectPlanHintCopy({ mode: "business", person: { name: "Kim" } }, t).title).toBe("Plan a meeting with Kim");
  });

  it("person without a usable name falls back to mode copy (no request)", () => {
    const copy = selectPlanHintCopy({ mode: "romance", person: { name: "  " } }, t);
    expect(copy.title).toBe("Plan your next date");
    expect(copy.request).toBeUndefined();
  });

  it("event detail plans the evening around the event", () => {
    const copy = selectPlanHintCopy({ mode: "events", event: { title: "Jazz Night", venueName: "Blue Note" } }, t);
    expect(copy.title).toBe("Plan your evening around this event");
    expect(copy.subtitle).toContain("Jazz Night");
    expect(copy.request).toContain("Jazz Night at Blue Note");
  });

  it("event without venue uses the plain request", () => {
    const copy = selectPlanHintCopy({ mode: "events", event: { title: "Jazz Night" } }, t);
    expect(copy.request).not.toContain(" at ");
  });

  it("a person wins over an event", () => {
    const copy = selectPlanHintCopy({ mode: "events", person: { name: "Sam" }, event: { title: "Jazz Night" } }, t);
    expect(copy.title).toBe("Plan something with Sam");
  });

  it.each([
    ["romance", "Plan your next date"],
    ["friends", "Plan something with friends"],
    ["business", "Plan your next business meeting"],
    ["events", "Plan your evening"],
  ] as const)("planner copy for %s", (mode, title) => {
    const copy = selectPlanHintCopy({ mode }, t);
    expect(copy.title).toBe(title);
    expect(copy.subtitle.length).toBeGreaterThan(0);
    expect(copy.request).toBeUndefined();
  });

  it("planner 'all' scope keeps the generic concierge intro", () => {
    expect(selectPlanHintCopy({ mode: "all" }, t).title).toBe(strings["planner.conciergePromo.title"]);
  });
});

describe("planDateForEvent", () => {
  const now = new Date(2026, 8, 22, 15, 0); // 22 Sep 2026 local

  it("returns the local day for today or future events", () => {
    expect(planDateForEvent(new Date(2026, 8, 22, 20, 0).toISOString(), now)).toBe("2026-09-22");
    expect(planDateForEvent(new Date(2026, 9, 3, 19, 0).toISOString(), now)).toBe("2026-10-03");
  });
  it("drops past or invalid dates", () => {
    expect(planDateForEvent(new Date(2026, 8, 21, 20, 0).toISOString(), now)).toBeUndefined();
    expect(planDateForEvent("not a date", now)).toBeUndefined();
    expect(planDateForEvent(null, now)).toBeUndefined();
  });
});

describe("buildPlanHintRoute", () => {
  it("opens the concierge on the quick step with the partner preselected", () => {
    const route = buildPlanHintRoute({
      mode: "friends",
      request: "Something fun",
      partnerUserId: "u-1",
      partnerDisplayName: "Sam Taylor",
    });
    expect(route.pathname).toBe("/concierge");
    expect(route.params).toEqual({
      source_screen: "planner",
      mode: "friends",
      source_planner_tab: "meetups",
      initial_step: "quick",
      prefill_prompt: "Something fun",
      auto_generate: "1",
      partner_user_id: "u-1",
      partner_display_name: "Sam Taylor",
    });
  });

  it("maps modes to planner tabs and passes a valid date only", () => {
    expect(buildPlanHintRoute({ mode: "romance", request: "x" }).params.source_planner_tab).toBe("dates");
    const ev = buildPlanHintRoute({ mode: "events", request: "x", date: "2026-10-03" });
    expect(ev.params.source_planner_tab).toBe("events");
    expect(ev.params.prefill_date).toBe("2026-10-03");
    expect(ev.params.partner_user_id).toBeUndefined();
    expect(buildPlanHintRoute({ mode: "events", request: "x", date: "soon" }).params.prefill_date).toBeUndefined();
  });
});
