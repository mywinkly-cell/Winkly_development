import {
  expandCountryForDisplay,
  formatDefaultLocationDisplay,
  localityFromLocationString,
  normalizeLocationDisplayString,
  sameLocality,
} from "@/lib/location/countryDisplay";

describe("expandCountryForDisplay", () => {
  it("expands ISO alpha-2 codes", () => {
    expect(expandCountryForDisplay("DE", "en")).toBe("Germany");
    expect(expandCountryForDisplay("uk", "en")).toBe("United Kingdom");
  });

  it("expands colloquial abbreviations", () => {
    expect(expandCountryForDisplay("USA", "en")).toBe("United States");
    expect(expandCountryForDisplay("UAE", "en")).toBe("United Arab Emirates");
  });
});

describe("formatDefaultLocationDisplay", () => {
  it("joins city and expanded country", () => {
    expect(formatDefaultLocationDisplay("Berlin", "DE", "en")).toBe("Berlin, Germany");
  });

  it("normalizes city strings that already include a country code", () => {
    expect(formatDefaultLocationDisplay("Olching, DE", null, "en")).toBe("Olching, Germany");
  });
});

describe("normalizeLocationDisplayString", () => {
  it("expands the country segment after the last comma", () => {
    expect(normalizeLocationDisplayString("Munich, DE", "en")).toBe("Munich, Germany");
  });
});

describe("locality helpers", () => {
  it("extracts locality and compares case-insensitively", () => {
    expect(localityFromLocationString("Olching, Germany")).toBe("Olching");
    expect(sameLocality("Olching", "Olching, DE")).toBe(true);
    expect(sameLocality("Berlin", "Munich")).toBe(false);
  });
});
