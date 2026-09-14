// Post-plan review feedback loop. Mocks @/lib/supabase with a controllable chainable builder
// (same idiom as weeklySpark.test.ts): every chain method returns the builder, and the terminal
// (await or .maybeSingle()) resolves to the next queued { data, error }. auth.getUser() is backed
// by a separate mutable mockUser so tests can simulate signed-out state.
const mockCalls: { table: string; method: string; args: unknown[] }[] = [];
const mockResultQueue: { data: unknown; error: unknown }[] = [];
let mockUser: { id: string } | null = { id: "me-1" };

jest.mock("@/lib/supabase", () => {
  const builderFor = (table: string) => {
    const next = () => mockResultQueue.shift() ?? { data: null, error: null };
    const b: Record<string, unknown> = {};
    const record = (method: string) => (...args: unknown[]) => {
      mockCalls.push({ table, method, args });
      return b;
    };
    for (const m of ["select", "insert", "update", "delete", "eq", "neq", "in", "is", "or", "order", "limit"]) {
      b[m] = record(m);
    }
    b.maybeSingle = (...args: unknown[]) => {
      mockCalls.push({ table, method: "maybeSingle", args });
      return Promise.resolve(next());
    };
    (b as { then: unknown }).then = (onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) =>
      Promise.resolve(next()).then(onF, onR);
    return b;
  };
  return {
    supabase: {
      from: (table: string) => builderFor(table),
      auth: { getUser: () => Promise.resolve({ data: { user: mockUser } }) },
    },
  };
});

const mockRecordPairBehaviorSignal = jest.fn();
jest.mock("@/lib/matching/behaviorSignals", () => ({
  recordPairBehaviorSignal: (...args: unknown[]) => mockRecordPairBehaviorSignal(...args),
}));
jest.mock("@/lib/ai/conciergeClient", () => ({ reportConciergeOutcome: jest.fn() }));
jest.mock("@/lib/ai/conciergeStorage", () => ({ saveConciergeFeedback: jest.fn() }));

// Imports after jest.mock — mocks must hoist above the module under test.
// eslint-disable-next-line import/first
import {
  getNextPendingPlanReview,
  markPlanReviewPrompted,
  savePostPlanReview,
  dismissPostPlanReview,
  timeOfDayFromIso,
} from "@/lib/ai/planRecommendationFeedback";

function plannerItemRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "plan-1",
    title: "Dinner at Luigi's",
    source_mode: "romance",
    starts_at: "2026-06-20T18:00:00.000Z",
    ends_at: "2026-06-20T20:00:00.000Z",
    related_user_id: "partner-1",
    meta: null,
    ...overrides,
  };
}

describe("planRecommendationFeedback — post-plan review", () => {
  beforeEach(() => {
    mockCalls.length = 0;
    mockResultQueue.length = 0;
    mockRecordPairBehaviorSignal.mockClear();
    mockUser = { id: "me-1" };
  });

  describe("getNextPendingPlanReview", () => {
    const now = new Date("2026-06-21T00:00:00.000Z");

    it("returns null when signed out", async () => {
      mockUser = null;
      await expect(getNextPendingPlanReview(now)).resolves.toBeNull();
      expect(mockCalls).toHaveLength(0);
    });

    it("returns null when the user has no participant rows", async () => {
      mockResultQueue.push({ data: [], error: null });
      await expect(getNextPendingPlanReview(now)).resolves.toBeNull();
    });

    it("surfaces a plan whose time has passed, wasn't cancelled, and wasn't already asked about", async () => {
      mockResultQueue.push({ data: [{ planner_item_id: "plan-1" }], error: null });
      mockResultQueue.push({ data: [plannerItemRow()], error: null });

      const review = await getNextPendingPlanReview(now);
      expect(review).not.toBeNull();
      expect(review?.plannerItemId).toBe("plan-1");
      expect(review?.mode).toBe("romance");
      expect(review?.relatedUserId).toBe("partner-1");

      const participantsCall = mockCalls.find((c) => c.table === "planner_participants" && c.method === "neq");
      expect(participantsCall?.args).toEqual(["role", "invitee"]);
    });

    it("never surfaces a plan whose time hasn't passed yet", async () => {
      mockResultQueue.push({ data: [{ planner_item_id: "plan-1" }], error: null });
      mockResultQueue.push({
        data: [plannerItemRow({ starts_at: "2026-06-22T18:00:00.000Z", ends_at: "2026-06-22T20:00:00.000Z" })],
        error: null,
      });
      await expect(getNextPendingPlanReview(now)).resolves.toBeNull();
    });

    it("never surfaces a cancelled plan", async () => {
      mockResultQueue.push({ data: [{ planner_item_id: "plan-1" }], error: null });
      mockResultQueue.push({
        data: [plannerItemRow({ meta: { cancelled_at: "2026-06-19T00:00:00.000Z" } })],
        error: null,
      });
      await expect(getNextPendingPlanReview(now)).resolves.toBeNull();
    });

    it("never re-surfaces a plan that was already prompted", async () => {
      mockResultQueue.push({ data: [{ planner_item_id: "plan-1" }], error: null });
      mockResultQueue.push({
        data: [plannerItemRow({ meta: { post_plan_review_prompted_at: "2026-06-20T21:00:00.000Z" } })],
        error: null,
      });
      await expect(getNextPendingPlanReview(now)).resolves.toBeNull();
    });

    it("picks the most recently completed plan when several qualify", async () => {
      mockResultQueue.push({
        data: [{ planner_item_id: "plan-1" }, { planner_item_id: "plan-2" }],
        error: null,
      });
      mockResultQueue.push({
        data: [
          plannerItemRow({ id: "plan-1", ends_at: "2026-06-18T20:00:00.000Z" }),
          plannerItemRow({ id: "plan-2", ends_at: "2026-06-20T20:00:00.000Z" }),
        ],
        error: null,
      });
      const review = await getNextPendingPlanReview(now);
      expect(review?.plannerItemId).toBe("plan-2");
    });

    it("derives activity/venue from planner_items.meta", async () => {
      mockResultQueue.push({ data: [{ planner_item_id: "plan-1" }], error: null });
      mockResultQueue.push({
        data: [plannerItemRow({ meta: { activity: "Wine tasting", location: "Luigi's Wine Bar" } })],
        error: null,
      });
      const review = await getNextPendingPlanReview(now);
      expect(review?.activityType).toBe("Wine tasting");
      expect(review?.venue).toBe("Luigi's Wine Bar");
    });
  });

  describe("markPlanReviewPrompted", () => {
    it("merges post_plan_review_prompted_at into existing meta without clobbering it", async () => {
      mockResultQueue.push({ data: { meta: { activity: "Hiking" } }, error: null });
      mockResultQueue.push({ data: null, error: null });

      await markPlanReviewPrompted("plan-1");

      const upd = mockCalls.find((c) => c.table === "planner_items" && c.method === "update");
      const patch = upd?.args[0] as { meta: Record<string, unknown> };
      expect(patch.meta.activity).toBe("Hiking");
      expect(patch.meta.post_plan_review_prompted_at).toEqual(expect.any(String));
    });

    it("is a no-op when already prompted", async () => {
      mockResultQueue.push({ data: { meta: { post_plan_review_prompted_at: "2026-06-20T21:00:00.000Z" } }, error: null });

      await markPlanReviewPrompted("plan-1");

      const upd = mockCalls.find((c) => c.table === "planner_items" && c.method === "update");
      expect(upd).toBeUndefined();
    });
  });

  describe("savePostPlanReview", () => {
    it("persists the plan, user, rating, structured signals, and plan attributes", async () => {
      mockResultQueue.push({ data: { meta: {} }, error: null }); // markPlanReviewPrompted: select
      mockResultQueue.push({ data: null, error: null }); // markPlanReviewPrompted: update
      mockResultQueue.push({ data: null, error: null }); // plan_reviews insert

      await savePostPlanReview({
        plannerItemId: "plan-1",
        mode: "romance",
        rating: 5,
        signals: { venueGood: true, timingGood: false, wouldRepeat: true },
        note: "  Great spot, would go again  ",
        activityType: "Dinner",
        venue: "Luigi's",
        timeOfDay: "evening",
        relatedUserId: "partner-1",
      });

      const insert = mockCalls.find((c) => c.table === "plan_reviews" && c.method === "insert");
      expect(insert?.args[0]).toMatchObject({
        planner_item_id: "plan-1",
        user_id: "me-1",
        mode: "romance",
        rating: 5,
        venue_good: true,
        timing_good: false,
        would_repeat: true,
        note: "Great spot, would go again",
        activity_type: "Dinner",
        venue: "Luigi's",
        time_of_day: "evening",
        related_user_id: "partner-1",
      });
    });

    it("feeds the pair's behavior signal for a 1:1 plan with a resolvable partner", async () => {
      mockResultQueue.push({ data: { meta: {} }, error: null });
      mockResultQueue.push({ data: null, error: null });
      mockResultQueue.push({ data: null, error: null });

      await savePostPlanReview({
        plannerItemId: "plan-1",
        mode: "romance",
        rating: 2,
        relatedUserId: "partner-1",
      });

      expect(mockRecordPairBehaviorSignal).toHaveBeenCalledWith(
        expect.objectContaining({ partnerUserId: "partner-1", mode: "romance", kind: "plan_reviewed" })
      );
    });

    it("does not record a pair behavior signal when there is no partner (solo plan)", async () => {
      mockResultQueue.push({ data: { meta: {} }, error: null });
      mockResultQueue.push({ data: null, error: null });
      mockResultQueue.push({ data: null, error: null });

      await savePostPlanReview({ plannerItemId: "plan-1", mode: "friends", rating: 4 });

      expect(mockRecordPairBehaviorSignal).not.toHaveBeenCalled();
    });

    it("does not record a pair behavior signal for events mode", async () => {
      mockResultQueue.push({ data: { meta: {} }, error: null });
      mockResultQueue.push({ data: null, error: null });
      mockResultQueue.push({ data: null, error: null });

      await savePostPlanReview({ plannerItemId: "plan-1", mode: "events", rating: 4, relatedUserId: "partner-1" });

      expect(mockRecordPairBehaviorSignal).not.toHaveBeenCalled();
    });
  });

  describe("dismissPostPlanReview", () => {
    it("marks the plan as prompted without writing a plan_reviews row", async () => {
      mockResultQueue.push({ data: { meta: {} }, error: null });
      mockResultQueue.push({ data: null, error: null });

      await dismissPostPlanReview("plan-1");

      expect(mockCalls.some((c) => c.table === "plan_reviews")).toBe(false);
      expect(mockCalls.some((c) => c.table === "planner_items" && c.method === "update")).toBe(true);
    });
  });

  describe("timeOfDayFromIso", () => {
    it("buckets by local hour", () => {
      expect(timeOfDayFromIso(new Date(2026, 0, 15, 3, 0).toISOString())).toBe("night");
      expect(timeOfDayFromIso(new Date(2026, 0, 15, 9, 0).toISOString())).toBe("morning");
      expect(timeOfDayFromIso(new Date(2026, 0, 15, 14, 0).toISOString())).toBe("afternoon");
      expect(timeOfDayFromIso(new Date(2026, 0, 15, 19, 0).toISOString())).toBe("evening");
      expect(timeOfDayFromIso(new Date(2026, 0, 15, 23, 0).toISOString())).toBe("night");
    });

    it("returns null for a missing or unparseable timestamp", () => {
      expect(timeOfDayFromIso(null)).toBeNull();
      expect(timeOfDayFromIso(undefined)).toBeNull();
      expect(timeOfDayFromIso("not-a-date")).toBeNull();
    });
  });
});
