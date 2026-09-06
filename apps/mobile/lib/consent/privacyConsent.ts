// apps/mobile/lib/consent/privacyConsent.ts
//
// Privacy-consent gate (GDPR). The app must capture explicit agreement to the
// data-use notice BEFORE any personal data is entered, and explicit consent is
// the lawful basis for the optional special-category field (religion). The
// acceptance is recorded server-side (record_privacy_consent RPC) and read back
// from public.users.privacy_consent_at / _version.
//
// Bump PRIVACY_CONSENT_VERSION whenever the notice changes materially — that
// forces every existing user to re-accept the new version.

import { supabase } from "@/lib/supabase";

/** Change this when the data-use notice changes materially → forces re-consent. */
export const PRIVACY_CONSENT_VERSION = "2026-09-05";

/** True when the signed-in user has accepted the CURRENT notice version. */
export async function hasAcceptedPrivacyConsent(): Promise<boolean> {
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) return false;

  const { data, error } = await supabase
    .from("users")
    .select("privacy_consent_at, privacy_consent_version")
    .eq("id", uid)
    .maybeSingle();

  if (error || !data) return false;
  return !!data.privacy_consent_at && data.privacy_consent_version === PRIVACY_CONSENT_VERSION;
}

/** Record acceptance of the current notice version. Returns true on success. */
export async function recordPrivacyConsent(): Promise<boolean> {
  const { error } = await supabase.rpc("record_privacy_consent", {
    p_version: PRIVACY_CONSENT_VERSION,
  });
  if (error) {
    console.warn("[consent] record_privacy_consent failed:", error.message);
    return false;
  }
  return true;
}
