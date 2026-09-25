import {
  buildWizardSteps,
  validateWizardStep,
  inferWizardResumeStep,
  wizardStepLabel,
  type WizardValidationInput,
  type WizardStep,
} from "@/lib/profile/onboardingWizard";
import { MIN_CORE_PHOTOS } from "@/lib/profile/validation";

const baseValidationInput: WizardValidationInput = {
  firstName: "Kate",
  lastName: "Smith",
  birthday: "2000-01-01",
  city: "Berlin",
  gender: "Female",
  corePhotoCount: MIN_CORE_PHOTOS,
  romance: { bio: "", photos: [], relationshipGoals: [] },
  friends: { bio: "", photos: [], meetupGoals: [] },
  business: { bio: "", photos: [], networkingGoals: [] },
};

describe("buildWizardSteps", () => {
  it("has 5 general steps plus review with no modes enabled", () => {
    const steps = buildWizardSteps([]);
    expect(steps).toHaveLength(6);
    expect(steps.map((s) => s.kind)).toEqual(["general", "general", "general", "general", "general", "review"]);
  });

  it("adds 3 steps per enabled mode, in order, before review", () => {
    const steps = buildWizardSteps(["romance", "business"]);
    expect(steps).toHaveLength(5 + 3 + 3 + 1);
    expect(steps[5]).toMatchObject({ kind: "mode", mode: "romance", id: "photosBio" });
    expect(steps[6]).toMatchObject({ kind: "mode", mode: "romance", id: "details" });
    expect(steps[7]).toMatchObject({ kind: "mode", mode: "romance", id: "goals" });
    expect(steps[8]).toMatchObject({ kind: "mode", mode: "business", id: "photosBio" });
    expect(steps[steps.length - 1]).toEqual({ kind: "review" });
  });

  it("supports all three modes enabled at once", () => {
    const steps = buildWizardSteps(["romance", "friends", "business"]);
    expect(steps).toHaveLength(5 + 9 + 1);
  });
});

describe("validateWizardStep", () => {
  it("requires name and birthday on the name step", () => {
    const step: WizardStep = { kind: "general", id: "name" };
    expect(validateWizardStep(step, { ...baseValidationInput, firstName: "" })).toMatchObject({ ok: false });
    expect(validateWizardStep(step, { ...baseValidationInput, birthday: null })).toMatchObject({ ok: false });
    expect(validateWizardStep(step, baseValidationInput)).toEqual({ ok: true });
  });

  it("requires minimum photos on the photos step", () => {
    const step: WizardStep = { kind: "general", id: "photos" };
    expect(validateWizardStep(step, { ...baseValidationInput, corePhotoCount: 1 })).toMatchObject({
      ok: false,
      titleKey: "onboarding.wizard.validation.photosTitle",
      params: { count: 2, max: 5 },
    });
    expect(validateWizardStep(step, baseValidationInput)).toEqual({ ok: true });
  });

  it("requires city and gender on the location step", () => {
    const step: WizardStep = { kind: "general", id: "location" };
    expect(validateWizardStep(step, { ...baseValidationInput, city: "" })).toMatchObject({ ok: false });
    expect(validateWizardStep(step, { ...baseValidationInput, gender: "" })).toMatchObject({ ok: false });
    expect(validateWizardStep(step, baseValidationInput)).toEqual({ ok: true });
  });

  it("never blocks on the about or modes steps", () => {
    expect(validateWizardStep({ kind: "general", id: "about" }, baseValidationInput)).toEqual({ ok: true });
    expect(validateWizardStep({ kind: "general", id: "modes" }, baseValidationInput)).toEqual({ ok: true });
  });

  it("requires a photo and bio on each mode's photosBio step", () => {
    const step: WizardStep = { kind: "mode", mode: "romance", id: "photosBio" };
    expect(validateWizardStep(step, baseValidationInput)).toMatchObject({ ok: false });
    expect(
      validateWizardStep(step, {
        ...baseValidationInput,
        romance: { bio: "Hi there", photos: [null, "uri"], relationshipGoals: [] },
      })
    ).toEqual({ ok: true });
  });

  it("never blocks on a mode's details step", () => {
    const step: WizardStep = { kind: "mode", mode: "friends", id: "details" };
    expect(validateWizardStep(step, baseValidationInput)).toEqual({ ok: true });
  });

  it("requires at least one goal on each mode's goals step", () => {
    expect(validateWizardStep({ kind: "mode", mode: "romance", id: "goals" }, baseValidationInput)).toMatchObject({ ok: false });
    expect(
      validateWizardStep(
        { kind: "mode", mode: "romance", id: "goals" },
        { ...baseValidationInput, romance: { bio: "", photos: [], relationshipGoals: ["Long-term"] } }
      )
    ).toEqual({ ok: true });

    expect(validateWizardStep({ kind: "mode", mode: "friends", id: "goals" }, baseValidationInput)).toMatchObject({ ok: false });
    expect(
      validateWizardStep(
        { kind: "mode", mode: "friends", id: "goals" },
        { ...baseValidationInput, friends: { bio: "", photos: [], meetupGoals: ["Coffee"] } }
      )
    ).toEqual({ ok: true });

    expect(validateWizardStep({ kind: "mode", mode: "business", id: "goals" }, baseValidationInput)).toMatchObject({ ok: false });
    expect(
      validateWizardStep(
        { kind: "mode", mode: "business", id: "goals" },
        { ...baseValidationInput, business: { bio: "", photos: [], networkingGoals: ["Mentorship"] } }
      )
    ).toEqual({ ok: true });
  });

  it("never blocks on the review step", () => {
    expect(validateWizardStep({ kind: "review" }, baseValidationInput)).toEqual({ ok: true });
  });
});

describe("inferWizardResumeStep", () => {
  it("respects a saved step index from the draft", () => {
    expect(
      inferWizardResumeStep({
        firstName: "A",
        lastName: "B",
        birthday: "2000-01-01",
        city: "Berlin",
        corePhotoCount: MIN_CORE_PHOTOS,
        enabledModes: [],
        modeComplete: {},
        savedStepIndex: 3,
      })
    ).toBe(3);
  });

  it("infers the name step when name/birthday is missing", () => {
    expect(
      inferWizardResumeStep({
        firstName: "",
        lastName: "B",
        birthday: null,
        city: "",
        corePhotoCount: 0,
        enabledModes: [],
        modeComplete: {},
      })
    ).toBe(0);
  });

  it("infers the photos step when photos are missing", () => {
    expect(
      inferWizardResumeStep({
        firstName: "A",
        lastName: "B",
        birthday: "2000-01-01",
        city: "Berlin",
        corePhotoCount: 0,
        enabledModes: [],
        modeComplete: {},
      })
    ).toBe(1);
  });

  it("falls into an enabled mode's photosBio step when that mode is incomplete", () => {
    const index = inferWizardResumeStep({
      firstName: "A",
      lastName: "B",
      birthday: "2000-01-01",
      city: "Berlin",
      corePhotoCount: MIN_CORE_PHOTOS,
      enabledModes: ["friends"],
      modeComplete: { friends: false },
    });
    const steps = buildWizardSteps(["friends"]);
    expect(steps[index]).toMatchObject({ kind: "mode", mode: "friends", id: "photosBio" });
  });

  it("resumes at the review step once general info and every enabled mode are complete", () => {
    const enabledModes = ["romance"] as const;
    const index = inferWizardResumeStep({
      firstName: "A",
      lastName: "B",
      birthday: "2000-01-01",
      city: "Berlin",
      corePhotoCount: MIN_CORE_PHOTOS,
      enabledModes: [...enabledModes],
      modeComplete: { romance: true },
    });
    const steps = buildWizardSteps([...enabledModes]);
    expect(index).toBe(steps.length - 1);
  });
});

describe("wizardStepLabel", () => {
  // Fake t: echoes the key and any interpolation values so the composition is visible.
  const t = (key: string, opts?: Record<string, unknown>) =>
    opts ? `${key}(${Object.entries(opts).map(([k, v]) => `${k}=${v}`).join(",")})` : key;

  it("uses a translated label for general and review steps", () => {
    expect(wizardStepLabel({ kind: "general", id: "photos" }, t)).toBe("onboarding.wizard.step.photos");
    expect(wizardStepLabel({ kind: "review" }, t)).toBe("onboarding.wizard.step.review");
  });

  it("composes mode steps via interpolation, not concatenation", () => {
    expect(wizardStepLabel({ kind: "mode", mode: "friends", id: "goals" }, t)).toBe(
      "onboarding.wizard.step.modeStep(mode=modes.friends,step=onboarding.wizard.step.goals)"
    );
  });
});

describe("validateWizardStep i18n keys", () => {
  it("returns per-mode keys for the photos+bio step", () => {
    const noBio = { ...baseValidationInput, business: { ...baseValidationInput.business, bio: "" } };
    expect(validateWizardStep({ kind: "mode", mode: "business", id: "photosBio" }, noBio)).toEqual({
      ok: false,
      titleKey: "onboarding.wizard.validation.businessProfileTitle",
      messageKey: "onboarding.wizard.validation.businessPhotosBio",
    });
  });
});
