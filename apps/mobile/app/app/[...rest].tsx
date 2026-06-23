// Universal Link / App Link handler for https://mywinkly.de/app/*  — see docs/DEEP_LINKING.md.
//
// Reached when the OS opens the app from an https://mywinkly.de/app/... link (iOS Universal Links /
// Android App Links, configured in app.config.js + website/public/.well-known/). It reads the path
// after /app/ and redirects to the matching in-app screen, falling back to the app entry for anything
// unrecognized. This is a normal expo-router screen, so it does NOT touch the winkly:// auth callback.
//
// To add more shareable links, extend the segment mapping below (e.g. profiles, groups, invites).

import { Redirect, useLocalSearchParams } from "expo-router";

export default function AppDeepLinkCatchAll() {
  const { rest } = useLocalSearchParams<{ rest?: string | string[] }>();
  // Expo Router may hand back the catch-all as an array or a slash-joined string; normalize both.
  const segments = (Array.isArray(rest) ? rest : rest ? rest.split("/") : []).filter(Boolean);

  // /app/event/:id → event details
  if (segments[0] === "event" && segments[1]) {
    return (
      <Redirect href={`/(modes)/events/event-details?event_id=${encodeURIComponent(segments[1])}`} />
    );
  }

  // Unknown /app/* link → app entry; RouteGuard then routes the user appropriately.
  return <Redirect href="/" />;
}
