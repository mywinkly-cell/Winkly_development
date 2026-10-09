import {
  buildPlanShareMessage,
  deviceTimeZone,
  formatPlanShareWhen,
  isPlanShareToken,
  isRecentSignup,
  planShareTokenFromSegments,
  planShareUrl,
} from "@/lib/planShare/links";
import {
  createPlanShare,
  isPlanShareActive,
  mapAcceptResult,
  mapClaimResult,
  mapPlanShareRow,
  mapWebRsvpRow,
} from "@/lib/planShare/api";
import {
  clearPendingPlanShareToken,
  getPendingPlanShareToken,
  setPendingPlanShareToken,
  subscribePendingPlanShareToken,
} from "@/lib/planShare/pendingToken";
import { setAnalyticsClient, type AnalyticsClient } from "@/lib/analytics";
import {
  AnalyticsEvents,
  trackPlanShared,
  trackShareLinkOpened,
  trackShareRsvpConverted,
  trackSignupFromShare,
} from "@/lib/analytics/events";
import en from "@/lib/i18n/locales/en.json";

const mockRpc = jest.fn();
jest.mock("@/lib/supabase", () => ({ supabase: { rpc: (...args: unknown[]) => mockRpc(...args) } }));

const TOKEN = "abcdefghijklmnopqrstuvwx";

/** Minimal i18next-style t() over the real English strings. */
function t(key: string, options?: Record<string, unknown>): string {
  const template = (en as Record<string, string>)[key];
  if (!template) throw new Error(`missing key ${key}`);
  return template.replace(/\{\{(\w+)\}\}/g, (_, name: string) => String(options?.[name] ?? ""));
}

describe("plan share links", () => {
  it("accepts only URL-safe 20–64 char tokens", () => {
    expect(isPlanShareToken(TOKEN)).toBe(true);
    expect(isPlanShareToken("short")).toBe(false);
    expect(isPlanShareToken(`${TOKEN}/x`)).toBe(false);
    expect(isPlanShareToken(null)).toBe(false);
    expect(isPlanShareToken("a".repeat(65))).toBe(false);
  });

  it("builds the public web link", () => {
    expect(planShareUrl(TOKEN)).toBe(`https://mywinkly.de/p/${TOKEN}`);
    expect(planShareUrl(TOKEN, "https://preview.example.com/")).toBe(`https://preview.example.com/p/${TOKEN}`);
  });

  it("reads the token from /app/p/<token> deep-link segments only", () => {
    expect(planShareTokenFromSegments(["p", TOKEN])).toBe(TOKEN);
    expect(planShareTokenFromSegments(["p", "nope"])).toBeNull();
    expect(planShareTokenFromSegments(["event", TOKEN])).toBeNull();
    expect(planShareTokenFromSegments(["p", TOKEN, "extra"])).toBeNull();
    expect(planShareTokenFromSegments([])).toBeNull();
  });

  it("prefills the share text with title, when and link (interpolated, not concatenated)", () => {
    const msg = buildPlanShareMessage(t, { title: "Sunset picnic", when: "Sat, 12 Oct · 19:00", url: planShareUrl(TOKEN) });
    expect(msg).toBe(`I planned something for us 😄 Sunset picnic · Sat, 12 Oct · 19:00. You in? https://mywinkly.de/p/${TOKEN}`);
    expect(buildPlanShareMessage(t, { title: "Picnic", when: null, url: "https://x/p/1" })).toBe(
      "I planned something for us 😄 Picnic. You in? https://x/p/1",
    );
  });

  it("formats when with the app's locale formatters", () => {
    const when = formatPlanShareWhen("2026-10-12T17:00:00Z", "en-GB");
    expect(when).toMatch(/^Mon,? 12 Oct · \d{2}:\d{2}$/);
    expect(formatPlanShareWhen(null)).toBeNull();
    expect(formatPlanShareWhen("not a date")).toBeNull();
  });

  it("detects a recent signup (signup_from_share window)", () => {
    const now = new Date("2026-10-09T12:00:00Z");
    expect(isRecentSignup("2026-10-09T08:00:00Z", now)).toBe(true);
    expect(isRecentSignup("2026-10-07T08:00:00Z", now)).toBe(false);
    expect(isRecentSignup(null, now)).toBe(false);
    expect(isRecentSignup("garbage", now)).toBe(false);
  });

  it("reports a valid IANA time zone or null", () => {
    const zone = deviceTimeZone();
    expect(zone === null || /^[A-Za-z0-9_+/-]{1,64}$/.test(zone)).toBe(true);
  });
});

describe("plan share API mapping", () => {
  beforeEach(() => mockRpc.mockReset());

  it("maps a plan_shares row", () => {
    expect(
      mapPlanShareRow({
        id: "s1",
        token: TOKEN,
        expires_at: "2026-10-16T10:00:00Z",
        created_at: "2026-10-09T10:00:00Z",
        max_uses: null,
        use_count: 2,
        revoked_at: null,
      }),
    ).toEqual({
      id: "s1",
      token: TOKEN,
      expiresAt: "2026-10-16T10:00:00Z",
      createdAt: "2026-10-09T10:00:00Z",
      maxUses: null,
      useCount: 2,
      revokedAt: null,
    });
    expect(mapPlanShareRow({ id: "s1" })).toBeNull();
    expect(mapPlanShareRow(null)).toBeNull();
  });

  it("knows when a link is still usable", () => {
    const base = { id: "s", token: TOKEN, createdAt: "", expiresAt: "2026-10-16T10:00:00Z", maxUses: null, useCount: 0, revokedAt: null };
    const now = new Date("2026-10-10T00:00:00Z");
    expect(isPlanShareActive(base, now)).toBe(true);
    expect(isPlanShareActive({ ...base, revokedAt: "2026-10-09T00:00:00Z" }, now)).toBe(false);
    expect(isPlanShareActive({ ...base, expiresAt: "2026-10-09T00:00:00Z" }, now)).toBe(false);
    expect(isPlanShareActive({ ...base, maxUses: 2, useCount: 2 }, now)).toBe(false);
    expect(isPlanShareActive({ ...base, maxUses: 3, useCount: 2 }, now)).toBe(true);
  });

  it("maps web RSVPs (first name + status only)", () => {
    expect(mapWebRsvpRow({ id: "r1", first_name: "Anna", status: "pending", created_at: "x", email: "a@b.c" })).toEqual({
      id: "r1",
      firstName: "Anna",
      status: "pending",
      createdAt: "x",
    });
    expect(mapWebRsvpRow({ id: "r2", first_name: "Bo", status: "converted" })?.status).toBe("converted");
    expect(mapWebRsvpRow({ id: "r3" })).toBeNull();
  });

  it("maps accept_plan_share results, unknown → error", () => {
    expect(mapAcceptResult({ status: "ok", planner_item_id: "p1", already_joined: false, converted_rsvp: true })).toEqual({
      status: "ok",
      plannerItemId: "p1",
      alreadyJoined: false,
      convertedRsvp: true,
    });
    expect(mapAcceptResult({ status: "revoked" }).status).toBe("revoked");
    expect(mapAcceptResult({ status: "weird" }).status).toBe("error");
    expect(mapAcceptResult(null).status).toBe("error");
  });

  it("maps claim_plan_share_rsvps results", () => {
    expect(mapClaimResult({ converted: 2, planner_item_ids: ["a", "b"] })).toEqual({ converted: 2, plannerItemIds: ["a", "b"] });
    expect(mapClaimResult({})).toEqual({ converted: 0, plannerItemIds: [] });
  });

  it("creates a link with the device time zone and surfaces errors", async () => {
    mockRpc.mockResolvedValueOnce({
      data: { id: "s1", token: TOKEN, expires_at: "2026-10-16T10:00:00Z", use_count: 0 },
      error: null,
    });
    const share = await createPlanShare("item-1");
    expect(share.token).toBe(TOKEN);
    expect(mockRpc).toHaveBeenCalledWith("create_plan_share", {
      p_planner_item_id: "item-1",
      p_time_zone: deviceTimeZone(),
    });
    mockRpc.mockResolvedValueOnce({ data: null, error: { message: "denied" } });
    await expect(createPlanShare("item-2")).rejects.toEqual({ message: "denied" });
  });
});

describe("pending plan share token", () => {
  afterEach(() => clearPendingPlanShareToken());

  it("parks a valid token, notifies listeners and clears", async () => {
    const seen: (string | null)[] = [];
    const unsubscribe = subscribePendingPlanShareToken((tok) => seen.push(tok));
    await setPendingPlanShareToken("bad");
    expect(await getPendingPlanShareToken()).toBeNull();
    await setPendingPlanShareToken(TOKEN);
    expect(await getPendingPlanShareToken()).toBe(TOKEN);
    expect(seen).toEqual([TOKEN]);
    unsubscribe();
    await clearPendingPlanShareToken();
    expect(await getPendingPlanShareToken()).toBeNull();
  });
});

describe("plan share analytics", () => {
  afterEach(() => setAnalyticsClient(null));

  it("uses the canonical names and payloads", () => {
    const captured: { event: string; props?: Record<string, unknown> }[] = [];
    const client: AnalyticsClient = {
      identify: () => {},
      reset: () => {},
      capture: (event, props) => captured.push({ event, props }),
      screen: () => {},
    };
    setAnalyticsClient(client);
    trackPlanShared({ source: "weekly_spark" });
    trackShareLinkOpened({ surface: "app" });
    trackSignupFromShare({ via: "email" });
    trackShareRsvpConverted({ via: "signup", count: 1 });
    expect(AnalyticsEvents.WebRsvpSubmitted).toBe("web_rsvp_submitted");
    expect(captured).toEqual([
      { event: "plan_shared", props: { source: "weekly_spark" } },
      { event: "share_link_opened", props: { surface: "app" } },
      { event: "signup_from_share", props: { via: "email" } },
      { event: "share_rsvp_converted", props: { via: "signup", count: 1 } },
    ]);
  });
});
