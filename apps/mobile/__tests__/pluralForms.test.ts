import { fillMissingPluralForms } from "../lib/i18n/pluralForms";

describe("fillMissingPluralForms", () => {
  const bundle = { "x.pets_one": "{{count}} pet", "x.pets_other": "{{count}} pets", plain: "Hi" };

  it("adds few/many for Russian from _other", () => {
    const out = fillMissingPluralForms(bundle, "ru");
    expect(out["x.pets_few"]).toBe("{{count}} pets");
    expect(out["x.pets_many"]).toBe("{{count}} pets");
    expect(out["x.pets_one"]).toBe("{{count}} pet");
  });

  it("keeps forms a locale already translated", () => {
    const out = fillMissingPluralForms({ ...bundle, "x.pets_few": "{{count}} zwierzęta" }, "pl");
    expect(out["x.pets_few"]).toBe("{{count}} zwierzęta");
    expect(out["x.pets_many"]).toBe("{{count}} pets");
  });

  it("adds nothing for English and leaves non-plural keys alone", () => {
    expect(fillMissingPluralForms(bundle, "en")).toEqual(bundle);
  });

  it("does not mutate the input", () => {
    const copy = { ...bundle };
    fillMissingPluralForms(bundle, "uk");
    expect(bundle).toEqual(copy);
  });
});
