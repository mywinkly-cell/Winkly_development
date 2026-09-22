// Image moderation (docs/MODERATION.md): server decision logic (shared, import-free module
// used by the moderate-media Edge Function) and the client helpers that turn verdicts into UI.

import {
  decide,
  failClosedDecision,
  ModerationProviderError,
  SAFESEARCH_POLICY,
  safeSearchSignals,
  SIGHTENGINE_POLICY,
  sightengineSignals,
} from "../../../supabase/functions/_shared/moderation/decision";

import {
  chatImageDisplay,
  parseModerationResponse,
  requestModeration,
  summarizeProfileUploads,
} from "@/lib/moderation/mediaModeration";

// jest.mock is hoisted above the imports; mockInvoke is only read lazily at call time.
const mockInvoke = jest.fn();
jest.mock("@/lib/supabase", () => ({
  supabase: { functions: { invoke: (...args: unknown[]) => mockInvoke(...args) } },
}));

/** Shaped like Sightengine's documented check.json output (all-clear values). */
function sightengineFixture(overrides: {
  nudity?: Record<string, number>;
  gore?: number;
  weapon?: Record<string, number>;
  aimingThreat?: number;
} = {}) {
  return {
    status: "success",
    nudity: {
      sexual_activity: 0.01,
      sexual_display: 0.01,
      erotica: 0.01,
      very_suggestive: 0.01,
      suggestive: 0.01,
      mildly_suggestive: 0.01,
      none: 0.99,
      ...overrides.nudity,
    },
    gore: { prob: overrides.gore ?? 0.01, classes: {} },
    violence: { prob: 0.01, classes: { physical_violence: 0.01, firearm_threat: 0.01, combat_sport: 0.01 } },
    weapon: {
      classes: { firearm: 0.01, knife: 0.01, ...overrides.weapon },
      firearm_action: { aiming_threat: overrides.aimingThreat ?? 0.01 },
    },
    recreational_drug: { prob: 0.01 },
    "self-harm": { prob: 0.01 },
  };
}

describe("decide()", () => {
  const policy = [{ signal: "x", review: 0.5, block: 0.8 }];

  it("passes below every threshold", () => {
    expect(decide({ x: 0.1 }, policy)).toEqual({ status: "pass", reasons: [] });
  });

  it("reviews at the review threshold and blocks at the block threshold", () => {
    expect(decide({ x: 0.5 }, policy).status).toBe("review");
    expect(decide({ x: 0.8 }, policy).status).toBe("block");
  });

  it("the most severe hit wins and every hit is recorded", () => {
    const d = decide({ a: 0.6, b: 0.95 }, [
      { signal: "a", review: 0.5 },
      { signal: "b", review: 0.5, block: 0.9 },
    ]);
    expect(d.status).toBe("block");
    expect(d.reasons).toHaveLength(2);
  });

  it("fail-closed decision is review, never pass", () => {
    expect(failClosedDecision("timeout").status).toBe("review");
  });
});

describe("Sightengine adapter", () => {
  it("a normal photo passes", () => {
    expect(decide(sightengineSignals(sightengineFixture()), SIGHTENGINE_POLICY).status).toBe("pass");
  });

  it("swimwear-level suggestiveness still passes (dating app)", () => {
    const s = sightengineSignals(sightengineFixture({ nudity: { suggestive: 0.9, none: 0.05 } }));
    expect(decide(s, SIGHTENGINE_POLICY).status).toBe("pass");
  });

  it("explicit content is blocked", () => {
    const s = sightengineSignals(sightengineFixture({ nudity: { sexual_activity: 0.93, none: 0.01 } }));
    const d = decide(s, SIGHTENGINE_POLICY);
    expect(d.status).toBe("block");
    expect(d.reasons[0]).toMatch(/^nudity\.sexual_activity/);
  });

  it("gore and threatening weapons are blocked; a visible firearm goes to review", () => {
    expect(decide(sightengineSignals(sightengineFixture({ gore: 0.8 })), SIGHTENGINE_POLICY).status).toBe("block");
    expect(decide(sightengineSignals(sightengineFixture({ aimingThreat: 0.7 })), SIGHTENGINE_POLICY).status).toBe(
      "block"
    );
    expect(
      decide(sightengineSignals(sightengineFixture({ weapon: { firearm: 0.99 } })), SIGHTENGINE_POLICY).status
    ).toBe("review");
  });

  it("throws (→ caller fails closed) on an error or incomplete response", () => {
    expect(() => sightengineSignals({ status: "failure", error: { message: "bad key" } })).toThrow(
      ModerationProviderError
    );
    expect(() => sightengineSignals({ status: "success" })).toThrow(ModerationProviderError);
    expect(() => sightengineSignals(null)).toThrow(ModerationProviderError);
  });
});

describe("Google Vision SafeSearch adapter", () => {
  const vision = (ann: Record<string, string>) => ({ responses: [{ safeSearchAnnotation: ann }] });
  const clean = { adult: "VERY_UNLIKELY", violence: "VERY_UNLIKELY", racy: "UNLIKELY", medical: "VERY_UNLIKELY", spoof: "UNLIKELY" };

  it("maps likelihoods to pass / review / block", () => {
    expect(decide(safeSearchSignals(vision(clean)), SAFESEARCH_POLICY).status).toBe("pass");
    expect(decide(safeSearchSignals(vision({ ...clean, adult: "POSSIBLE" })), SAFESEARCH_POLICY).status).toBe("review");
    expect(decide(safeSearchSignals(vision({ ...clean, adult: "LIKELY" })), SAFESEARCH_POLICY).status).toBe("block");
    expect(decide(safeSearchSignals(vision({ ...clean, violence: "VERY_LIKELY" })), SAFESEARCH_POLICY).status).toBe(
      "block"
    );
  });

  it("an UNKNOWN adult likelihood is held for review, not passed", () => {
    expect(decide(safeSearchSignals(vision({ ...clean, adult: "UNKNOWN" })), SAFESEARCH_POLICY).status).toBe("review");
  });

  it("throws on per-request errors or a missing annotation", () => {
    expect(() => safeSearchSignals({ responses: [{ error: { code: 7, message: "denied" } }] })).toThrow(
      ModerationProviderError
    );
    expect(() => safeSearchSignals({ responses: [{}] })).toThrow(ModerationProviderError);
    expect(() => safeSearchSignals({})).toThrow(ModerationProviderError);
  });
});

describe("client: requestModeration / parseModerationResponse", () => {
  beforeEach(() => mockInvoke.mockReset());

  it("returns the server verdict", async () => {
    mockInvoke.mockResolvedValue({ data: { status: "pass", url: "https://x/y.jpg" }, error: null });
    await expect(requestModeration("profile_photo", "u/core/a.jpg")).resolves.toEqual({
      status: "pass",
      url: "https://x/y.jpg",
    });
    expect(mockInvoke).toHaveBeenCalledWith("moderate-media", { body: { kind: "profile_photo", path: "u/core/a.jpg" } });
  });

  it("fails closed to review when the function errors or throws", async () => {
    mockInvoke.mockResolvedValue({ data: null, error: new Error("503") });
    await expect(requestModeration("chat_image", "u/c/a.jpg")).resolves.toEqual({ status: "review" });
    mockInvoke.mockRejectedValue(new Error("offline"));
    await expect(requestModeration("chat_image", "u/c/a.jpg")).resolves.toEqual({ status: "review" });
  });

  it("treats unknown payloads as review", () => {
    expect(parseModerationResponse({ status: "ok" })).toEqual({ status: "review" });
    expect(parseModerationResponse(null)).toEqual({ status: "review" });
    expect(parseModerationResponse({ status: "block", url: "https://x" })).toEqual({ status: "block" });
  });
});

describe("client: summarizeProfileUploads", () => {
  it("keeps order of usable urls and counts held / blocked", () => {
    expect(
      summarizeProfileUploads([
        { kind: "existing", url: "https://a" },
        { kind: "moderated", res: { status: "pass", url: "https://b" } },
        { kind: "moderated", res: { status: "review" } },
        { kind: "moderated", res: { status: "pass" } }, // pass without url → still held server-side
        { kind: "moderated", res: { status: "block" } },
        { kind: "failed" },
      ])
    ).toEqual({ urls: ["https://a", "https://b"], held: 2, blocked: 1 });
  });
});

describe("client: chatImageDisplay", () => {
  const base = { hasPath: true, mine: false, revealed: false };

  it("blurs review and unknown verdicts for the recipient until tapped", () => {
    expect(chatImageDisplay({ ...base, moderation: "review" })).toBe("blurred");
    expect(chatImageDisplay({ ...base })).toBe("blurred");
    expect(chatImageDisplay({ ...base, moderation: "review", revealed: true })).toBe("visible");
  });

  it("shows passed images, and the sender always sees their own", () => {
    expect(chatImageDisplay({ ...base, moderation: "pass" })).toBe("visible");
    expect(chatImageDisplay({ ...base, moderation: "review", mine: true })).toBe("visible");
  });

  it("replaces blocked images for everyone, even after a tap", () => {
    expect(chatImageDisplay({ ...base, moderation: "block", revealed: true })).toBe("removed");
    expect(chatImageDisplay({ ...base, moderation: "block", mine: true })).toBe("removed");
  });

  it("leaves path-less media (GIFs, legacy urls) alone", () => {
    expect(chatImageDisplay({ ...base, hasPath: false })).toBe("visible");
  });
});
