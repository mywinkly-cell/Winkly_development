import {
  inferOnboardingResumeStep,
  validateOnboardingStep,
  ONBOARDING_STEP_COUNT,
} from "@/lib/profile/onboardingSteps";
import { MIN_CORE_PHOTOS } from "@/lib/profile/validation";

describe("validateOnboardingStep", () => {
  const identity = {
    firstName: "Kate",
    lastName: "Smith",
    birthday: "2000-01-01",
    city: "Berlin",
    corePhotoCount: MIN_CORE_PHOTOS,
    gender: "Female",
    lookingFor: ["Women"],
    selectedMode: "romance",
  };

  it("requires name, birthday, and city on step 1", () => {
    expect(validateOnboardingStep(1, { ...identity, city: "" })).toMatchObject({ ok: false });
    expect(validateOnboardingStep(1, identity)).toEqual({ ok: true });
  });

  it("requires minimum photos on step 2", () => {
    expect(validateOnboardingStep(2, { ...identity, corePhotoCount: 1 })).toMatchObject({
      ok: false,
      title: "Add more photos",
    });
    expect(validateOnboardingStep(2, identity)).toEqual({ ok: true });
  });

  it("allows skipping activity picks on step 3", () => {
    expect(validateOnboardingStep(3, identity)).toEqual({ ok: true });
  });

  it("requires gender and romance looking-for on step 4", () => {
    expect(validateOnboardingStep(4, { ...identity, gender: "" })).toMatchObject({ ok: false });
    expect(
      validateOnboardingStep(4, { ...identity, lookingFor: [], selectedMode: "romance" })
    ).toMatchObject({ ok: false });
    expect(
      validateOnboardingStep(4, { ...identity, lookingFor: [], selectedMode: "friends" })
    ).toEqual({ ok: true });
  });
});

describe("inferOnboardingResumeStep", () => {
  it("respects saved step from draft", () => {
    expect(
      inferOnboardingResumeStep({
        firstName: "A",
        lastName: "B",
        birthday: "2000-01-01",
        city: "Berlin",
        corePhotoCount: 0,
        savedStep: 3,
      })
    ).toBe(3);
  });

  it("infers step from partial profile data", () => {
    expect(
      inferOnboardingResumeStep({
        firstName: "",
        lastName: "B",
        birthday: null,
        city: "",
        corePhotoCount: 0,
      })
    ).toBe(1);
    expect(
      inferOnboardingResumeStep({
        firstName: "A",
        lastName: "B",
        birthday: "2000-01-01",
        city: "Berlin",
        corePhotoCount: 1,
      })
    ).toBe(2);
    expect(
      inferOnboardingResumeStep({
        firstName: "A",
        lastName: "B",
        birthday: "2000-01-01",
        city: "Berlin",
        corePhotoCount: MIN_CORE_PHOTOS,
      })
    ).toBe(3);
  });

  it("exports four onboarding steps", () => {
    expect(ONBOARDING_STEP_COUNT).toBe(4);
  });
});
