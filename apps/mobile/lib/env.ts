// apps/mobile/lib/env.ts
// Single, validated source of truth for EXPO_PUBLIC_* runtime config.
// Pure functions (readPublicEnv/validatePublicEnv) are unit-tested; the
// useEnv() hook is the React entry point for screens/components.

import { useMemo } from "react";

export type PublicEnv = {
  supabaseUrl: string;
  supabaseAnonKey: string;
  authRedirectUrl: string;
  posthogApiKey: string;
  posthogHost: string;
  sentryDsn: string;
  /** True when a PostHog key is present — gate analytics UI/providers on this. */
  analyticsEnabled: boolean;
  /** True when a Sentry DSN is present — gate crash reporting on this. */
  monitoringEnabled: boolean;
};

export type EnvValidationResult = {
  valid: boolean;
  /** EXPO_PUBLIC_* keys that are required but missing/blank. */
  missing: string[];
};

const DEFAULT_POSTHOG_HOST = "https://us.i.posthog.com";
const DEFAULT_AUTH_REDIRECT = "winkly://callback";

type EnvSource = Record<string, string | undefined>;

function read(source: EnvSource, key: string, fallback = ""): string {
  const raw = source[key];
  const value = typeof raw === "string" ? raw.trim() : "";
  return value || fallback;
}

/**
 * Pure: derive the public env object from an arbitrary source map.
 * Defaults to process.env. Injectable for tests.
 */
export function readPublicEnv(source: EnvSource = process.env): PublicEnv {
  const supabaseUrl = read(source, "EXPO_PUBLIC_SUPABASE_URL");
  const supabaseAnonKey = read(source, "EXPO_PUBLIC_SUPABASE_ANON_KEY");
  const authRedirectUrl = read(source, "EXPO_PUBLIC_AUTH_REDIRECT_URL", DEFAULT_AUTH_REDIRECT);
  const posthogApiKey = read(source, "EXPO_PUBLIC_POSTHOG_API_KEY");
  const posthogHost = read(source, "EXPO_PUBLIC_POSTHOG_HOST", DEFAULT_POSTHOG_HOST);
  const sentryDsn = read(source, "EXPO_PUBLIC_SENTRY_DSN");

  return {
    supabaseUrl,
    supabaseAnonKey,
    authRedirectUrl,
    posthogApiKey,
    posthogHost,
    sentryDsn,
    analyticsEnabled: posthogApiKey.length > 0,
    monitoringEnabled: sentryDsn.length > 0,
  };
}

/** Pure: the env is usable only when both required Supabase vars are present. */
export function validatePublicEnv(env: PublicEnv): EnvValidationResult {
  const missing: string[] = [];
  if (!env.supabaseUrl) missing.push("EXPO_PUBLIC_SUPABASE_URL");
  if (!env.supabaseAnonKey) missing.push("EXPO_PUBLIC_SUPABASE_ANON_KEY");
  return { valid: missing.length === 0, missing };
}

let _cached: PublicEnv | null = null;

/** Memoized accessor for non-React code paths. */
export function getPublicEnv(): PublicEnv {
  if (!_cached) _cached = readPublicEnv();
  return _cached;
}

/** Test-only: clear the memoized env so a fresh source map is read. */
export function __resetEnvCache(): void {
  _cached = null;
}

/** React hook: stable reference to the validated public env. */
export function useEnv(): PublicEnv {
  return useMemo(() => getPublicEnv(), []);
}
