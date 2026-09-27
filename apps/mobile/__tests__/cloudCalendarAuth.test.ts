import * as WebBrowser from "expo-web-browser";
import { connectCloudCalendar, parseCallbackParams } from "@/lib/integrations/cloudCalendarAuth";

jest.mock("expo-web-browser", () => ({
  openAuthSessionAsync: jest.fn(),
}));

jest.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      getSession: jest.fn(async () => ({ data: { session: { access_token: "user-jwt" } } })),
    },
  },
}));

const openAuthSession = WebBrowser.openAuthSessionAsync as jest.Mock;
const CODE = "a".repeat(43);

function jsonResponse(body: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as unknown as Response;
}

describe("parseCallbackParams", () => {
  it("reads params from a custom-scheme redirect", () => {
    const p = parseCallbackParams(`winkly://calendar-callback?status=success&provider=google&code=${CODE}`);
    expect(p.get("status")).toBe("success");
    expect(p.get("provider")).toBe("google");
    expect(p.get("code")).toBe(CODE);
  });

  it("ignores a fragment and tolerates no query", () => {
    expect(parseCallbackParams(`winkly://calendar-callback?code=${CODE}#x`).get("code")).toBe(CODE);
    expect(parseCallbackParams("winkly://calendar-callback").get("code")).toBeNull();
  });
});

describe("connectCloudCalendar (SEC-10 two-step completion)", () => {
  const fetchMock = jest.fn();

  beforeAll(() => {
    process.env.EXPO_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    fetchMock.mockResolvedValueOnce(jsonResponse({ url: "https://accounts.google.com/o/oauth2/auth?x=1" }));
  });

  it("redeems the one-time code with the signed-in user's session", async () => {
    openAuthSession.mockResolvedValue({
      type: "success",
      url: `winkly://calendar-callback?status=success&provider=google&code=${CODE}`,
    });
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true, provider: "google" }));

    await expect(connectCloudCalendar("google")).resolves.toEqual({ ok: true });

    const [url, init] = fetchMock.mock.calls[1];
    expect(url).toBe("https://example.supabase.co/functions/v1/calendar-oauth-start?action=complete");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ code: CODE });
    expect(init.headers.Authorization).toBe("Bearer user-jwt");
  });

  it("fails without contacting the server when the redirect carries no code", async () => {
    openAuthSession.mockResolvedValue({ type: "success", url: "winkly://calendar-callback?status=success" });

    await expect(connectCloudCalendar("google")).resolves.toMatchObject({ ok: false, reason: "failed" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("fails when the provider reported an error", async () => {
    openAuthSession.mockResolvedValue({ type: "success", url: "winkly://calendar-callback?status=error" });

    await expect(connectCloudCalendar("google")).resolves.toMatchObject({ ok: false, reason: "failed" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("reports failure when the server refuses the code (e.g. a different account)", async () => {
    openAuthSession.mockResolvedValue({
      type: "success",
      url: `winkly://calendar-callback?status=success&code=${CODE}`,
    });
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: "This connection belongs to a different account" }, 403));

    await expect(connectCloudCalendar("google")).resolves.toMatchObject({ ok: false, reason: "failed" });
  });

  it("treats a cancelled consent screen as cancelled", async () => {
    openAuthSession.mockResolvedValue({ type: "cancel" });

    await expect(connectCloudCalendar("google")).resolves.toEqual({ ok: false, reason: "cancelled" });
  });
});
