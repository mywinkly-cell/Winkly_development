import { readPublicEnv, validatePublicEnv } from "@/lib/env";

describe("readPublicEnv", () => {
  it("reads and trims values from the source map", () => {
    const env = readPublicEnv({
      EXPO_PUBLIC_SUPABASE_URL: "  https://x.supabase.co  ",
      EXPO_PUBLIC_SUPABASE_ANON_KEY: "eyJabc",
      EXPO_PUBLIC_POSTHOG_API_KEY: "phc_123",
      EXPO_PUBLIC_SENTRY_DSN: "https://dsn@sentry.io/1",
    });
    expect(env.supabaseUrl).toBe("https://x.supabase.co");
    expect(env.supabaseAnonKey).toBe("eyJabc");
    expect(env.analyticsEnabled).toBe(true);
    expect(env.monitoringEnabled).toBe(true);
  });

  it("applies sensible defaults for optional vars", () => {
    const env = readPublicEnv({});
    expect(env.posthogHost).toBe("https://us.i.posthog.com");
    expect(env.authRedirectUrl).toBe("winkly://callback");
    expect(env.analyticsEnabled).toBe(false);
    expect(env.monitoringEnabled).toBe(false);
  });
});

describe("validatePublicEnv", () => {
  it("is valid when both Supabase vars are present", () => {
    const env = readPublicEnv({
      EXPO_PUBLIC_SUPABASE_URL: "https://x.supabase.co",
      EXPO_PUBLIC_SUPABASE_ANON_KEY: "eyJabc",
    });
    expect(validatePublicEnv(env)).toEqual({ valid: true, missing: [] });
  });

  it("reports the specific missing required vars", () => {
    const result = validatePublicEnv(readPublicEnv({}));
    expect(result.valid).toBe(false);
    expect(result.missing).toEqual([
      "EXPO_PUBLIC_SUPABASE_URL",
      "EXPO_PUBLIC_SUPABASE_ANON_KEY",
    ]);
  });
});
