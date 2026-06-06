import AsyncStorage from "@react-native-async-storage/async-storage";
import { __resetEnvCache } from "@/lib/env";
import {
  getEmailRedirectTo,
  usesHttpsAuthRedirect,
  validateAuthRedirectStateFromUrl,
} from "@/lib/authRedirectUrl";

jest.mock("@/lib/http/client", () => ({
  httpGet: jest.fn(),
}));

const { httpGet } = jest.requireMock("@/lib/http/client") as { httpGet: jest.Mock };

describe("authRedirectUrl helpers", () => {
  beforeEach(() => {
    __resetEnvCache();
    jest.clearAllMocks();
    return AsyncStorage.clear();
  });

  it("usesHttpsAuthRedirect is false for winkly:// scheme", () => {
    process.env.EXPO_PUBLIC_AUTH_REDIRECT_URL = "winkly://callback";
    __resetEnvCache();
    expect(usesHttpsAuthRedirect()).toBe(false);
  });

  it("usesHttpsAuthRedirect is true for https redirect", () => {
    process.env.EXPO_PUBLIC_AUTH_REDIRECT_URL = "https://winkly.app/auth/";
    __resetEnvCache();
    expect(usesHttpsAuthRedirect()).toBe(true);
  });

  it("validateAuthRedirectStateFromUrl passes when scheme is not https", async () => {
    process.env.EXPO_PUBLIC_AUTH_REDIRECT_URL = "winkly://callback";
    __resetEnvCache();
    await expect(validateAuthRedirectStateFromUrl("winkly://callback?winkly_state=abc")).resolves.toBe(true);
  });

  it("validateAuthRedirectStateFromUrl rejects mismatched state", async () => {
    process.env.EXPO_PUBLIC_AUTH_REDIRECT_URL = "https://winkly.app/auth/";
    __resetEnvCache();
    await AsyncStorage.setItem("winkly_pending_auth_state", "expected");
    await expect(
      validateAuthRedirectStateFromUrl("winkly://callback?winkly_state=wrong#access_token=x")
    ).resolves.toBe(false);
  });

  it("validateAuthRedirectStateFromUrl clears pending state on match", async () => {
    process.env.EXPO_PUBLIC_AUTH_REDIRECT_URL = "https://winkly.app/auth/";
    __resetEnvCache();
    await AsyncStorage.setItem("winkly_pending_auth_state", "signed");
    await expect(validateAuthRedirectStateFromUrl("winkly://callback?winkly_state=signed")).resolves.toBe(true);
    await expect(AsyncStorage.getItem("winkly_pending_auth_state")).resolves.toBeNull();
  });

  it("getEmailRedirectTo appends minted winkly_state for https redirect", async () => {
    process.env.EXPO_PUBLIC_AUTH_REDIRECT_URL = "https://winkly.app/auth/";
    process.env.EXPO_PUBLIC_SUPABASE_URL = "https://test-project.supabase.co";
    __resetEnvCache();
    httpGet.mockResolvedValue({ state: "minted-state" });
    const url = await getEmailRedirectTo();
    expect(url).toContain("winkly_state=minted-state");
    await expect(AsyncStorage.getItem("winkly_pending_auth_state")).resolves.toBe("minted-state");
  });
});
