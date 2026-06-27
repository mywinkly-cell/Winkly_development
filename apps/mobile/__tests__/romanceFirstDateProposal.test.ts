import {
  buildRomanceFirstDateOptions,
  curatedFirstDateOption,
  nextDefaultDateSlotIso,
} from "@/lib/ai/romanceFirstDateProposal";
import { callWinklyPlan } from "@/lib/ai/conciergeClient";

jest.mock("@/lib/ai/conciergeClient", () => ({
  callWinklyPlan: jest.fn(),
}));

const mockCallWinklyPlan = callWinklyPlan as jest.MockedFunction<typeof callWinklyPlan>;

describe("romanceFirstDateProposal", () => {
  afterEach(() => jest.clearAllMocks());

  it("proposes a slot ~48h out at a relaxed hour", () => {
    const now = new Date("2026-06-27T09:13:00.000Z");
    const iso = nextDefaultDateSlotIso(now);
    const dt = new Date(iso);
    expect(dt.getHours()).toBe(18);
    expect(dt.getMinutes()).toBe(0);
    // Two days ahead of the local date.
    expect(dt.getDate()).toBe(new Date(now.getTime() + 48 * 3600_000).getDate());
  });

  it("curated fallback always has a place+time+why and names the city", () => {
    const opt = curatedFirstDateOption("Berlin");
    expect(opt.starts_at).toBeTruthy();
    expect(opt.activity).toBe("Coffee");
    expect(opt.why.length).toBeGreaterThan(10);
    expect(opt.title.toLowerCase()).toContain("berlin");
  });

  it("falls back to a single curated option when the AI gateway throws", async () => {
    mockCallWinklyPlan.mockRejectedValueOnce(new Error("rate limited"));
    const opts = await buildRomanceFirstDateOptions({
      meId: "me",
      partnerUserId: "them",
      city: "Vienna",
    });
    expect(opts).toHaveLength(1);
    expect(opts[0].why.length).toBeGreaterThan(10);
    expect(opts[0].starts_at).toBeTruthy();
  });

  it("maps AI options to place + why first-date cards", async () => {
    mockCallWinklyPlan.mockResolvedValueOnce({
      provider: "gemini",
      pending_plan_id: null,
      options: [
        {
          option_id: "A",
          character_label: "The Classic",
          title: "Coffee and a walk",
          why_this_fits: "You both love specialty coffee and the riverside.",
          itinerary: [],
          venue: {
            name: "Blue Bottle",
            address: "1 River St",
            google_maps_link: "",
            estimated_cost: "€",
          },
          weather_note: "",
          duration_minutes: 60,
        },
        {
          option_id: "B",
          character_label: "The Active",
          title: "Sunset dinner",
          why_this_fits: "A shared interest in food and an easy evening slot.",
          itinerary: [],
          venue: {
            name: "Trattoria",
            address: "5 Hill Rd",
            google_maps_link: "",
            estimated_cost: "€€",
          },
          weather_note: "",
          duration_minutes: 90,
        },
      ],
    });

    const opts = await buildRomanceFirstDateOptions({
      meId: "me",
      partnerUserId: "them",
      city: "Lisbon",
    });
    expect(opts).toHaveLength(2);
    expect(opts[0].place).toBe("Blue Bottle");
    expect(opts[0].title).toContain("Blue Bottle");
    expect(opts[0].why).toContain("specialty coffee");
    expect(opts[1].place).toBe("Trattoria");
  });
});
