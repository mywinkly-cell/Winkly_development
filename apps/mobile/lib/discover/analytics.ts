/**
 * Discover analytics — events for Discover tab (People Who Liked You, Recommended).
 * Use with usePostHog(); when PostHog is disabled, capture is a no-op.
 */

import type { PostHog } from "posthog-react-native";

/** Accepts real PostHog client or null when analytics is off. */
type PostHogLike = PostHog | null;

export function discoverOpen(posthog: PostHogLike, mode: "romance" | "friends") {
  posthog?.capture("discover_open", { mode });
}

export function likedYouView(posthog: PostHogLike, mode: "romance" | "friends") {
  posthog?.capture("liked_you_view", { mode });
}

export function likedYouLikeBack(posthog: PostHogLike, mode: "romance" | "friends", targetId: string) {
  posthog?.capture("liked_you_like_back", { mode, target_id: targetId });
}

export function recommendationView(posthog: PostHogLike, mode: "romance" | "friends", targetId: string) {
  posthog?.capture("recommendation_view", { mode, target_id: targetId });
}

export function recommendationLike(posthog: PostHogLike, mode: "romance" | "friends", targetId: string) {
  posthog?.capture("recommendation_like", { mode, target_id: targetId });
}

export function recommendationLimitReached(posthog: PostHogLike, mode: "romance" | "friends") {
  posthog?.capture("recommendation_limit_reached", { mode });
}

export function discoverProfileBlock(posthog: PostHogLike, mode: "romance" | "friends", targetId: string) {
  posthog?.capture("discover_profile_block", { mode, target_id: targetId });
}

export function discoverProfileReport(posthog: PostHogLike, mode: "romance" | "friends", targetId: string) {
  posthog?.capture("discover_profile_report", { mode, target_id: targetId });
}

export function matchCreatedFromDiscover(posthog: PostHogLike, mode: "romance" | "friends", targetId: string) {
  posthog?.capture("match_created_from_discover", { mode, target_id: targetId });
}
