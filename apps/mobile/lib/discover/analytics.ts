/**
 * Discover analytics — compatibility wrappers around canonical events in
 * lib/analytics/events.ts. The PostHog parameter is accepted for legacy call
 * sites but routing goes through the shared track() abstraction.
 */

import type { PostHog } from "posthog-react-native";
import {
  trackDiscoverOpen,
  trackDiscoverProfileBlock,
  trackDiscoverProfileReport,
  trackLikedYouLikeBack,
  trackLikedYouView,
  trackMatchCreatedFromDiscover,
  trackRecommendationLimitReached,
  trackRecommendationLike,
  trackRecommendationView,
  type DiscoverMode,
} from "@/lib/analytics/events";

/** @deprecated PostHog client is unused; kept for call-site compatibility. */
type PostHogLike = PostHog | null;

export function discoverOpen(_posthog: PostHogLike, mode: DiscoverMode) {
  trackDiscoverOpen(mode);
}

export function likedYouView(_posthog: PostHogLike, mode: DiscoverMode) {
  trackLikedYouView(mode);
}

export function likedYouLikeBack(_posthog: PostHogLike, mode: DiscoverMode, targetId: string) {
  trackLikedYouLikeBack(mode, targetId);
}

export function recommendationView(_posthog: PostHogLike, mode: DiscoverMode, targetId: string) {
  trackRecommendationView(mode, targetId);
}

export function recommendationLike(_posthog: PostHogLike, mode: DiscoverMode, targetId: string) {
  trackRecommendationLike(mode, targetId);
}

export function recommendationLimitReached(_posthog: PostHogLike, mode: DiscoverMode) {
  trackRecommendationLimitReached(mode);
}

export function discoverProfileBlock(_posthog: PostHogLike, mode: DiscoverMode, targetId: string) {
  trackDiscoverProfileBlock(mode, targetId);
}

export function discoverProfileReport(_posthog: PostHogLike, mode: DiscoverMode, targetId: string) {
  trackDiscoverProfileReport(mode, targetId);
}

export function matchCreatedFromDiscover(_posthog: PostHogLike, mode: DiscoverMode, targetId: string) {
  trackMatchCreatedFromDiscover(mode, targetId);
}
