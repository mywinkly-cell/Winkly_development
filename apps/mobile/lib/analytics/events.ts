// apps/mobile/lib/analytics/events.ts
// Canonical event taxonomy. ALL product events should be defined here with a
// snake_case name and a typed payload helper so post-launch analytics stay
// consistent instead of becoming free-text noise.
//
// Naming convention: <object>_<past-tense-verb> (e.g. match_created), lower
// snake_case, with stable property keys. Add new events here, never inline.

import { track, type AnalyticsProps } from "@/lib/analytics";
import type { Mode, SubscriptionTier } from "@/types";

export const AnalyticsEvents = {
  // Core launch funnel
  ModeSelected: "mode_selected",
  MatchCreated: "match_created",
  ChatStarted: "chat_started",
  EventRsvp: "event_rsvp",
  SubscriptionUpgraded: "subscription_upgraded",
  // Supporting funnel events
  AccountCreated: "account_created",
  OnboardingCompleted: "onboarding_completed",
  OnboardingSubProfileSkipped: "onboarding_subprofile_skipped",
  // Discover tab
  DiscoverOpen: "discover_open",
  LikedYouView: "liked_you_view",
  LikedYouLikeBack: "liked_you_like_back",
  RecommendationView: "recommendation_view",
  RecommendationLike: "recommendation_like",
  RecommendationLimitReached: "recommendation_limit_reached",
  DiscoverProfileBlock: "discover_profile_block",
  DiscoverProfileReport: "discover_profile_report",
  MatchCreatedFromDiscover: "match_created_from_discover",
} as const;

export type AnalyticsEventName = (typeof AnalyticsEvents)[keyof typeof AnalyticsEvents];

export type DiscoverMode = "romance" | "friends";

/** Generic escape hatch — prefer the typed helpers below. */
export function trackEvent(event: AnalyticsEventName, props?: AnalyticsProps): void {
  track(event, props);
}

export function trackModeSelected(mode: Mode, props?: AnalyticsProps): void {
  track(AnalyticsEvents.ModeSelected, { mode, ...props });
}

export function trackMatchCreated(p: {
  mode: Mode;
  match_id?: string;
  source?: "discover" | "liked_you" | "super_like" | string;
}): void {
  track(AnalyticsEvents.MatchCreated, { ...p });
}

export function trackChatStarted(p: { mode: Mode; chat_id?: string; match_id?: string }): void {
  track(AnalyticsEvents.ChatStarted, { ...p });
}

export function trackEventRsvp(p: {
  event_id: string;
  status: "going" | "interested" | "declined" | string;
}): void {
  track(AnalyticsEvents.EventRsvp, { ...p });
}

export function trackSubscriptionUpgraded(p: {
  from_tier: SubscriptionTier;
  to_tier: SubscriptionTier;
  source?: string;
}): void {
  track(AnalyticsEvents.SubscriptionUpgraded, { ...p });
}

export function trackAccountCreated(p: { account_type: string; method?: string }): void {
  track(AnalyticsEvents.AccountCreated, { ...p });
}

export function trackOnboardingCompleted(p: { account_type: string }): void {
  track(AnalyticsEvents.OnboardingCompleted, { ...p });
}

export function trackOnboardingSubProfileSkipped(p: {
  skipped_mode: "romance" | "friends" | "business";
  onboarding_step: number;
}): void {
  track(AnalyticsEvents.OnboardingSubProfileSkipped, { ...p });
}

export function trackDiscoverOpen(mode: DiscoverMode): void {
  track(AnalyticsEvents.DiscoverOpen, { mode });
}

export function trackLikedYouView(mode: DiscoverMode): void {
  track(AnalyticsEvents.LikedYouView, { mode });
}

export function trackLikedYouLikeBack(mode: DiscoverMode, targetId: string): void {
  track(AnalyticsEvents.LikedYouLikeBack, { mode, target_id: targetId });
}

export function trackRecommendationView(mode: DiscoverMode, targetId: string): void {
  track(AnalyticsEvents.RecommendationView, { mode, target_id: targetId });
}

export function trackRecommendationLike(mode: DiscoverMode, targetId: string): void {
  track(AnalyticsEvents.RecommendationLike, { mode, target_id: targetId });
}

export function trackRecommendationLimitReached(mode: DiscoverMode): void {
  track(AnalyticsEvents.RecommendationLimitReached, { mode });
}

export function trackDiscoverProfileBlock(mode: DiscoverMode, targetId: string): void {
  track(AnalyticsEvents.DiscoverProfileBlock, { mode, target_id: targetId });
}

export function trackDiscoverProfileReport(mode: DiscoverMode, targetId: string): void {
  track(AnalyticsEvents.DiscoverProfileReport, { mode, target_id: targetId });
}

export function trackMatchCreatedFromDiscover(mode: DiscoverMode, targetId: string): void {
  track(AnalyticsEvents.MatchCreatedFromDiscover, { mode, target_id: targetId });
}
