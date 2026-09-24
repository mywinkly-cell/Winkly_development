import en from "../lib/i18n/locales/en.json";
import {
  EDUCATION_OPTIONS,
  GENDER_OPTIONS,
  educationLabelKey,
  genderLabelKey,
  optionLabel,
} from "../lib/profile/coreOptionLabels";

const enStrings = en as Record<string, string>;

describe("coreOptionLabels", () => {
  it("maps every gender option to an existing English key", () => {
    for (const value of GENDER_OPTIONS) {
      const key = genderLabelKey(value);
      expect(key).not.toBeNull();
      expect(enStrings[key as string]).toBe(value);
    }
  });

  it("maps every education option to an existing English key", () => {
    for (const value of EDUCATION_OPTIONS) {
      const key = educationLabelKey(value);
      expect(key).not.toBeNull();
      expect(enStrings[key as string]).toBe(value);
    }
  });

  it("returns null for unknown values", () => {
    expect(genderLabelKey("Nonbinary")).toBeNull();
    expect(educationLabelKey("")).toBeNull();
  });

  it("optionLabel translates known values and passes unknown ones through", () => {
    const t = (key: string) => `T(${key})`;
    expect(optionLabel(t, genderLabelKey, "Male")).toBe("T(onboarding.gender.male)");
    expect(optionLabel(t, genderLabelKey, "Custom")).toBe("Custom");
  });
});
