import { formatApproxDistance } from "@/lib/distanceUnit";

describe("formatApproxDistance", () => {
  it("uses km / m for metric", () => {
    expect(formatApproxDistance(1000, "km", "en-GB")).toBe("1 km");
    expect(formatApproxDistance(1500, "km", "en-GB")).toBe("1.5 km");
    expect(formatApproxDistance(100, "km", "en-GB")).toBe("100 m");
  });

  it("uses mi / ft for imperial", () => {
    expect(formatApproxDistance(1000, "mi", "en-US")).toBe("0.6 mi");
    expect(formatApproxDistance(100, "mi", "en-US")).toBe("330 ft");
  });

  it("formats the number for the locale", () => {
    expect(formatApproxDistance(1500, "km", "de-DE")).toBe("1,5 km");
  });
});
