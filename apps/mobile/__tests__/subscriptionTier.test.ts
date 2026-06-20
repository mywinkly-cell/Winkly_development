import {
  normalizeSubscriptionTier,
  computeEffectiveTier,
  trialDaysRemaining,
} from "@/lib/billing/subscriptionTier";

describe("normalizeSubscriptionTier", () => {
  it("maps known tiers case-insensitively", () => {
    expect(normalizeSubscriptionTier("PREMIUM")).toBe("premium");
    expect(normalizeSubscriptionTier("super")).toBe("super");
    expect(normalizeSubscriptionTier("enterprise")).toBe("enterprise");
    expect(normalizeSubscriptionTier("free")).toBe("free");
  });

  it("falls back to free for unknown strings", () => {
    expect(normalizeSubscriptionTier("gemini-pro-max")).toBe("free");
    expect(normalizeSubscriptionTier(undefined)).toBe("free");
  });

  it("uses legacy premium when tier missing", () => {
    expect(normalizeSubscriptionTier(undefined, true)).toBe("premium");
    expect(normalizeSubscriptionTier("bogus", true)).toBe("premium");
  });
});

describe("computeEffectiveTier", () => {
  const now = new Date("2026-06-17T12:00:00Z");
  const future = "2026-06-19T12:00:00Z";
  const past = "2026-06-15T12:00:00Z";

  it("grants Premium during an active new-user trial", () => {
    const r = computeEffectiveTier({ tierFromDb: "free", trialEndsAt: future, now });
    expect(r.tier).toBe("premium");
    expect(r.isOnTrial).toBe(true);
    expect(r.trialEndsAt).toBe(future);
  });

  it("drops to Free once the trial has expired", () => {
    const r = computeEffectiveTier({ tierFromDb: "free", trialEndsAt: past, now });
    expect(r.tier).toBe("free");
    expect(r.isOnTrial).toBe(false);
  });

  it("free with no trial stays free", () => {
    const r = computeEffectiveTier({ tierFromDb: "free", trialEndsAt: null, now });
    expect(r.tier).toBe("free");
    expect(r.isOnTrial).toBe(false);
  });

  it("an active paid plan beats the trial and is not marked as trial", () => {
    const r = computeEffectiveTier({ tierFromDb: "super", trialEndsAt: future, now });
    expect(r.tier).toBe("super");
    expect(r.isOnTrial).toBe(false);
  });

  it("honors paid expiry, then falls through to an active trial", () => {
    const r = computeEffectiveTier({ tierFromDb: "premium", premiumUntil: past, trialEndsAt: future, now });
    expect(r.tier).toBe("premium");
    expect(r.isOnTrial).toBe(true); // paid expired → trial still active
  });

  it("expired paid with no trial → free", () => {
    const r = computeEffectiveTier({ tierFromDb: "premium", premiumUntil: past, trialEndsAt: past, now });
    expect(r.tier).toBe("free");
  });

  it("paid with no recorded expiry is treated as active", () => {
    const r = computeEffectiveTier({ tierFromDb: "premium", premiumUntil: null, now });
    expect(r.tier).toBe("premium");
    expect(r.isOnTrial).toBe(false);
  });

  it("dev override is always premium", () => {
    expect(computeEffectiveTier({ tierFromDb: "free", isDev: true, now }).tier).toBe("premium");
  });
});

describe("trialDaysRemaining", () => {
  const now = new Date("2026-06-17T12:00:00Z");
  it("rounds up partial days", () => {
    expect(trialDaysRemaining("2026-06-19T18:00:00Z", now)).toBe(3); // 2.25d → 3
    expect(trialDaysRemaining("2026-06-18T12:00:00Z", now)).toBe(1);
  });
  it("is 0 when expired or absent", () => {
    expect(trialDaysRemaining("2026-06-15T12:00:00Z", now)).toBe(0);
    expect(trialDaysRemaining(null, now)).toBe(0);
  });
});
