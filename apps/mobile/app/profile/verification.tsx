// apps/mobile/app/profile/verification.tsx
//
// This route used to render a mock verification checklist: steps the user could
// tick themselves, a claim that "verified users get better visibility", and a
// button that popped an alert containing the word "Placeholder". The real,
// working feature is /account/photo-verification (lib/safety/photoVerification.ts
// → the verify-profile-photo Edge Function).
//
// Shipping both was a store-review risk and, worse, advertised a trust signal
// that did not exist (PROD-1, August 2026 audit). The screen is now a redirect
// so any existing deep link or back-stack entry lands on the real thing. Once
// nothing references this path, the file can be deleted outright.

import React from "react";
import { Redirect } from "expo-router";

export default function VerificationRedirect() {
  return <Redirect href="/account/photo-verification" />;
}
