/**
 * 18+ enforcement (SAFE-1, August 2026 audit).
 *
 * Before this, the only age check anywhere was `maximumDate` on the onboarding
 * date picker. validateProfileCoreSubmit accepted any non-empty birthday, and
 * there was no database constraint — so a direct PostgREST write could set any
 * date of birth. The database CHECK added in
 * 20260821120000_security_hardening_audit_v1_48.sql is the real floor; these
 * tests cover the client-side half that turns it into a readable message.
 */

import {
  ageFromBirthday,
  isProfileCoreStepComplete,
  meetsMinimumAge,
  MIN_AGE_YEARS,
  MIN_CORE_PHOTOS,
  validateProfileCoreSubmit,
} from "@/lib/profile/validation";

/** ISO date exactly `years` and `days` before today. */
function birthdayFor(years: number, days = 0): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - years);
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

const validInput = {
  firstName: "Kate",
  lastName: "Smith",
  gender: "woman",
  birthday: birthdayFor(25),
  city: "Munich",
  corePhotoCount: MIN_CORE_PHOTOS,
};

describe("ageFromBirthday", () => {
  it("counts whole years", () => {
    expect(ageFromBirthday(birthdayFor(30, 1))).toBe(30);
  });

  it("does not round a birthday up before it has happened", () => {
    // One day short of turning 18 is still 17.
    expect(ageFromBirthday(birthdayFor(17, 364))).toBe(17);
  });

  it("returns null for missing or unparseable input", () => {
    expect(ageFromBirthday(null)).toBeNull();
    expect(ageFromBirthday("not-a-date")).toBeNull();
    expect(ageFromBirthday(new Date("nope"))).toBeNull();
  });
});

describe("meetsMinimumAge", () => {
  it("accepts someone who turned 18 today", () => {
    expect(meetsMinimumAge(birthdayFor(MIN_AGE_YEARS))).toBe(true);
  });

  it("rejects someone one day short of 18", () => {
    expect(meetsMinimumAge(birthdayFor(MIN_AGE_YEARS - 1, 364))).toBe(false);
  });

  it("rejects a clearly underage date", () => {
    expect(meetsMinimumAge(birthdayFor(14))).toBe(false);
  });

  it("rejects a missing birthday rather than defaulting to allowed", () => {
    expect(meetsMinimumAge(null)).toBe(false);
    expect(meetsMinimumAge("")).toBe(false);
  });

  it("accepts a Date as well as an ISO string", () => {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 21);
    expect(meetsMinimumAge(d)).toBe(true);
  });
});

describe("validateProfileCoreSubmit — age gate", () => {
  it("blocks submission for an under-18 birthday", () => {
    const result = validateProfileCoreSubmit({ ...validInput, birthday: birthdayFor(15) });
    expect(result).toMatchObject({ ok: false, titleKey: "onboarding.profile.minAgeTitle", params: { age: 18 } });
  });

  it("still accepts an adult profile", () => {
    expect(validateProfileCoreSubmit(validInput)).toEqual({ ok: true });
  });

  it("reports the missing-fields error first when the birthday is absent", () => {
    // Order matters: an empty form should say "Incomplete", not accuse the user
    // of being underage.
    expect(validateProfileCoreSubmit({ ...validInput, birthday: null })).toMatchObject({
      titleKey: "auth.incomplete",
    });
  });
});

describe("isProfileCoreStepComplete — age gate", () => {
  it("leaves Continue disabled for an under-18 birthday", () => {
    expect(isProfileCoreStepComplete({ ...validInput, birthday: birthdayFor(16) })).toBe(false);
  });

  it("enables Continue for an adult with everything else filled in", () => {
    expect(isProfileCoreStepComplete(validInput)).toBe(true);
  });
});
