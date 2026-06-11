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
      title: "Incomplete",
      message: "Please fill in all required fields.",
    });
  });

  it("requires the minimum number of core photos", () => {
    expect(validateProfileCoreSubmit({ ...validInput, corePhotoCount: 1 })).toMatchObject({
      ok: false,
      title: "Add more photos",
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
