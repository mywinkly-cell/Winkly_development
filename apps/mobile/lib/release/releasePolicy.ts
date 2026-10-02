// apps/mobile/lib/release/releasePolicy.ts
// Minimum supported build (force-update) — see supabase/migrations/*_app_release_policy.sql.
// Fails open: any missing data or fetch error lets the app run, so an outage of this check can
// never lock users out.

import { Platform } from "react-native";
import * as Application from "expo-application";
import { supabase } from "@/lib/supabase";

export type ReleasePolicy = { minBuild: number; storeUrl: string | null };

/** True only when both numbers are known and the installed build is strictly lower. */
export function isBuildBelowMinimum(installedBuild: string | null | undefined, minBuild: number | null | undefined): boolean {
  if (!minBuild || minBuild <= 0) return false;
  const installed = Number.parseInt(String(installedBuild ?? ""), 10);
  if (!Number.isFinite(installed)) return false;
  return installed < minBuild;
}

export function installedBuildNumber(): string | null {
  return Application.nativeBuildVersion ?? null;
}

/** Fallback store link when the policy row has no store_url. */
export function defaultStoreUrl(): string | null {
  if (Platform.OS === "android") {
    return `https://play.google.com/store/apps/details?id=${Application.applicationId ?? "com.winkly.app"}`;
  }
  return null;
}

export async function fetchReleasePolicy(): Promise<ReleasePolicy | null> {
  if (Platform.OS !== "ios" && Platform.OS !== "android") return null;
  try {
    const { data, error } = await supabase
      .from("app_release_policy")
      .select("min_build, store_url")
      .eq("platform", Platform.OS)
      .maybeSingle();
    if (error || !data) return null;
    return { minBuild: data.min_build ?? 0, storeUrl: data.store_url ?? null };
  } catch {
    return null;
  }
}
