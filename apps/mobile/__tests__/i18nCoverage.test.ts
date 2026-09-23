import {
  computeCoverage,
  hashEn,
  isAllowlisted,
  NEEDS_TRANSLATION,
  serializeStatus,
  syncLocale,
} from "../scripts/lib/i18nCoverage";

const allowlist = { values: ["OK", "Winkly"], keys: ["profile.instagram"], locales: { de: ["auth.email"] } };

describe("isAllowlisted", () => {
  it("allows values without letters (emoji, punctuation, interpolation only)", () => {
    expect(isAllowlisted("a", "✨", "fi", allowlist)).toBe(true);
    expect(isAllowlisted("a", "{{count}} · {{km}}", "fi", allowlist)).toBe(true);
    expect(isAllowlisted("a", "{{km}} km", "fi", allowlist)).toBe(false);
  });

  it("allows listed values, keys and per-locale keys", () => {
    expect(isAllowlisted("common.ok", "OK", "fi", allowlist)).toBe(true);
    expect(isAllowlisted("profile.instagram", "Instagram", "fi", allowlist)).toBe(true);
    expect(isAllowlisted("auth.email", "Email", "de", allowlist)).toBe(true);
    expect(isAllowlisted("auth.email", "Email", "fi", allowlist)).toBe(false);
  });
});

describe("computeCoverage", () => {
  const en = { hello: "Hello", ok: "OK", spark: "✨", bye: "Bye" };

  it("counts only values that differ from English, plus allowlisted keys", () => {
    const loc = { hello: "Hei", ok: "OK", spark: "✨", bye: "Bye" };
    const r = computeCoverage({ en, loc, locale: "fi", allowlist });
    expect(r.covered).toBe(3);
    expect(r.total).toBe(4);
    expect(r.percent).toBe(75);
    expect(r.uncovered).toEqual(["bye"]);
  });

  it("treats missing or empty values as uncovered", () => {
    const r = computeCoverage({ en, loc: { hello: "", ok: "OK" }, locale: "fi", allowlist });
    expect(r.uncovered).toEqual(["hello", "spark", "bye"]);
  });

  it("does not count a stale English placeholder as translated after English changes", () => {
    const status = { fi: { hello: { status: NEEDS_TRANSLATION, en_hash: hashEn("Hi") } } };
    const loc = { hello: "Hi", ok: "OK", spark: "✨", bye: "Hei hei" };
    const r = computeCoverage({ en, loc, locale: "fi", allowlist, status });
    expect(r.uncovered).toEqual(["hello"]);
  });

  it("floors the percentage", () => {
    const three = { a: "A1", b: "B1", c: "C1" };
    expect(computeCoverage({ en: three, loc: { a: "x", b: "B1", c: "C1" }, locale: "fi" }).percent).toBe(33);
  });
});

describe("syncLocale", () => {
  it("adds missing keys from patches or English and records English placeholders", () => {
    const en = { a: "Apple", b: "Banana", ok: "OK" };
    const r = syncLocale({ en, loc: {}, locale: "fi", patch: { a: "Omena" }, allowlist });
    expect(r.loc).toEqual({ a: "Omena", b: "Banana", ok: "OK" });
    expect(r.added).toEqual(["a", "b", "ok"]);
    expect(r.status).toEqual({ b: { status: NEEDS_TRANSLATION, en_hash: hashEn("Banana") } });
  });

  it("backfills records for existing values identical to English", () => {
    const r = syncLocale({ en: { a: "Apple" }, loc: { a: "Apple" }, locale: "fi" });
    expect(r.added).toEqual([]);
    expect(r.status.a).toEqual({ status: NEEDS_TRANSLATION, en_hash: hashEn("Apple") });
  });

  it("drops the record once the value is translated", () => {
    const status = { a: { status: NEEDS_TRANSLATION, en_hash: hashEn("Apple") } };
    const r = syncLocale({ en: { a: "Apple" }, loc: { a: "Omena" }, locale: "fi", status });
    expect(r.status).toEqual({});
  });

  it("refreshes a placeholder to the new English when English changes", () => {
    const status = { a: { status: NEEDS_TRANSLATION, en_hash: hashEn("Apple") } };
    const r = syncLocale({ en: { a: "Green apple" }, loc: { a: "Apple" }, locale: "fi", status });
    expect(r.loc.a).toBe("Green apple");
    expect(r.refreshed).toEqual(["a"]);
    expect(r.status.a.en_hash).toBe(hashEn("Green apple"));
  });

  it("drops records for keys removed from English and does not mutate inputs", () => {
    const loc = { a: "Omena" };
    const status = { gone: { status: NEEDS_TRANSLATION, en_hash: "x" } };
    const r = syncLocale({ en: { a: "Apple" }, loc, locale: "fi", status });
    expect(r.status).toEqual({});
    expect(loc).toEqual({ a: "Omena" });
  });
});

describe("serializeStatus", () => {
  it("writes valid, sorted JSON with one line per entry", () => {
    const out = serializeStatus(
      {
        fi: { b: { status: NEEDS_TRANSLATION, en_hash: "2" }, a: { status: NEEDS_TRANSLATION, en_hash: "1" } },
        de: {},
      },
      "readme"
    );
    const parsed = JSON.parse(out);
    expect(Object.keys(parsed)).toEqual(["_readme", "de", "fi"]);
    expect(Object.keys(parsed.fi)).toEqual(["a", "b"]);
    expect(out.split("\n").filter((l) => l.includes("en_hash"))).toHaveLength(2);
  });

  it("stays valid JSON with no locales", () => {
    expect(JSON.parse(serializeStatus({}, "readme"))).toEqual({ _readme: "readme" });
  });
});
