import { buildRomanceSuperLikeIcebreaker } from "@/lib/matching/romanceIcebreaker";

describe("buildRomanceSuperLikeIcebreaker", () => {
  it("uses shared interest when present", () => {
    const line = buildRomanceSuperLikeIcebreaker(
      { interests: ["Hiking", "Coffee"], city: "Berlin" },
      { name: "Alex Rivera", chipItems: ["Coffee", "Books"], city: "Berlin" },
    );
    expect(line).toContain("Coffee");
    expect(line).toContain("Alex");
  });

  it("mentions city match when interests do not overlap", () => {
    const line = buildRomanceSuperLikeIcebreaker(
      { interests: ["Yoga"], city: "Vienna" },
      { name: "Sam", chipItems: ["Running"], city: "Vienna" },
    );
    expect(line.toLowerCase()).toContain("vienna");
  });

  it("falls back when minimal profile", () => {
    const line = buildRomanceSuperLikeIcebreaker(null, {
      name: "Taylor",
      chipItems: [],
      city: "",
    });
    expect(line.length).toBeGreaterThan(10);
    expect(line).toContain("Taylor");
  });
});
