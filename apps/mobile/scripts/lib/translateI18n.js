/**
 * Pure helpers for scripts/translate-i18n.mjs (unit-tested in __tests__/translateI18n.test.ts).
 * No file I/O and no network here.
 *
 * A "job" is one string to translate into one locale:
 *  - a recorded English placeholder (translation-status.json), or
 *  - a missing plural form the locale needs (e.g. pl `_few`), sourced from en `<base>_other`.
 */
const { isRecordedPlaceholder } = require("./i18nCoverage.js");

/** English names for the prompt (the model knows these best). */
const LANGUAGE_NAMES = {
  de: "German", uk: "Ukrainian", ru: "Russian", pl: "Polish", es: "Spanish (Spain)", fr: "French",
  it: "Italian", nl: "Dutch", pt: "European Portuguese", el: "Greek", ro: "Romanian", hu: "Hungarian",
  cs: "Czech", sv: "Swedish", da: "Danish", fi: "Finnish", sk: "Slovak", bg: "Bulgarian", hr: "Croatian",
  sl: "Slovenian", et: "Estonian", lv: "Latvian", lt: "Lithuanian", mt: "Maltese", ga: "Irish",
};

/** What each CLDR plural category means, so the model writes the right grammatical form. */
const PLURAL_HINTS = {
  zero: "the form used for a count of 0",
  one: "the form used for a count of 1",
  two: "the form used for a count of 2",
  few: "the 'few' plural form (e.g. counts like 2–4 in Slavic languages)",
  many: "the 'many' plural form (e.g. counts like 5–20 in Slavic languages)",
};

/** Placeholders and inline tags that must survive translation, as a sorted multiset. */
function tokens(text) {
  return (String(text).match(/\{\{\s*\w+\s*\}\}|<\/?\w+>/g) ?? []).map((t) => t.replace(/\s+/g, "")).sort();
}

/** True when `translated` keeps exactly the placeholders/tags of `english` (no more, no fewer). */
function keepsTokens(english, translated) {
  const a = tokens(english);
  const b = tokens(translated);
  return a.length === b.length && a.every((t, i) => t === b[i]);
}

function pluralCategories(locale) {
  try {
    return new Intl.PluralRules(locale).resolvedOptions().pluralCategories;
  } catch {
    return ["one", "other"];
  }
}

/**
 * Jobs for one locale: every recorded placeholder still holding its English, plus every plural
 * category the locale's grammar needs that the file doesn't have yet.
 */
function buildJobs({ en, loc, locale, status = {} }) {
  const jobs = [];
  for (const [key, entry] of Object.entries(status)) {
    if (!(key in en) || !(key in loc)) continue;
    if (!isRecordedPlaceholder(loc[key], entry)) continue;
    jobs.push({ key, english: en[key] });
  }
  const extra = pluralCategories(locale).filter((c) => c !== "one" && c !== "other");
  for (const key of Object.keys(en)) {
    const m = /^(.+)_other$/.exec(key);
    if (!m) continue;
    for (const category of extra) {
      const formKey = `${m[1]}_${category}`;
      if (!(formKey in loc)) jobs.push({ key: formKey, english: en[key], plural: category });
    }
  }
  return jobs;
}

function chunk(items, size) {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Line the model sees for one job (index, optional plural hint, English). */
function describeJob(job, i) {
  const hint = job.plural ? ` [write ${PLURAL_HINTS[job.plural] ?? job.plural}]` : "";
  return `${i}. (${job.key})${hint}: ${JSON.stringify(job.english)}`;
}

/**
 * Validate a model reply `{ items: [{ i, text }] }` against the batch.
 * Returns accepted `{ key, value }` pairs and the keys that were rejected (with reasons).
 */
function acceptTranslations(batch, reply) {
  const accepted = [];
  const rejected = [];
  const byIndex = new Map();
  for (const item of reply?.items ?? []) {
    if (Number.isInteger(item?.i) && typeof item?.text === "string") byIndex.set(item.i, item.text);
  }
  batch.forEach((job, i) => {
    const text = byIndex.get(i)?.trim();
    if (!text) rejected.push({ key: job.key, reason: "missing" });
    else if (!keepsTokens(job.english, text)) rejected.push({ key: job.key, reason: "placeholders changed" });
    else accepted.push({ key: job.key, value: text });
  });
  return { accepted, rejected };
}

module.exports = {
  LANGUAGE_NAMES,
  tokens,
  keepsTokens,
  pluralCategories,
  buildJobs,
  chunk,
  describeJob,
  acceptTranslations,
};
