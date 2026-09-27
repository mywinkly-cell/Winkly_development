const mockGetLocales = jest.fn();
jest.mock("expo-localization", () => ({ getLocales: () => mockGetLocales() }));

import { getDeviceLanguage } from "@/lib/i18n";

describe("getDeviceLanguage", () => {
  it("uses the phone's first language when Winkly ships it", () => {
    mockGetLocales.mockReturnValue([{ languageCode: "uk", languageTag: "uk-UA" }]);
    expect(getDeviceLanguage()).toBe("uk");
  });

  it("skips unsupported languages and takes the next preferred one", () => {
    mockGetLocales.mockReturnValue([
      { languageCode: "ja", languageTag: "ja-JP" },
      { languageCode: "de", languageTag: "de-AT" },
    ]);
    expect(getDeviceLanguage()).toBe("de");
  });

  it("falls back to English when no phone language is supported or the module fails", () => {
    mockGetLocales.mockReturnValue([{ languageCode: "ja", languageTag: "ja-JP" }]);
    expect(getDeviceLanguage()).toBe("en");
    mockGetLocales.mockImplementation(() => {
      throw new Error("no native module");
    });
    expect(getDeviceLanguage()).toBe("en");
  });
});
