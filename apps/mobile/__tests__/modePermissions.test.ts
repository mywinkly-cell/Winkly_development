import {
  reconcileActiveMode,
  resolvePermissions,
  resolveSubscriptionTier,
} from "@/lib/mode/permissions";

describe("resolvePermissions", () => {
  it("always grants events", () => {
    expect(resolvePermissions("personal", [])).toEqual(["events"]);
  });

  it("unlocks personal modes from sub-profiles", () => {
    const perms = resolvePermissions("personal", ["romance", "friends"]);
    expect(perms).toEqual(expect.arrayContaining(["events", "romance", "friends"]));
    expect(perms).not.toContain("business");
  });

  it("business accounts only get events + business", () => {
    expect(resolvePermissions("business", ["romance"])).toEqual(["events", "business"]);
  });

  it("ignores unknown sub-profile modes", () => {
    expect(resolvePermissions("personal", ["dating", "romance"])).toEqual(["events", "romance"]);
  });

  it("does not duplicate when sub-profiles repeat", () => {
    expect(resolvePermissions("personal", ["romance", "romance"])).toEqual(["events", "romance"]);
  });
});

describe("resolveSubscriptionTier", () => {
  it("forces premium in dev", () => {
    expect(resolveSubscriptionTier({ tierFromDb: "free", isDev: true })).toBe("premium");
  });

  it("trusts a valid DB tier in prod", () => {
    expect(resolveSubscriptionTier({ tierFromDb: "super" })).toBe("super");
    expect(resolveSubscriptionTier({ tierFromDb: "enterprise" })).toBe("enterprise");
  });

  it("falls back to is_premium when tier missing/invalid", () => {
    expect(resolveSubscriptionTier({ tierFromDb: undefined, isPremium: true })).toBe("premium");
    expect(resolveSubscriptionTier({ tierFromDb: "bogus", isPremium: false })).toBe("free");
    expect(resolveSubscriptionTier({})).toBe("free");
  });
});

describe("reconcileActiveMode", () => {
  it("keeps an active mode that is still permitted", () => {
    expect(reconcileActiveMode("romance", ["events", "romance"])).toBe("romance");
  });

  it("clears an active mode that is no longer permitted", () => {
    expect(reconcileActiveMode("romance", ["events"])).toBeNull();
  });

  it("returns null when there is no active mode", () => {
    expect(reconcileActiveMode(null, ["events", "romance"])).toBeNull();
  });
});
