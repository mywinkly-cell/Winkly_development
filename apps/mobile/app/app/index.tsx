// Bare https://mywinkly.de/app → app entry. The /app/* deep-link mapping lives in
// app/app/[...rest].tsx. See docs/DEEP_LINKING.md.

import { Redirect } from "expo-router";

export default function AppDeepLinkIndex() {
  return <Redirect href="/" />;
}
