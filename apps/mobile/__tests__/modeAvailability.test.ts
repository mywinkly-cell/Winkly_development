import {
  canAccessBusinessRoutes,
  isAccountTypeAvailable,
  isAccountTypeParked,
  isModeAvailable,
  isWhoJoiningAvailable,
  LAUNCH_FLAGS,
  type LaunchFlags,
} from "@/lib/modes/availability";
import { BUSINESS_ACCOUNTS_ENABLED, BUSINESS_MODE_ENABLED } from "@/config/flags";
import { buildBusinessWaitlistNote } from "@/lib/modes/businessWaitlist";
import { resolveRouteAction, type RouteGuardInput } from "@/lib/routing/guards";

const OFF: LaunchFlags = { businessModeEnabled: false, businessAccountsEnabled: false };
const ON: LaunchFlags = { businessModeEnabled: true, businessAccountsEnabled: true };
const ACCOUNTS_ONLY: LaunchFlags = { businessModeEnabled: false, businessAccountsEnabled: true };

describe("launch flags", () => {
  it("ships the closed beta with Business mode and business accounts off", () => {
    expect(BUSINESS_MODE_ENABLED).toBe(false);
    expect(BUSINESS_ACCOUNTS_ENABLED).toBe(false);
    expect(LAUNCH_FLAGS).toEqual(OFF);
  });
});

describe("isModeAvailable", () => {
  it("keeps Romance, Friends and Events live regardless of flags", () => {
    for (const flags of [OFF, ON]) {
      expect(isModeAvailable("romance", flags)).toBe(true);
      expect(isModeAvailable("friends", flags)).toBe(true);
      expect(isModeAvailable("events", flags)).toBe(true);
    }
  });

  it("gates Business on BUSINESS_MODE_ENABLED only", () => {
    expect(isModeAvailable("business", OFF)).toBe(false);
    expect(isModeAvailable("business", ACCOUNTS_ONLY)).toBe(false);
    expect(isModeAvailable("business", ON)).toBe(true);
  });

  it("defaults to the build's launch flags", () => {
    expect(isModeAvailable("business")).toBe(BUSINESS_MODE_ENABLED);
  });
});

describe("account types", () => {
  it("always allows personal accounts", () => {
    expect(isAccountTypeAvailable("personal", OFF)).toBe(true);
  });

  it("gates business accounts on BUSINESS_ACCOUNTS_ENABLED", () => {
    expect(isAccountTypeAvailable("business", OFF)).toBe(false);
    expect(isAccountTypeAvailable("business", ACCOUNTS_ONLY)).toBe(true);
  });

  it("parks only existing business accounts while the flag is off", () => {
    expect(isAccountTypeParked("business", OFF)).toBe(true);
    expect(isAccountTypeParked("business", ACCOUNTS_ONLY)).toBe(false);
    expect(isAccountTypeParked("personal", OFF)).toBe(false);
    expect(isAccountTypeParked(undefined, OFF)).toBe(false);
    expect(isAccountTypeParked(null, OFF)).toBe(false);
  });
});

describe("canAccessBusinessRoutes", () => {
  it("blocks everyone when both flags are off", () => {
    expect(canAccessBusinessRoutes("personal", OFF)).toBe(false);
    expect(canAccessBusinessRoutes("business", OFF)).toBe(false);
  });

  it("lets business accounts in when accounts are live even if the mode is off", () => {
    expect(canAccessBusinessRoutes("business", ACCOUNTS_ONLY)).toBe(true);
    expect(canAccessBusinessRoutes("personal", ACCOUNTS_ONLY)).toBe(false);
  });

  it("lets everyone in when Business mode is live", () => {
    expect(canAccessBusinessRoutes("personal", ON)).toBe(true);
  });
});

describe("isWhoJoiningAvailable", () => {
  it("hides invite_business while Business mode is off", () => {
    expect(isWhoJoiningAvailable("invite_business", OFF)).toBe(false);
    expect(isWhoJoiningAvailable("invite_business", ON)).toBe(true);
  });

  it("keeps the other options", () => {
    for (const who of ["just_me", "invite_match", "invite_friends", "invite_contacts", "decide_later", "share"] as const) {
      expect(isWhoJoiningAvailable(who, OFF)).toBe(true);
    }
  });
});

describe("buildBusinessWaitlistNote", () => {
  it("serializes known interests in canonical order plus trimmed text", () => {
    expect(JSON.parse(buildBusinessWaitlistNote(["clients", "experts_collaborators"], "  meet   founders "))).toEqual({
      v: 1,
      interests: ["experts_collaborators", "clients"],
      text: "meet founders",
    });
  });

  it("drops unknown interests and empty text but stays non-empty", () => {
    const note = buildBusinessWaitlistNote(["bogus"], "   ");
    expect(JSON.parse(note)).toEqual({ v: 1, interests: [], text: null });
    expect(note.length).toBeGreaterThan(0);
  });

  it("caps free text length", () => {
    const parsed = JSON.parse(buildBusinessWaitlistNote([], "x".repeat(500)));
    expect(parsed.text).toHaveLength(200);
  });
});

describe("resolveRouteAction with launch flags", () => {
  const base: RouteGuardInput = {
    loading: false,
    modeLoading: false,
    hasSession: true,
    path: "",
    activeMode: null,
    permissions: ["events", "romance", "friends", "business"],
    accountType: "personal",
    flags: OFF,
  };

  it("bounces personal users off Business mode routes (deep links, stale nav state)", () => {
    for (const path of ["(modes)/business", "(modes)/business/chats/abc", "business/analytics"]) {
      expect(resolveRouteAction({ ...base, path, activeMode: "business" })).toEqual({
        type: "redirect",
        to: "/(tabs)/mode-selection",
      });
    }
  });

  it("bounces users off business onboarding while accounts are parked", () => {
    expect(resolveRouteAction({ ...base, path: "(onboarding-business)/get-started-business" })).toEqual({
      type: "redirect",
      to: "/(tabs)/mode-selection",
    });
  });

  it("pins parked business accounts to the coming-soon screen but leaves auth routes reachable", () => {
    const parked = { ...base, accountType: "business" };
    expect(resolveRouteAction({ ...parked, path: "(tabs)/mode-selection" })).toEqual({
      type: "redirect",
      to: "/(auth)/business-coming-soon",
    });
    expect(resolveRouteAction({ ...parked, path: "(auth)/business-coming-soon" })).toEqual({ type: "none" });
    expect(resolveRouteAction({ ...parked, path: "(auth)/signin" })).toEqual({ type: "none" });
  });

  it("leaves Romance, Friends and Events routes alone", () => {
    for (const mode of ["romance", "friends", "events"] as const) {
      expect(resolveRouteAction({ ...base, path: `(modes)/${mode}/discover`, activeMode: mode })).toEqual({ type: "none" });
    }
  });

  it("allows Business routes once the relevant flag is on", () => {
    expect(resolveRouteAction({ ...base, path: "(modes)/business", activeMode: "business", flags: ON })).toEqual({
      type: "none",
    });
    expect(
      resolveRouteAction({
        ...base,
        accountType: "business",
        path: "(modes)/business/analytics",
        activeMode: "business",
        flags: ACCOUNTS_ONLY,
      })
    ).toEqual({ type: "none" });
  });
});
