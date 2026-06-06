import { isRecoveryUrl } from "@/lib/authDeepLink";

describe("isRecoveryUrl", () => {
  it("detects recovery type in fragment", () => {
    expect(
      isRecoveryUrl("winkly://callback#access_token=x&type=recovery&refresh_token=y")
    ).toBe(true);
  });

  it("detects recovery type in query", () => {
    expect(isRecoveryUrl("https://project.supabase.co/auth/v1/verify?token=abc&type=recovery")).toBe(
      true
    );
  });

  it("returns false for signup / magic link without recovery", () => {
    expect(isRecoveryUrl("winkly://callback#access_token=x&type=signup")).toBe(false);
    expect(isRecoveryUrl("winkly://callback#access_token=x")).toBe(false);
  });
});
