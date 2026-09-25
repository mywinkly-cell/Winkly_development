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
  corePhotoCount: number;
};

function hasBirthdayValue(birthday: string | Date | null): boolean {
  if (birthday == null) return false;
  if (birthday instanceof Date) return !Number.isNaN(birthday.getTime());
  return !!String(birthday).trim();
}

/** Winkly is 18+. Kept here so the rule has one definition on the client. */
export const MIN_AGE_YEARS = 18;

function toDate(birthday: string | Date | null): Date | null {
  if (birthday == null) return null;
  const d = birthday instanceof Date ? birthday : new Date(String(birthday));
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Whole years between `birthday` and today, or null when unparseable. */
export function ageFromBirthday(birthday: string | Date | null): number | null {
  const d = toDate(birthday);
  if (!d) return null;
  const today = new Date();
  let age = today.getFullYear() - d.getFullYear();
  const m = today.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < d.getDate())) age -= 1;
  return age;
}

/**
 * True when the birthday is present and at least MIN_AGE_YEARS ago.
 *
 * The onboarding date picker already sets maximumDate to today-18y, but that is
 * a UI hint on one screen: profiles_core / user_profiles are PATCHable by their
 * owner, so the real floor is the CHECK constraint added in
 * 20260821120000_security_hardening_audit_v1_48.sql. This function exists so
 * the user gets a clear message instead of a raw database error (SAFE-1).
 */
export function meetsMinimumAge(birthday: string | Date | null): boolean {
  const age = ageFromBirthday(birthday);
  return age !== null && age >= MIN_AGE_YEARS;
}

/** Failure carries i18n keys (+ interpolation params) — the screen translates them. */
export type ProfileValidationResult =
  | { ok: true }
  | { ok: false; titleKey: string; messageKey: string; params?: Record<string, number> };

export function validateProfileCoreSubmit(input: ProfileCoreSubmitInput): ProfileValidationResult {
  if (!input.firstName || !input.lastName || !input.gender || !hasBirthdayValue(input.birthday) || !input.city) {
    return { ok: false, titleKey: "auth.incomplete", messageKey: "onboarding.profile.fillRequired" };
  }
  if (!meetsMinimumAge(input.birthday)) {
    return {
      ok: false,
      titleKey: "onboarding.profile.minAgeTitle",
      messageKey: "onboarding.profile.minAge",
      params: { age: MIN_AGE_YEARS },
    };
  }
  if (input.corePhotoCount < MIN_CORE_PHOTOS) {
    return {
      ok: false,
      titleKey: "onboarding.wizard.validation.photosTitle",
      messageKey: "onboarding.profile.minPhotos",
      params: { count: MIN_CORE_PHOTOS, max: MAX_CORE_PHOTOS },
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
    meetsMinimumAge(input.birthday) &&
    !!input.gender.trim() &&
    !!input.city.trim()
  );
}
