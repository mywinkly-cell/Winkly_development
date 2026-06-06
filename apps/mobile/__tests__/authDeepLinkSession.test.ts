import { createSessionFromUrl } from "@/lib/authDeepLink";
import { supabase } from "@/lib/supabase";

jest.mock("@/lib/authRedirectUrl", () => ({
  validateAuthRedirectStateFromUrl: jest.fn().mockResolvedValue(true),
}));

describe("createSessionFromUrl", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("establishes a session from fragment tokens", async () => {
    (supabase.auth.setSession as jest.Mock).mockResolvedValueOnce({ error: null });
    const ok = await createSessionFromUrl(
      "winkly://callback#access_token=at&refresh_token=rt&type=signup"
    );
    expect(ok).toBe(true);
    expect(supabase.auth.setSession).toHaveBeenCalledWith({
      access_token: "at",
      refresh_token: "rt",
    });
  });

  it("returns false when setSession fails", async () => {
    (supabase.auth.setSession as jest.Mock).mockResolvedValueOnce({
      error: { message: "invalid token" },
    });
    const ok = await createSessionFromUrl("winkly://callback#access_token=bad&refresh_token=rt");
    expect(ok).toBe(false);
  });

  it("verifies recovery OTP from query params", async () => {
    (supabase.auth.verifyOtp as jest.Mock).mockResolvedValueOnce({
      data: { session: { access_token: "x" } },
      error: null,
    });
    const ok = await createSessionFromUrl(
      "https://project.supabase.co/auth/v1/verify?token=hash123&type=recovery"
    );
    expect(ok).toBe(true);
    expect(supabase.auth.verifyOtp).toHaveBeenCalledWith({
      token_hash: "hash123",
      type: "recovery",
    });
  });

  it("returns false when state validation fails", async () => {
    const { validateAuthRedirectStateFromUrl } = jest.requireMock("@/lib/authRedirectUrl") as {
      validateAuthRedirectStateFromUrl: jest.Mock;
    };
    validateAuthRedirectStateFromUrl.mockResolvedValueOnce(false);
    const ok = await createSessionFromUrl("winkly://callback#access_token=at&refresh_token=rt");
    expect(ok).toBe(false);
    expect(supabase.auth.setSession).not.toHaveBeenCalled();
  });
});
