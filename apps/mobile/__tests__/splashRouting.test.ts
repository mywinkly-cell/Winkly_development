import {
  getEffectiveLastActivityMs,
  isActivityRecent,
  RECENT_ACTIVITY_WINDOW_MS,
} from "@/lib/lastActivity";
import {
  isBusinessProfileComplete,
  isPersonalProfileComplete,
  resolveAuthenticatedSplashRoute,
  resolveUnauthenticatedSplashRoute,
} from "@/lib/routing/splash";

describe("resolveUnauthenticatedSplashRoute", () => {
  it("sends first-time users to welcome intro", () => {
    expect(resolveUnauthenticatedSplashRoute({ introSeen: false })).toEqual({ route: "welcome-intro" });
  });

  it("sends returning visitors without a session to sign in", () => {
    expect(resolveUnauthenticatedSplashRoute({ introSeen: true })).toEqual({ route: "signin" });
  });
});

describe("resolveAuthenticatedSplashRoute", () => {
  it("requires email verification first", () => {
    expect(
      resolveAuthenticatedSplashRoute({
        emailConfirmed: false,
        recentActivity: true,
        profileComplete: true,
      })
    ).toEqual({ route: "verify" });
  });

  it("requires re-login when activity is older than two weeks", () => {
    expect(
      resolveAuthenticatedSplashRoute({
        emailConfirmed: true,
        recentActivity: false,
        profileComplete: true,
      })
    ).toEqual({ route: "signin", staleSession: true });
  });

  it("opens mode selection for recent users with a complete profile", () => {
    expect(
      resolveAuthenticatedSplashRoute({
        emailConfirmed: true,
        recentActivity: true,
        profileComplete: true,
      })
    ).toEqual({ route: "mode-selection" });
  });

  it("routes incomplete profiles to welcome-back setup", () => {
    expect(
      resolveAuthenticatedSplashRoute({
        emailConfirmed: true,
        recentActivity: true,
        profileComplete: false,
      })
    ).toEqual({ route: "welcome-back-setup" });
  });
});

describe("isActivityRecent", () => {
  const now = Date.UTC(2026, 5, 4);

  it("is recent within the two-week window", () => {
    const at = now - RECENT_ACTIVITY_WINDOW_MS + 60_000;
    expect(isActivityRecent(at, now)).toBe(true);
  });

  it("is not recent after the two-week window", () => {
    const at = now - RECENT_ACTIVITY_WINDOW_MS - 1;
    expect(isActivityRecent(at, now)).toBe(false);
  });

  it("uses the later of local activity and last sign-in", () => {
    const local = Date.parse("2026-01-01T00:00:00Z");
    const signIn = "2026-05-20T00:00:00Z";
    expect(getEffectiveLastActivityMs(local, signIn)).toBe(Date.parse(signIn));
  });
});

describe("profile completeness helpers", () => {
  it("detects a complete personal profile", () => {
    expect(
      isPersonalProfileComplete({
        first_name: "A",
        last_name: "B",
        gender: "woman",
        birthday: "2000-01-01",
        city: "Berlin",
        core_photos: ["https://example.com/p.jpg"],
      })
    ).toBe(true);
  });

  it("detects a complete business profile", () => {
    expect(isBusinessProfileComplete({ business_name: "Acme" })).toBe(true);
  });
});
