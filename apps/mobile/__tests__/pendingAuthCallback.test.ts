import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  clearPendingAuthCallbackUrl,
  getPendingAuthCallbackUrl,
  setPendingAuthCallbackUrl,
} from "@/lib/pendingAuthCallback";

describe("pendingAuthCallback", () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it("stores and retrieves pending auth callback URL", async () => {
    await setPendingAuthCallbackUrl("winkly://callback#access_token=abc");
    await expect(getPendingAuthCallbackUrl()).resolves.toBe("winkly://callback#access_token=abc");
  });

  it("clears pending auth callback URL", async () => {
    await setPendingAuthCallbackUrl("winkly://callback#access_token=abc");
    await clearPendingAuthCallbackUrl();
    await expect(getPendingAuthCallbackUrl()).resolves.toBeNull();
  });
});
