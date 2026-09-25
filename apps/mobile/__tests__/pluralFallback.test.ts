import i18next from "i18next";
import { fillMissingPluralForms, pluralCategoriesFor } from "@/lib/i18n/pluralFallback";

describe("pluralFallback", () => {
  it("knows which categories a language needs", () => {
    expect(pluralCategoriesFor("en")).toEqual(expect.arrayContaining(["one", "other"]));
    expect(pluralCategoriesFor("pl")).toEqual(expect.arrayContaining(["one", "few", "many", "other"]));
  });

  it("fills missing categories from _other without overwriting real forms", () => {
    const out = fillMissingPluralForms(
      { "a_one": "1 dzień", "a_few": "{{count}} dni (few)", "a_other": "{{count}} dni", plain: "x" },
      ["one", "few", "many", "other"]
    );
    expect(out["a_few"]).toBe("{{count}} dni (few)");
    expect(out["a_many"]).toBe("{{count}} dni");
    expect(out.plain).toBe("x");
    expect(Object.keys(out)).not.toContain("plain_many");
  });

  it("stops i18next rendering the raw key for Polish counts", async () => {
    const i18n = i18next.createInstance();
    const bundle = fillMissingPluralForms({ "a_one": "1 kontakt", "a_other": "{{count}} kontaktów" }, pluralCategoriesFor("pl"));
    await i18n.init({ lng: "pl", fallbackLng: false, resources: { pl: { translation: bundle } } });
    expect(i18n.t("a", { count: 3 })).toBe("3 kontaktów");
    expect(i18n.t("a", { count: 1 })).toBe("1 kontakt");
  });
});
