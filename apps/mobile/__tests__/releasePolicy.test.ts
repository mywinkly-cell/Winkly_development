import { isBuildBelowMinimum } from "@/lib/release/releasePolicy";

jest.mock("@/lib/supabase", () => ({ supabase: {} }));
jest.mock("expo-application", () => ({ nativeBuildVersion: "10", applicationId: "com.winkly.app" }));

describe("isBuildBelowMinimum", () => {
  it("blocks a build strictly below the minimum", () => {
    expect(isBuildBelowMinimum("9", 10)).toBe(true);
  });

  it("allows the minimum build and newer", () => {
    expect(isBuildBelowMinimum("10", 10)).toBe(false);
    expect(isBuildBelowMinimum("11", 10)).toBe(false);
  });

  it("fails open when the policy is unset or zero", () => {
    expect(isBuildBelowMinimum("1", 0)).toBe(false);
    expect(isBuildBelowMinimum("1", null)).toBe(false);
    expect(isBuildBelowMinimum("1", undefined)).toBe(false);
  });

  it("fails open when the installed build is unknown or not numeric", () => {
    expect(isBuildBelowMinimum(null, 10)).toBe(false);
    expect(isBuildBelowMinimum("", 10)).toBe(false);
    expect(isBuildBelowMinimum("abc", 10)).toBe(false);
  });
});
