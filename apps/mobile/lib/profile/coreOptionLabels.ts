// Core-profile option values (gender, education) and their i18n label keys.
//
// The values are what we store in `users` and must stay stable English strings —
// only the label shown in the UI is translated: t(genderLabelKey(value)).

export const GENDER_OPTIONS = ["Female", "Male", "Other"] as const;

export const EDUCATION_OPTIONS = [
  "High school graduate",
  "Bachelor’s degree",
  "Master’s degree",
  "Doctorate / PhD",
  "Other",
] as const;

const GENDER_LABEL_KEYS: Record<string, string> = {
  Female: "onboarding.gender.female",
  Male: "onboarding.gender.male",
  Other: "onboarding.gender.other",
};

const EDUCATION_LABEL_KEYS: Record<string, string> = {
  "High school graduate": "onboarding.education.highSchool",
  "Bachelor’s degree": "onboarding.education.bachelor",
  "Master’s degree": "onboarding.education.master",
  "Doctorate / PhD": "onboarding.education.doctorate",
  Other: "onboarding.education.other",
};

/**
 * i18n key for a stored gender value, or null for an unknown/legacy value
 * (show it as-is — it's user data we don't have a translation for).
 */
export function genderLabelKey(value: string): string | null {
  return GENDER_LABEL_KEYS[value] ?? null;
}

/** i18n key for a stored education value, or null for an unknown/legacy value. */
export function educationLabelKey(value: string): string | null {
  return EDUCATION_LABEL_KEYS[value] ?? null;
}

/** Translate a stored option value with the given key lookup, falling back to the raw value. */
export function optionLabel(
  t: (key: string) => string,
  lookup: (value: string) => string | null,
  value: string
): string {
  const key = lookup(value);
  return key ? t(key) : value;
}
