import {
  formatAppDate,
  formatAppNumber,
  formatAppTime,
  getDateTimeFormat,
  getNumberFormat,
} from "@/lib/i18n/appLocale";

describe("app locale formatters", () => {
  const d = new Date(2026, 8, 26, 19, 30);

  it("reuses one Intl formatter per locale + options", () => {
    const a = getDateTimeFormat({ hour: "2-digit", minute: "2-digit" }, "de-DE");
    const b = getDateTimeFormat({ hour: "2-digit", minute: "2-digit" }, "de-DE");
    expect(a).toBe(b);
    expect(getDateTimeFormat({ hour: "2-digit", minute: "2-digit" }, "en-US")).not.toBe(a);
    expect(getNumberFormat(undefined, "de-DE")).toBe(getNumberFormat(undefined, "de-DE"));
  });

  it("formats like toLocale*String in the given locale", () => {
    expect(formatAppTime(d, undefined, "de-DE")).toBe(
      d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })
    );
    expect(formatAppDate(d, { day: "numeric", month: "short" }, "de-DE")).toBe(
      d.toLocaleDateString("de-DE", { day: "numeric", month: "short" })
    );
    expect(formatAppDate(d, {}, "en-GB")).toBe(d.toLocaleDateString("en-GB"));
    expect(formatAppNumber(1234.5, undefined, "de-DE")).toBe("1.234,5");
  });

  it("defaults to the app language, not the device locale", () => {
    // i18n is not initialised in tests → app language falls back to English (en-GB).
    expect(formatAppTime(d)).toBe(d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }));
  });

  it("returns an empty string for invalid dates instead of throwing", () => {
    const bad = new Date(NaN);
    expect(formatAppDate(bad)).toBe("");
    expect(formatAppTime(bad)).toBe("");
  });
});
