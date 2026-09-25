import { hashEn, NEEDS_TRANSLATION, TRANSLATED } from "../scripts/lib/i18nCoverage";
import {
  applyReview,
  isLengthChecked,
  lengthWarning,
  parseCsv,
  planLocale,
  pluralCategories,
  pluralExamples,
  pluralSource,
  protectForDeepl,
  restoreCount,
  restoreFromDeepl,
  reviewRows,
  toCsv,
  translationRecord,
  validateTranslation,
} from "../scripts/lib/i18nTranslate";

const dnt = ["Winkly", "Weekly Spark"];

describe("validateTranslation", () => {
  it("accepts a translation that keeps every token", () => {
    expect(validateTranslation("Hi {{name}} 👋\nWelcome to Winkly", "Hallo {{name}} 👋\nWillkommen bei Winkly", { doNotTranslate: dnt })).toEqual([]);
  });

  it("allows placeholders to move and tolerates whitespace inside braces", () => {
    expect(validateTranslation("{{a}} of {{b}}", "{{ b }}: {{a}}")).toEqual([]);
  });

  it("fails on a missing, added or renamed placeholder", () => {
    expect(validateTranslation("{{count}} days", "Tage")).toEqual(["missing placeholder: {{count}}"]);
    expect(validateTranslation("Days", "{{count}} Tage")).toEqual(["added placeholder: {{count}}"]);
    expect(validateTranslation("{{name}}", "{{nom}}")).toEqual(["missing placeholder: {{name}}", "added placeholder: {{nom}}"]);
    expect(validateTranslation("{{name}} and {{name}}", "{{name}}")).toEqual(["missing placeholder: {{name}}"]);
  });

  it("checks <Trans> tags, emoji, line breaks and never-translate names", () => {
    expect(validateTranslation("<bold>{{g}}</bold>", "{{g}}")).toEqual(["missing tag: </bold> <bold>"]);
    expect(validateTranslation("Welcome 💫", "Willkommen")).toEqual(["missing emoji: 💫"]);
    expect(validateTranslation("a\nb", "a b")).toEqual(["line breaks: expected 1, got 0"]);
    expect(validateTranslation("Your Weekly Spark", "Dein wöchentlicher Funke", { doNotTranslate: dnt })).toEqual([
      '"Weekly Spark" must stay untranslated',
    ]);
    expect(validateTranslation("", "")).toEqual(["empty translation"]);
  });
});

describe("length check", () => {
  it("applies to button, chip and tab keys only", () => {
    expect(isLengthChecked("account.delete.deleteButton")).toBe(true);
    expect(isLengthChecked("concierge.form.chip.hike")).toBe(true);
    expect(isLengthChecked("concierge.chips.bio")).toBe(true);
    expect(isLengthChecked("chat.allTab")).toBe(true);
    expect(isLengthChecked("concierge.catalog.chef_s_table_style")).toBe(false);
    expect(isLengthChecked("common.save")).toBe(false);
  });

  it("warns above 150% of the English length, ignoring placeholders", () => {
    expect(lengthWarning("x.button", "Save", "Speichern")).toMatch(/9 chars vs 4/);
    expect(lengthWarning("x.button", "Save", "Sparen")).toBeNull();
    expect(lengthWarning("x.chip", "{{n}} km", "{{n}} km")).toBeNull();
    expect(lengthWarning("common.save", "Save", "Speichern unter")).toBeNull();
  });
});

describe("plurals", () => {
  it("lists the CLDR categories each language needs", () => {
    expect(pluralCategories("de")).toEqual(["one", "other"]);
    expect(pluralCategories("pl")).toEqual(["one", "few", "many", "other"]);
    expect(pluralCategories("uk")).toEqual(["one", "few", "many", "other"]);
    expect(pluralCategories("lv")).toEqual(["zero", "one", "other"]);
    expect(pluralCategories("sl")).toEqual(["one", "two", "few", "other"]);
    expect(pluralCategories("ga")).toEqual(["one", "two", "few", "many", "other"]);
    expect(pluralCategories("mt")).toEqual(["one", "two", "few", "many", "other"]);
  });

  it("gives example numbers per category, decimals when integers never reach it", () => {
    const pl = pluralExamples("pl");
    expect(pl.one).toEqual([1]);
    expect(pl.few.slice(0, 3)).toEqual([2, 3, 4]);
    expect(pluralExamples("cs").many).toContain(1.5);
  });

  it("translates 'one' from English _one only when it means exactly 1 or keeps the placeholders", () => {
    const group = { one: "One member", other: "{{count}} members" };
    expect(pluralSource("de", "one", group)).toBe("One member");
    expect(pluralSource("uk", "one", group)).toBe("{{count}} members"); // uk "one" is also 21, 31, …
    expect(pluralSource("fr", "one", group)).toBe("{{count}} members"); // fr "one" is also 0
    expect(pluralSource("uk", "one", { one: "{{count}} member", other: "{{count}} members" })).toBe("{{count}} member");
    expect(pluralSource("pl", "few", group)).toBe("{{count}} members");
  });
});

describe("planLocale", () => {
  const en = {
    hello: "Hello",
    bye: "Bye",
    premium: "Premium",
    ok: "OK",
    "m_one": "{{count}} member",
    "m_other": "{{count}} members",
  };
  const allowlist = { values: ["OK"] };

  it("picks placeholders, stale translations and missing plural forms, skipping allowlisted keys", () => {
    const loc = { hello: "Hello", bye: "Tschüss", premium: "Premium", ok: "OK", m_one: "{{count}} członek", m_other: "{{count}} członków" };
    const status = {
      hello: { status: NEEDS_TRANSLATION, en_hash: hashEn("Hello") },
      bye: { status: TRANSLATED, method: "machine", reviewed: false, en_hash: hashEn("Goodbye") },
      premium: { status: TRANSLATED, method: "machine", reviewed: false, en_hash: hashEn("Premium"), same_as_en: true },
      m_one: { status: TRANSLATED, method: "legacy", reviewed: false, en_hash: hashEn("{{count}} member") },
      m_other: { status: TRANSLATED, method: "legacy", reviewed: false, en_hash: hashEn("{{count}} members") },
    };
    const { items } = planLocale({ en, loc, locale: "pl", status, allowlist });
    expect(items.map((i) => [i.key, i.reason])).toEqual([
      ["hello", "untranslated"],
      ["bye", "english changed"],
      ["m_few", "missing"],
      ["m_many", "missing"],
    ]);
    expect(items.find((i) => i.key === "bye")?.previous).toBe("Tschüss");
    expect(items.find((i) => i.key === "m_few")?.plural).toMatchObject({ category: "few", existing: { one: "{{count}} członek" } });
  });

  it("with force redoes machine and legacy translations but never human ones", () => {
    const loc = { hello: "Hallo", bye: "Tschüss", premium: "Premium", ok: "OK", m_one: "a {{count}}", m_other: "b {{count}}" };
    const human = { status: TRANSLATED, method: "human", reviewed: true, en_hash: hashEn("Hello") };
    const { items } = planLocale({ en, loc, locale: "de", status: { hello: human }, allowlist, force: true, only: "hello" });
    expect(items).toEqual([]);
  });
});

describe("translationRecord", () => {
  it("marks a translation identical to English as confirmed", () => {
    const en = { p: "Premium", s: "Save" };
    expect(translationRecord({ key: "p", en, value: "Premium", method: "machine", reviewed: false, date: "d" }).same_as_en).toBe(true);
    expect(translationRecord({ key: "s", en, value: "Speichern", method: "machine", reviewed: false, date: "d" })).not.toHaveProperty("same_as_en");
  });
});

describe("DeepL markup", () => {
  it("protects tokens and names and restores them", () => {
    const text = "Hi {{name}} & <bold>Winkly</bold> 💫\nbye";
    const xml = protectForDeepl(text, dnt);
    expect(xml).toBe("Hi <x>{{name}}</x> &amp; <x>&lt;bold&gt;</x><x>Winkly</x><x>&lt;/bold&gt;</x> <x>💫</x><lb/>bye");
    expect(restoreFromDeepl(xml)).toBe(text);
  });

  it("puts {{count}} back where the example number ended up", () => {
    expect(restoreCount("3 członków", 3)).toBe("{{count}} członków");
    expect(restoreCount("1,5 členu", 1.5)).toBe("{{count}} členu");
    expect(restoreCount("3 z 3", 3)).toBeNull();
  });
});

describe("review CSV", () => {
  const en = { a: "Hello {{name}}", b: "Save", "m_one": "{{count}} day", "m_other": "{{count}} days" };
  const loc = { a: "Hallo {{name}}", b: "Speichern", m_one: "{{count}} Tag", m_other: "{{count}} Tage" };
  const status = {
    a: { status: TRANSLATED, method: "machine", reviewed: false, en_hash: hashEn("Hello {{name}}") },
    b: { status: TRANSLATED, method: "human", reviewed: true, en_hash: hashEn("Save") },
  };

  it("round-trips through CSV with commas, quotes and line breaks", () => {
    const rows = [{ key: "k", english: 'Say "hi",\nthen go', translation: "ok" }];
    const parsed = parseCsv(toCsv(rows));
    expect(parsed[0]).toMatchObject({ key: "k", english: 'Say "hi",\nthen go', translation: "ok", correction: "" });
  });

  it("exports unreviewed rows (plural forms included), all rows with `all`", () => {
    expect(reviewRows({ en, loc, locale: "de", status }).map((r) => r.key)).toEqual(["a", "m_one", "m_other"]);
    expect(reviewRows({ en, loc, locale: "de", status, all: true })).toHaveLength(4);
  });

  it("imports corrections as human + reviewed, approvals as reviewed, and rejects broken ones", () => {
    const rows = [
      { key: "a", english: "Hello {{name}}", correction: "Hi {{name}}", approve: "" },
      { key: "m_one", english: "{{count}} day", correction: "", approve: "x" },
      { key: "m_other", english: "{{count}} days", correction: "Tage", approve: "" },
      { key: "b", english: "Save (old)", correction: "Sichern", approve: "" },
    ];
    const r = applyReview({ rows, en, loc, locale: "de", status, date: "2026-09-25" });
    expect(r.loc.a).toBe("Hi {{name}}");
    expect(r.status.a).toMatchObject({ method: "human", reviewed: true, date: "2026-09-25", en_hash: hashEn("Hello {{name}}") });
    expect(r.approved).toEqual(["m_one"]);
    expect(r.status.m_one).toMatchObject({ method: "human", reviewed: true });
    expect(r.skipped.map((s) => s.key)).toEqual(["m_other", "b"]);
    expect(r.loc.m_other).toBe("{{count}} Tage");
  });
});
