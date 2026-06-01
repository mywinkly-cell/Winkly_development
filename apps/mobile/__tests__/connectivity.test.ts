import {
  assertOnline,
  deriveIsOnline,
  isOfflineError,
  isOnline,
  OfflineError,
  setConnectivity,
  __resetConnectivity,
} from "@/lib/network/connectivity";

afterEach(() => __resetConnectivity());

describe("deriveIsOnline", () => {
  it("is offline on a definite negative signal", () => {
    expect(deriveIsOnline({ isConnected: false, isInternetReachable: null })).toBe(false);
    expect(deriveIsOnline({ isConnected: true, isInternetReachable: false })).toBe(false);
  });

  it("treats unknown (null) as online to avoid false positives at launch", () => {
    expect(deriveIsOnline({ isConnected: null, isInternetReachable: null })).toBe(true);
  });

  it("is online when both signals are positive", () => {
    expect(deriveIsOnline({ isConnected: true, isInternetReachable: true })).toBe(true);
  });
});

describe("connectivity store", () => {
  it("defaults to online before any event", () => {
    expect(isOnline()).toBe(true);
  });

  it("setConnectivity updates the cached value", () => {
    setConnectivity({ isConnected: false, isInternetReachable: false });
    expect(isOnline()).toBe(false);
    setConnectivity({ isConnected: true, isInternetReachable: true });
    expect(isOnline()).toBe(true);
  });
});

describe("assertOnline / OfflineError", () => {
  it("throws OfflineError only when offline", () => {
    setConnectivity({ isConnected: true, isInternetReachable: true });
    expect(() => assertOnline()).not.toThrow();
    setConnectivity({ isConnected: false, isInternetReachable: false });
    expect(() => assertOnline()).toThrow(OfflineError);
  });

  it("isOfflineError recognizes the error", () => {
    expect(isOfflineError(new OfflineError())).toBe(true);
    expect(isOfflineError(new Error("nope"))).toBe(false);
  });
});
