import {
  isProfileCoreStepComplete,
  MIN_CORE_PHOTOS,
  validateProfileCoreSubmit,
} from "@/lib/profile/validation";

const validInput = {
  firstName: "Kate",
  lastName: "Smith",
  gender: "woman",
  birthday: "2000-01-01",
  city: "Berlin",
  corePhotoCount: MIN_CORE_PHOTOS,
};

describe("validateProfileCoreSubmit", () => {
  it("rejects missing required fields", () => {
    expect(
      validateProfileCoreSubmit({ ...validInput, firstName: "", corePhotoCount: MIN_CORE_PHOTOS })
    ).toEqual({
      ok: false,
      titleKey: "auth.incomplete",
      messageKey: "onboarding.profile.fillRequired",
    });
  });

  it("requires the minimum number of core photos", () => {
    expect(validateProfileCoreSubmit({ ...validInput, corePhotoCount: 1 })).toMatchObject({
      ok: false,
      titleKey: "onboarding.wizard.validation.photosTitle",
    });
  });

  it("accepts a complete profile", () => {
    expect(validateProfileCoreSubmit(validInput)).toEqual({ ok: true });
  });
});

describe("isProfileCoreStepComplete", () => {
  it("mirrors the onboarding continue-button checklist", () => {
    expect(isProfileCoreStepComplete(validInput)).toBe(true);
    expect(isProfileCoreStepComplete({ ...validInput, city: " " })).toBe(false);
  });
});
