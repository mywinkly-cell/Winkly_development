import { setAnalyticsClient, type AnalyticsClient } from "@/lib/analytics";
import {
  AnalyticsEvents,
  trackAccountCreated,
  trackChatStarted,
  trackDiscoverOpen,
  trackEventRsvp,
  trackMatchCreated,
  trackModeSelected,
  trackOnboardingCompleted,
  trackRecommendationLike,
  trackSubscriptionUpgraded,
} from "@/lib/analytics/events";

type Captured = { event: string; props?: Record<string, unknown> };

function mockClient(): { client: AnalyticsClient; captured: Captured[] } {
  const captured: Captured[] = [];
  const client: AnalyticsClient = {
    identify: () => {},
    reset: () => {},
    capture: (event, props) => captured.push({ event, props }),
    screen: () => {},
  };
  return { client, captured };
}

describe("analytics event taxonomy", () => {
  afterEach(() => setAnalyticsClient(null));

  it("uses the canonical snake_case names", () => {
    expect(AnalyticsEvents.ModeSelected).toBe("mode_selected");
    expect(AnalyticsEvents.MatchCreated).toBe("match_created");
    expect(AnalyticsEvents.ChatStarted).toBe("chat_started");
    expect(AnalyticsEvents.EventRsvp).toBe("event_rsvp");
    expect(AnalyticsEvents.SubscriptionUpgraded).toBe("subscription_upgraded");
    expect(AnalyticsEvents.AccountCreated).toBe("account_created");
    expect(AnalyticsEvents.OnboardingCompleted).toBe("onboarding_completed");
    expect(AnalyticsEvents.DiscoverOpen).toBe("discover_open");
    expect(AnalyticsEvents.RecommendationLike).toBe("recommendation_like");
  });

  it("emits typed payloads through the registered client", () => {
    const { client, captured } = mockClient();
    setAnalyticsClient(client);

    trackModeSelected("romance");
    trackMatchCreated({ mode: "romance", match_id: "m1", source: "discover" });
    trackChatStarted({ mode: "friends", chat_id: "c1" });
    trackEventRsvp({ event_id: "e1", status: "going" });
    trackSubscriptionUpgraded({ from_tier: "free", to_tier: "premium" });
    trackAccountCreated({ account_type: "personal", method: "email" });
    trackOnboardingCompleted({ account_type: "business" });
    trackDiscoverOpen("romance");
    trackRecommendationLike("friends", "user-42");

    expect(captured).toEqual([
      { event: "mode_selected", props: { mode: "romance" } },
      { event: "match_created", props: { mode: "romance", match_id: "m1", source: "discover" } },
      { event: "chat_started", props: { mode: "friends", chat_id: "c1" } },
      { event: "event_rsvp", props: { event_id: "e1", status: "going" } },
      { event: "subscription_upgraded", props: { from_tier: "free", to_tier: "premium" } },
      { event: "account_created", props: { account_type: "personal", method: "email" } },
      { event: "onboarding_completed", props: { account_type: "business" } },
      { event: "discover_open", props: { mode: "romance" } },
      { event: "recommendation_like", props: { mode: "friends", target_id: "user-42" } },
    ]);
  });

  it("is a safe no-op when no client is registered", () => {
    expect(() => trackModeSelected("events")).not.toThrow();
  });
});
