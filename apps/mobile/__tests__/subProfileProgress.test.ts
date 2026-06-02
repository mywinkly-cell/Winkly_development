import {
  computeModeProgressFromSubProfiles,
  getModeEntryBlockReason,
  getModeSubProfileEditRoute,
} from "@/lib/mode/subProfileProgress";

describe("computeModeProgressFromSubProfiles", () => {
  it("returns zeros when no rows", () => {
    expect(computeModeProgressFromSubProfiles([])).toEqual({
      romance: 0,
      friends: 0,
      business: 0,
    });
  });

  it("returns 100 when photo, bio, and goals are present", () => {
    expect(
      computeModeProgressFromSubProfiles([
        {
          mode: "romance",
          bio: "Hello",
          photos: ["https://x/1.jpg"],
          meta: { relationship_goals: ["long-term"] },
        },
      ])
    ).toEqual({ romance: 100, friends: 0, business: 0 });
  });

  it("returns partial progress for missing fields", () => {
    expect(
      computeModeProgressFromSubProfiles([
        { mode: "friends", bio: "Hi", photos: ["a"], meta: {} },
      ])
    ).toEqual({ romance: 0, friends: 67, business: 0 });
  });

  it("accepts string networking_goals for business", () => {
    expect(
      computeModeProgressFromSubProfiles([
        {
          mode: "business",
          bio: "Pro",
          photos: ["a"],
          meta: { networking_goals: "Partnerships" },
        },
      ])
    ).toEqual({ romance: 0, friends: 0, business: 100 });
  });
});

describe("getModeEntryBlockReason", () => {
  const progress = { romance: 100, friends: 50, business: 0 };

  it("returns null when allowed and complete", () => {
    expect(getModeEntryBlockReason("romance", progress, ["events", "romance"])).toBeNull();
  });

  it("returns not_enabled without permission", () => {
    expect(getModeEntryBlockReason("romance", progress, ["events"])).toBe("not_enabled");
  });

  it("returns incomplete when permitted but under 100%", () => {
    expect(getModeEntryBlockReason("friends", progress, ["events", "friends"])).toBe("incomplete");
  });
});

describe("getModeSubProfileEditRoute", () => {
  it("routes business to edit-business", () => {
    expect(getModeSubProfileEditRoute("business")).toBe("/profile/edit-business");
  });
});
