// Hook to get the current user's city (and optional country) for Concierge default location.
// Reads user_profiles first (same source as onboarding profile-core), then profiles_core.

import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/lib/supabase";
import { getOwnProfileCore } from "@/lib/access/profiles";
import { expandCountryForDisplay, normalizeLocationDisplayString } from "@/lib/location/countryDisplay";

export type DefaultLocation = { city: string | null; country: string | null };

function normalizeLocationFields(
  cityRaw: string | null | undefined,
  countryRaw: string | null | undefined,
  appLanguage: string
): DefaultLocation {
  let city = cityRaw ? String(cityRaw).trim() || null : null;
  let countryRawNorm = countryRaw ? String(countryRaw).trim() || null : null;
  if (city?.includes(",")) {
    const norm = normalizeLocationDisplayString(city, appLanguage);
    const last = norm.lastIndexOf(",");
    if (last > 0) {
      city = norm.slice(0, last).trim() || null;
      const fromCombined = norm.slice(last + 1).trim() || null;
      countryRawNorm = fromCombined || countryRawNorm;
    }
  }
  const country = countryRawNorm ? expandCountryForDisplay(countryRawNorm, appLanguage) : null;
  return { city, country };
}

/**
 * Returns the signed-in user's city and country for pre-filling Concierge location.
 * Prefers `user_profiles` (onboarding / account settings) so it matches what the user sees in profile;
 * falls back to `profiles_core` (edit-core) when `user_profiles.city` is empty.
 */
export function useDefaultLocation(): DefaultLocation {
  const { i18n } = useTranslation();
  const appLanguage = i18n?.language ?? "en";
  const [location, setLocation] = useState<DefaultLocation>({ city: null, country: null });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid || cancelled) return;

      const { data: up } = await supabase
        .from("user_profiles")
        .select("city")
        .eq("id", uid)
        .maybeSingle();

      const upRow = up as { city?: string | null } | null;
      let cityRaw = upRow?.city ? String(upRow.city).trim() : null;
      let countryRaw: string | null = null;

      if (!cityRaw) {
        const profile = await getOwnProfileCore(uid);
        if (cancelled) return;
        const p = profile as Record<string, unknown> | null;
        cityRaw = p?.city ? String(p.city).trim() || null : null;
        countryRaw = p?.country ? String(p.country).trim() || null : null;
      }

      if (cancelled) return;
      setLocation(normalizeLocationFields(cityRaw, countryRaw, appLanguage));
    })();
    return () => {
      cancelled = true;
    };
  }, [appLanguage]);

  return location;
}

/** Returns only the city (for backward compatibility). Prefer useDefaultLocation() for new code. */
export function useDefaultCity(): string | null {
  const { i18n } = useTranslation();
  const appLanguage = i18n?.language ?? "en";
  const [city, setCity] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid || cancelled) return;

      const { data: up } = await supabase
        .from("user_profiles")
        .select("city")
        .eq("id", uid)
        .maybeSingle();
      let raw = (up as { city?: string } | null)?.city
        ? String((up as { city?: string }).city).trim()
        : "";

      if (!raw) {
        const profile = await getOwnProfileCore(uid);
        const p = profile as { city?: string | null } | null;
        raw = p?.city ? String(p.city).trim() : "";
      }

      if (!cancelled && raw) {
        setCity(normalizeLocationDisplayString(raw, appLanguage));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [appLanguage]);
  return city;
}
