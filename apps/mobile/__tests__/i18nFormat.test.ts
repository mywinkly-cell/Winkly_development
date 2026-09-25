import {
  currencyForPlace,
  currencyForRegion,
  formatClockTime,
  formatDayDate,
  formatMoney,
  formatShortDate,
} from "@/lib/i18n/format";

describe("currencyForPlace", () => {
  it("uses the country in a 'City, Country' line", () => {
    expect(currencyForPlace("Warsaw, Poland")).toBe("PLN");
    expect(currencyForPlace("Kraków, Polska")).toBe("PLN");
    expect(currencyForPlace("Zurich, Switzerland")).toBe("CHF");
    expect(currencyForPlace("Manchester, United Kingdom")).toBe("GBP");
    expect(currencyForPlace("Olching, Germany")).toBe("EUR");
    expect(currencyForPlace("Prague, CZ")).toBe("CZK");
  });

  it("falls back to known cities, and to undefined when it can't tell", () => {
    expect(currencyForPlace("London")).toBe("GBP");
    expect(currencyForPlace("Київ")).toBe("UAH");
    expect(currencyForPlace("Somewhere")).toBeUndefined();
    expect(currencyForPlace("")).toBeUndefined();
    expect(currencyForPlace(null)).toBeUndefined();
  });
});

describe("currencyForRegion", () => {
  it("maps regions and defaults to EUR", () => {
    expect(currencyForRegion("PL")).toBe("PLN");
    expect(currencyForRegion("se")).toBe("SEK");
    expect(currencyForRegion("DE")).toBe("EUR");
    expect(currencyForRegion(null)).toBe("EUR");
  });
});

describe("formatMoney", () => {
  it("places the symbol per locale and drops decimals for whole amounts", () => {
    expect(formatMoney(50, "EUR", "en-GB")).toBe("€50");
    expect(formatMoney(50, "EUR", "de-DE")).toMatch(/^50\s€$/);
    expect(formatMoney("80", "PLN", "pl-PL")).toMatch(/^80\szł$/);
    expect(formatMoney("12,5", "EUR", "en-GB")).toBe("€12.50");
  });

  it("never throws on bad input", () => {
    expect(formatMoney("abc", "EUR", "en-GB")).toBe("abc EUR");
    expect(formatMoney(10, "NOT_A_CURRENCY", "en-GB")).toBe("10 NOT_A_CURRENCY");
  });
});

describe("dates and times", () => {
  const d = new Date(2026, 8, 26, 19, 30);

  it("formats in the given locale, not the device's", () => {
    expect(formatShortDate(d, "en-GB")).toBe("26 Sept");
    expect(formatShortDate(d, "de-DE")).toBe("26. Sept.");
    expect(formatClockTime(d, "de-DE")).toBe("19:30");
    expect(formatClockTime(d, "en-US")).toMatch(/07:30\sPM/);
  });

  it("adds the year only when it isn't this year", () => {
    const now = new Date(2026, 0, 1);
    expect(formatDayDate(d, "en-GB", now)).toMatch(/^Sat,? 26 Sept$/);
    expect(formatDayDate(new Date(2027, 0, 2), "en-GB", now)).toMatch(/^Sat,? 2 Jan 2027$/);
  });

  it("returns an empty string for invalid dates", () => {
    const bad = new Date(NaN);
    expect(formatShortDate(bad, "en-GB")).toBe("");
    expect(formatDayDate(bad, "en-GB")).toBe("");
    expect(formatClockTime(bad, "en-GB")).toBe("");
  });
});
