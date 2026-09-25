// eslint-disable-next-line @typescript-eslint/no-require-imports
const tr = require("../scripts/lib/translateI18n.js");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { hashEn } = require("../scripts/lib/i18nCoverage.js");

const placeholder = (english: string) => ({ status: "needs_translation", en_hash: hashEn(english) });

describe("keepsTokens", () => {
  it("requires the same placeholders and tags, in any order", () => {
    expect(tr.keepsTokens("{{count}} of {{total}}", "{{total}} — {{count}}")).toBe(true);
    expect(tr.keepsTokens("Hi <b>{{name}}</b>", "Hallo <b>{{name}}</b>")).toBe(true);
    expect(tr.keepsTokens("{{count}} days", "{{n}} Tage")).toBe(false);
    expect(tr.keepsTokens("{{name}}", "{{name}} {{name}}")).toBe(false);
    expect(tr.keepsTokens("Plan", "Plan {{x}}")).toBe(false);
  });
});

describe("buildJobs", () => {
  const en = {
    "a.title": "Plan summary",
    "a.done": "Done",
    "a.days_one": "{{count}} day",
    "a.days_other": "{{count}} days",
  };

  it("picks recorded placeholders but not real translations", () => {
    const loc = { "a.title": "Plan summary", "a.done": "Fertig", "a.days_one": "{{count}} Tag", "a.days_other": "{{count}} Tage" };
    const status = { "a.title": placeholder("Plan summary") };
    expect(tr.buildJobs({ en, loc, locale: "de", status })).toEqual([{ key: "a.title", english: "Plan summary" }]);
  });

  it("skips a placeholder whose English changed since (sync refreshes it first)", () => {
    const loc = { "a.title": "Old English", "a.done": "Fertig", "a.days_one": "x", "a.days_other": "y" };
    const status = { "a.title": placeholder("Old English") };
    expect(tr.buildJobs({ en, loc, locale: "de", status })).toEqual([{ key: "a.title", english: "Plan summary" }]);
    const statusStale = { "a.title": placeholder("Something else") };
    expect(tr.buildJobs({ en, loc, locale: "de", status: statusStale })).toEqual([]);
  });

  it("adds the plural categories a language needs (pl: few, many)", () => {
    const loc = { "a.title": "Podsumowanie", "a.done": "Gotowe", "a.days_one": "{{count}} dzień", "a.days_other": "{{count}} dni" };
    const jobs = tr.buildJobs({ en, loc, locale: "pl", status: {} });
    expect(jobs).toEqual([
      { key: "a.days_few", english: "{{count}} days", plural: "few" },
      { key: "a.days_many", english: "{{count}} days", plural: "many" },
    ]);
    expect(tr.buildJobs({ en, loc: { ...loc, "a.days_few": "x", "a.days_many": "y" }, locale: "pl", status: {} })).toEqual([]);
    expect(tr.buildJobs({ en, loc, locale: "de", status: {} })).toEqual([]);
  });
});

describe("acceptTranslations", () => {
  const batch = [
    { key: "k0", english: "{{count}} days" },
    { key: "k1", english: "Done" },
    { key: "k2", english: "Hi {{name}}" },
  ];

  it("keeps valid items and reports missing or broken ones", () => {
    const reply = { items: [{ i: 0, text: "{{count}} Tage" }, { i: 2, text: "Hallo {{nombre}}" }] };
    expect(tr.acceptTranslations(batch, reply)).toEqual({
      accepted: [{ key: "k0", value: "{{count}} Tage" }],
      rejected: [
        { key: "k1", reason: "missing" },
        { key: "k2", reason: "placeholders changed" },
      ],
    });
  });

  it("ignores malformed replies", () => {
    expect(tr.acceptTranslations(batch, null).accepted).toEqual([]);
    expect(tr.acceptTranslations(batch, { items: [{ i: "0", text: 5 }] }).rejected).toHaveLength(3);
  });
});

describe("describeJob", () => {
  it("numbers lines and asks for the plural form when needed", () => {
    expect(tr.describeJob({ key: "a", english: "Done" }, 3)).toBe('3. (a): "Done"');
    expect(tr.describeJob({ key: "a_few", english: "{{count}} days", plural: "few" }, 0)).toContain("'few' plural form");
  });
});
