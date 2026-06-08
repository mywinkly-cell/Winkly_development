import {
  type BusinessAnalyticsSummary,
  type BusinessAnalyticsEventType,
} from "@/lib/business/analyticsStore";

describe("business analytics types", () => {
  it("accepts canonical event types", () => {
    const types: BusinessAnalyticsEventType[] = [
      "profile_view",
      "offer_impression",
      "offer_tap",
      "add_to_planner",
    ];
    expect(types).toHaveLength(4);
  });

  it("summary shape matches dashboard metrics", () => {
    const summary: BusinessAnalyticsSummary = {
      profileViews: 1,
      offerImpressions: 2,
      offerTaps: 3,
      addToPlanner: 4,
    };
    expect(summary.profileViews + summary.addToPlanner).toBe(5);
  });
});
