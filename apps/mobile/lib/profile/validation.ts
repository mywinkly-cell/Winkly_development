// Profile onboarding validation — shared constants + pure submit checks.

export const MIN_CORE_PHOTOS = 2;
export const MAX_CORE_PHOTOS = 5;
export const MIN_PHOTO_DIMENSION = 500;
export const MAX_CORE_BIO = 300;

export type ProfileCoreSubmitInput = {
  firstName: string;
  lastName: string;
  gender: string;
  /** ISO date string or in-memory Date from the date picker. */
  birthday: string | Date | null;
  city: string;
  lookingFor: string[];
  corePhotoCount: number;
  /** When false, skips the looking-for requirement (Friends/Business-only onboarding). */
  requireLookingFor?: boolean;
};

function hasBirthdayValue(birthday: string | Date | null): boolean {
  if (birthday == null) return false;
  if (birthday instanceof Date) return !Number.isNaN(birthday.getTime());
  return !!String(birthday).trim();
}

export type ProfileValidationResult =
  | { ok: true }
  | { ok: false; title: string; message: string };

export function validateProfileCoreSubmit(input: ProfileCoreSubmitInput): ProfileValidationResult {
  if (!input.firstName || !input.lastName || !input.gender || !hasBirthdayValue(input.birthday) || !input.city) {
    return { ok: false, title: "Incomplete", message: "Please fill in all required fields." };
  }
  if (input.requireLookingFor !== false && input.lookingFor.length === 0) {
    return { ok: false, title: "Almost there", message: "Please choose who you're looking to meet." };
  }
  if (input.corePhotoCount < MIN_CORE_PHOTOS) {
    return {
      ok: false,
      title: "Add more photos",
      message: `Please add at least ${MIN_CORE_PHOTOS} photos so you can start matching. You can add up to ${MAX_CORE_PHOTOS}.`,
    };
  }
  return { ok: true };
}

/** Progress checklist used to enable the Continue button on profile-core. */
export function isProfileCoreStepComplete(input: ProfileCoreSubmitInput): boolean {
  return (
    input.corePhotoCount >= MIN_CORE_PHOTOS &&
    !!input.firstName.trim() &&
    !!input.lastName.trim() &&
    hasBirthdayValue(input.birthday) &&
    !!input.gender.trim() &&
    !!input.city.trim() &&
    input.lookingFor.length > 0
  );
}
