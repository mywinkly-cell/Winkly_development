// Dynamic personal-onboarding wizard — step list, resume, and per-step validation.
//
// Replaces the old fixed 3-step model (lib/profile/onboardingSteps.ts). The step
// list is computed from which sub-profiles (Romance/Friends/Business) the user
// has enabled, so total step count grows/shrinks live as they (de)select modes
// on the "modes" step.

import { MIN_CORE_PHOTOS } from "@/lib/profile/validation";

export type PrimaryOnboardingMode = "romance" | "friends" | "business";

export const ALL_ONBOARDING_MODES: PrimaryOnboardingMode[] = ["romance", "friends", "business"];

export type GeneralStepId = "name" | "photos" | "location" | "about" | "modes";
export type ModeStepId = "photosBio" | "details" | "goals";

export type WizardStep =
  | { kind: "general"; id: GeneralStepId }
  | { kind: "mode"; mode: PrimaryOnboardingMode; id: ModeStepId }
  | { kind: "review" };

/** Minimal i18next-compatible translate function, so this module stays free of React/i18n imports. */
export type Translate = (key: string, options?: Record<string, unknown>) => string;

const GENERAL_STEP_LABEL_KEYS: Record<GeneralStepId, string> = {
  name: "onboarding.wizard.step.name",
  photos: "onboarding.wizard.step.photos",
  location: "onboarding.wizard.step.location",
  about: "onboarding.wizard.step.about",
  modes: "onboarding.wizard.step.modes",
};

const MODE_STEP_LABEL_KEYS: Record<ModeStepId, string> = {
  photosBio: "onboarding.wizard.step.photosBio",
  details: "onboarding.wizard.step.details",
  goals: "onboarding.wizard.step.goals",
};

/** i18n keys for the mode names (shared with the rest of the app). */
export const MODE_LABEL_KEY: Record<PrimaryOnboardingMode, string> = {
  romance: "modes.romance",
  friends: "modes.friends",
  business: "modes.business",
};

export const MODE_EMOJI: Record<PrimaryOnboardingMode, string> = {
  romance: "💕",
  friends: "🤝",
  business: "💼",
};

/** Build the full ordered step list for the given enabled modes (in selection order). */
export function buildWizardSteps(enabledModes: PrimaryOnboardingMode[]): WizardStep[] {
  const steps: WizardStep[] = [
    { kind: "general", id: "name" },
    { kind: "general", id: "photos" },
    { kind: "general", id: "location" },
    { kind: "general", id: "about" },
    { kind: "general", id: "modes" },
  ];
  for (const mode of enabledModes) {
    steps.push({ kind: "mode", mode, id: "photosBio" });
    steps.push({ kind: "mode", mode, id: "details" });
    steps.push({ kind: "mode", mode, id: "goals" });
  }
  steps.push({ kind: "review" });
  return steps;
}

export function wizardStepLabel(step: WizardStep, t: Translate): string {
  if (step.kind === "general") return t(GENERAL_STEP_LABEL_KEYS[step.id]);
  if (step.kind === "review") return t("onboarding.wizard.step.review");
  return t("onboarding.wizard.step.modeStep", {
    mode: t(MODE_LABEL_KEY[step.mode]),
    step: t(MODE_STEP_LABEL_KEYS[step.id]),
  });
}

export function wizardStepKey(step: WizardStep): string {
  if (step.kind === "general") return `general:${step.id}`;
  if (step.kind === "review") return "review";
  return `mode:${step.mode}:${step.id}`;
}

export function clampWizardStepIndex(index: number, stepCount: number): number {
  if (stepCount <= 0) return 0;
  if (index < 0) return 0;
  if (index >= stepCount) return stepCount - 1;
  return index;
}

function hasBirthdayValue(birthday: string | Date | null): boolean {
  if (birthday == null) return false;
  if (birthday instanceof Date) return !Number.isNaN(birthday.getTime());
  return !!String(birthday).trim();
}

/** Failure carries i18n keys (+ interpolation params) — the screen translates them. */
export type StepValidationResult =
  | { ok: true }
  | { ok: false; titleKey: string; messageKey: string; params?: Record<string, number> };

export type WizardValidationInput = {
  firstName: string;
  lastName: string;
  birthday: string | Date | null;
  city: string;
  gender: string;
  corePhotoCount: number;
  romance: { bio: string; photos: (string | null)[]; relationshipGoals: string[] };
  friends: { bio: string; photos: (string | null)[]; meetupGoals: string[] };
  business: { bio: string; photos: (string | null)[]; networkingGoals: string[] };
};

function requirePhotosAndBio(
  mode: PrimaryOnboardingMode,
  data: { bio: string; photos: (string | null)[] }
): StepValidationResult {
  const hasPhoto = data.photos.some(Boolean);
  const hasBio = !!data.bio.trim();
  if (!hasPhoto || !hasBio) {
    return {
      ok: false,
      titleKey: `onboarding.wizard.validation.${mode}ProfileTitle`,
      messageKey: `onboarding.wizard.validation.${mode}PhotosBio`,
    };
  }
  return { ok: true };
}

function requireGoals(mode: PrimaryOnboardingMode, goals: string[]): StepValidationResult {
  if (goals.length === 0) {
    return {
      ok: false,
      titleKey: "onboarding.wizard.validation.almostThere",
      messageKey: `onboarding.wizard.validation.${mode}Goals`,
    };
  }
  return { ok: true };
}

export function validateWizardStep(step: WizardStep, input: WizardValidationInput): StepValidationResult {
  if (step.kind === "general") {
    switch (step.id) {
      case "name":
        if (!input.firstName.trim() || !input.lastName.trim()) {
          return { ok: false, titleKey: "onboarding.wizard.validation.nameTitle", messageKey: "onboarding.wizard.validation.name" };
        }
        if (!hasBirthdayValue(input.birthday)) {
          return { ok: false, titleKey: "profile.birthday", messageKey: "onboarding.wizard.validation.birthday" };
        }
        return { ok: true };
      case "photos":
        if (input.corePhotoCount < MIN_CORE_PHOTOS) {
          return {
            ok: false,
            titleKey: "onboarding.wizard.validation.photosTitle",
            messageKey: "onboarding.wizard.validation.photos",
            params: { count: MIN_CORE_PHOTOS, max: 5 },
          };
        }
        return { ok: true };
      case "location":
        if (!input.city.trim()) {
          return { ok: false, titleKey: "profile.city", messageKey: "onboarding.wizard.validation.city" };
        }
        if (!input.gender.trim()) {
          return { ok: false, titleKey: "profile.gender", messageKey: "onboarding.wizard.validation.gender" };
        }
        return { ok: true };
      case "about":
      case "modes":
        return { ok: true };
    }
  }

  if (step.kind === "mode") {
    if (step.id === "details") return { ok: true };
    if (step.id === "photosBio") {
      return requirePhotosAndBio(step.mode, input[step.mode]);
    }
    // goals
    if (step.mode === "romance") return requireGoals("romance", input.romance.relationshipGoals);
    if (step.mode === "friends") return requireGoals("friends", input.friends.meetupGoals);
    return requireGoals("business", input.business.networkingGoals);
  }

  return { ok: true };
}

export type WizardResumeInput = {
  firstName: string;
  lastName: string;
  birthday: string | Date | null;
  city: string;
  corePhotoCount: number;
  enabledModes: PrimaryOnboardingMode[];
  /** Whether each enabled mode already has photos+bio saved. */
  modeComplete: Partial<Record<PrimaryOnboardingMode, boolean>>;
  savedStepIndex?: number | null;
};

/** Infer which step index to resume onboarding from saved profile/draft data. */
export function inferWizardResumeStep(input: WizardResumeInput): number {
  const steps = buildWizardSteps(input.enabledModes);

  if (
    typeof input.savedStepIndex === "number" &&
    input.savedStepIndex >= 0 &&
    input.savedStepIndex < steps.length
  ) {
    return input.savedStepIndex;
  }

  const indexOfGeneral = (id: GeneralStepId) =>
    steps.findIndex((s) => s.kind === "general" && s.id === id);

  if (!input.firstName.trim() || !input.lastName.trim() || !hasBirthdayValue(input.birthday)) {
    return indexOfGeneral("name");
  }
  if (input.corePhotoCount < MIN_CORE_PHOTOS) {
    return indexOfGeneral("photos");
  }
  if (!input.city.trim()) {
    return indexOfGeneral("location");
  }
  for (const mode of input.enabledModes) {
    if (!input.modeComplete[mode]) {
      return steps.findIndex((s) => s.kind === "mode" && s.mode === mode && s.id === "photosBio");
    }
  }
  return steps.length - 1;
}
