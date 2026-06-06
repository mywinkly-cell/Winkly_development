// Premium native-stack transitions (Hinge / Airbnb / iOS 14+ style).
// — Hub switches (bottom nav, mode gateway): no slide — instant like tab bars.
// — Context switches (modes ↔ tabs, mode pick): short cross-fade.
// — Drill-down (profile, chat thread, filters): simple_push (iOS) / slide (Android).

import { Platform } from "react-native";
import type { NativeStackNavigationOptions } from "@react-navigation/native-stack";

export const NAV_ANIMATION_DURATION_MS = Platform.select({
  ios: 280,
  android: 220,
  default: 220,
}) as number;

export type StackAnimation = NonNullable<NativeStackNavigationOptions["animation"]>;

/** Push detail screens — keeps interactive swipe-back on both platforms. */
export function pushStackAnimation(): StackAnimation {
  if (Platform.OS === "ios") return "simple_push";
  if (Platform.OS === "android") return "slide_from_right";
  return "fade";
}

/** Switching major app areas (tabs hub ↔ mode sub-app). */
export function contextSwitchAnimation(): StackAnimation {
  return "fade";
}

/** In-mode / in-tab bottom bar — no horizontal slide between siblings. */
export function hubSwitchAnimation(): StackAnimation {
  return "none";
}

export function premiumPushStackScreenOptions(
  overrides?: NativeStackNavigationOptions
): NativeStackNavigationOptions {
  return {
    gestureEnabled: true,
    fullScreenGestureEnabled: Platform.OS === "ios",
    animation: pushStackAnimation(),
    animationDuration: NAV_ANIMATION_DURATION_MS,
    ...overrides,
  };
}

export function premiumHubStackScreenOptions(
  overrides?: NativeStackNavigationOptions
): NativeStackNavigationOptions {
  return {
    animation: hubSwitchAnimation(),
    gestureEnabled: true,
    ...overrides,
  };
}

export function premiumContextStackScreenOptions(
  overrides?: NativeStackNavigationOptions
): NativeStackNavigationOptions {
  return {
    gestureEnabled: true,
    animation: contextSwitchAnimation(),
    animationDuration: NAV_ANIMATION_DURATION_MS,
    ...overrides,
  };
}

/** Bottom-nav targets inside each mode stack. */
export const MODE_HUB_SCREEN_NAMES = ["index", "discover", "chats", "planner"] as const;

/** Main tabs hub stacks (inbox, planner home, mode gateway). */
export const TAB_HUB_SCREEN_NAMES = ["index", "filters", "start"] as const;
