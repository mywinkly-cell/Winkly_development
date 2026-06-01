import { setAnalyticsClient, type AnalyticsClient } from "@/lib/analytics";
import {
  AnalyticsEvents,
  trackChatStarted,
  trackEventRsvp,
  trackMatchCreated,
  trackModeSelected,
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
  });

  it("emits typed payloads through the registered client", () => {
    const { client, captured } = mockClient();
    setAnalyticsClient(client);

    trackModeSelected("romance");
    trackMatchCreated({ mode: "romance", match_id: "m1", source: "discover" });
    trackChatStarted({ mode: "friends", chat_id: "c1" });
    trackEventRsvp({ event_id: "e1", status: "going" });
    trackSubscriptionUpgraded({ from_tier: "free", to_tier: "premium" });

    expect(captured).toEqual([
      { event: "mode_selected", props: { mode: "romance" } },
      { event: "match_created", props: { mode: "romance", match_id: "m1", source: "discover" } },
      { event: "chat_started", props: { mode: "friends", chat_id: "c1" } },
      { event: "event_rsvp", props: { event_id: "e1", status: "going" } },
      { event: "subscription_upgraded", props: { from_tier: "free", to_tier: "premium" } },
    ]);
  });

  it("is a safe no-op when no client is registered", () => {
    expect(() => trackModeSelected("events")).not.toThrow();
  });
});
