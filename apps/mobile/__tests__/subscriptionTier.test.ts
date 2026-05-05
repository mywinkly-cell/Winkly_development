import { normalizeSubscriptionTier } from "@/lib/billing/subscriptionTier";

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
