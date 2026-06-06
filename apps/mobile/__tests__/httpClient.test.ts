import axios from "axios";
import { classifyHttpError, httpClient } from "@/lib/http/client";
import { OfflineError, __resetConnectivity, setConnectivity } from "@/lib/network/connectivity";

describe("http client", () => {
  afterEach(() => {
    __resetConnectivity();
  });

  it("classifies offline errors", () => {
    expect(classifyHttpError(new OfflineError())).toBe("offline");
  });

  it("classifies axios timeout", () => {
    const err = new axios.AxiosError("timeout", "ECONNABORTED");
    expect(classifyHttpError(err)).toBe("timeout");
  });

  it("rejects requests when offline", async () => {
    setConnectivity({ isConnected: false, isInternetReachable: null });
    await expect(httpClient.get("https://example.com")).rejects.toBeInstanceOf(OfflineError);
  });
});
