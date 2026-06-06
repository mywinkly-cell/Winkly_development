// Staged personal onboarding — step count, resume, and per-step validation.

import { MIN_CORE_PHOTOS } from "@/lib/profile/validation";

export const ONBOARDING_STEP_COUNT = 4;

export type OnboardingStep = 1 | 2 | 3 | 4;

export type PrimaryOnboardingMode = "romance" | "friends" | "business";

export type OnboardingStepInput = {
  firstName: string;
  lastName: string;
  birthday: string | Date | null;
  city: string;
  corePhotoCount: number;
  gender?: string;
  lookingFor?: string[];
  selectedMode?: PrimaryOnboardingMode | null;
};

function hasBirthdayValue(birthday: string | Date | null): boolean {
  if (birthday == null) return false;
  if (birthday instanceof Date) return !Number.isNaN(birthday.getTime());
  return !!String(birthday).trim();
}

export type StepValidationResult =
  | { ok: true }
  | { ok: false; title: string; message: string };

export function validateOnboardingStep(
  step: OnboardingStep,
  input: OnboardingStepInput
): StepValidationResult {
  switch (step) {
    case 1:
      if (!input.firstName.trim() || !input.lastName.trim()) {
        return { ok: false, title: "Your name", message: "Please enter your first and last name." };
      }
      if (!hasBirthdayValue(input.birthday)) {
        return { ok: false, title: "Birthday", message: "Please select your birth date." };
      }
      if (!input.city.trim()) {
        return { ok: false, title: "City", message: "Please enter your city so we can suggest nearby matches." };
      }
      return { ok: true };
    case 2:
      if (input.corePhotoCount < MIN_CORE_PHOTOS) {
        return {
          ok: false,
          title: "Add more photos",
          message: `Add at least ${MIN_CORE_PHOTOS} photos to continue. You can add up to 5.`,
        };
      }
      return { ok: true };
    case 3:
      return { ok: true };
    case 4:
      if (!input.gender?.trim()) {
        return { ok: false, title: "Gender", message: "Please select your gender." };
      }
      if (input.selectedMode === "romance" && (!input.lookingFor || input.lookingFor.length === 0)) {
        return {
          ok: false,
          title: "Almost there",
          message: "Please choose who you're looking to meet.",
        };
      }
      if (!input.selectedMode) {
        return { ok: false, title: "Choose a mode", message: "Pick Romance, Friends, or Business to set up your profile." };
      }
      return { ok: true };
    default:
      return { ok: true };
  }
}

/** Infer which step to resume from saved profile data. */
export function inferOnboardingResumeStep(input: {
  firstName: string;
  lastName: string;
  birthday: string | Date | null;
  city: string;
  corePhotoCount: number;
  savedStep?: number | null;
}): OnboardingStep {
  const saved = input.savedStep;
  if (typeof saved === "number" && saved >= 1 && saved <= ONBOARDING_STEP_COUNT) {
    return saved as OnboardingStep;
  }
  if (!input.firstName.trim() || !input.lastName.trim() || !hasBirthdayValue(input.birthday) || !input.city.trim()) {
    return 1;
  }
  if (input.corePhotoCount < MIN_CORE_PHOTOS) {
    return 2;
  }
  return 3;
}

export function clampOnboardingStep(step: number): OnboardingStep {
  if (step < 1) return 1;
  if (step > ONBOARDING_STEP_COUNT) return ONBOARDING_STEP_COUNT;
  return step as OnboardingStep;
}
