/**
 * Pure helpers shared by sync-i18n-keys.mjs and audit-i18n.mjs (unit-tested in
 * __tests__/i18nCoverage.test.ts). No file I/O here.
 *
 * Terms:
 *  - placeholder: a locale value that is just the English text copied in by sync-i18n
 *    so the key exists. It is recorded in translation-status.json with the hash of the
 *    English it was copied from.
 *  - covered: the locale has a real translation — its value differs from English and is
 *    not a recorded placeholder, or the key is allowlisted (same in every language), or a
 *    translator confirmed it is identical to English (a "translated" record for this English).
 *  - translation record: { status: "translated", method, reviewed, date?, en_hash, same_as_en? } — written by
 *    translate-i18n.mjs (method "machine" / "human") or backfilled by sync for translations that
 *    predate the pipeline (method "legacy"). en_hash is the English it was translated from, so a
 *    record whose en_hash no longer matches en.json marks a stale translation. same_as_en: true
 *    confirms a value identical to English ("Premium"); without it such a value is a placeholder.
 *  - plural extras: key_few / key_many / … that a language needs on top of English's key_one /
 *    key_other. Their en_hash covers both English forms (hashPluralGroup).
 */
const crypto = require("crypto");

const NEEDS_TRANSLATION = "needs_translation";
const TRANSLATED = "translated";
const PLURAL_SUFFIX = /^(.+)_(zero|one|two|few|many|other)$/;

/** Short, stable hash of an English value — lets us tell a stale placeholder from a translation. */
function hashEn(value) {
  return crypto.createHash("sha1").update(String(value), "utf8").digest("hex").slice(0, 10);
}

/** en_hash for plural forms that only exist outside English (key_few, …): both English forms. */
function hashPluralGroup(en, base) {
  return hashEn(`${en[`${base}_one`] ?? ""}\u0000${en[`${base}_other`] ?? ""}`);
}

/** Base of a locale-only plural key ("chat.members_few" → "chat.members"), or null. */
function pluralExtraBase(key, en) {
  if (key in en) return null;
  const m = PLURAL_SUFFIX.exec(key);
  return m && `${m[1]}_other` in en ? m[1] : null;
}

/** Hash a translation record should carry for `key` given the current English. */
function currentEnHash(key, en) {
  if (key in en) return hashEn(en[key]);
  const base = pluralExtraBase(key, en);
  return base ? hashPluralGroup(en, base) : null;
}

/** A translation record whose English has changed since it was translated. */
function isStale(key, entry, en) {
  return !!entry && entry.status === TRANSLATED && entry.en_hash !== currentEnHash(key, en);
}

/**
 * True when a key may legitimately be identical to English in `locale`:
 * no letters once {{placeholders}} are removed (emoji, "·", "{{km}}"), an allowlisted value
 * (brand names, "OK"), an allowlisted key, or a per-locale allowlisted key.
 */
function isAllowlisted(key, enValue, locale, allowlist = {}) {
  const text = String(enValue ?? "");
  const withoutVars = text.replace(/\{\{[^}]*\}\}/g, "");
  if (!/\p{L}/u.test(withoutVars)) return true;
  if ((allowlist.values ?? []).includes(text.trim())) return true;
  if ((allowlist.keys ?? []).includes(key)) return true;
  if ((allowlist.locales?.[locale] ?? []).includes(key)) return true;
  return false;
}

/** Status entry says the locale still holds exactly the English it was given as a placeholder. */
function isRecordedPlaceholder(value, entry) {
  return !!entry && entry.status === NEEDS_TRANSLATION && hashEn(value) === entry.en_hash;
}

/** A translation record saying "this English is correct as is in this language" (e.g. "Premium"). */
function isConfirmedSameAsEn(enValue, entry) {
  return !!entry && entry.status === TRANSLATED && entry.same_as_en === true && entry.en_hash === hashEn(enValue);
}

function isCovered({ key, enValue, value, locale, allowlist, statusEntry }) {
  if (typeof value !== "string" || value.trim() === "") return false;
  if (isAllowlisted(key, enValue, locale, allowlist)) return true;
  if (value === enValue) {
    // Identical to English only counts when a translator said so for this exact English.
    return isConfirmedSameAsEn(enValue, statusEntry);
  }
  return !isRecordedPlaceholder(value, statusEntry);
}

/**
 * Coverage of one locale against English.
 * @returns {{ locale: string, total: number, covered: number, percent: number, uncovered: string[] }}
 *   percent is floored to an integer so config thresholds stay whole numbers.
 */
function computeCoverage({ en, loc, locale, allowlist = {}, status = {} }) {
  const keys = Object.keys(en);
  const localeStatus = status[locale] ?? {};
  const uncovered = keys.filter(
    (key) =>
      !isCovered({ key, enValue: en[key], value: loc[key], locale, allowlist, statusEntry: localeStatus[key] })
  );
  const covered = keys.length - uncovered.length;
  const percent = keys.length ? Math.floor((covered * 100) / keys.length) : 100;
  return { locale, total: keys.length, covered, percent, uncovered };
}

/**
 * Add missing keys to one locale and reconcile its status records.
 *  - missing key → patch translation if there is one, else English (recorded as placeholder)
 *  - existing value identical to English (and not allowlisted, not confirmed) → placeholder record
 *  - recorded placeholder whose English has since changed → refreshed to the new English
 *  - real translation with a translation record → record kept as is (a stale en_hash is how
 *    translate-i18n finds translations to redo)
 *  - real translation without a record (hand-edited, from a patch, or pre-pipeline) → backfilled
 *    as { status: "translated", method: "legacy", reviewed: false } against the current English
 *  - plural extras (key_few, …) present in the locale → record kept, or backfilled as legacy
 *  - records for keys no longer in en.json → dropped
 *
 * @returns {{ loc: Record<string, string>, status: Record<string, object>, added: string[], refreshed: string[] }}
 *   new objects; inputs are not mutated.
 */
function syncLocale({ en, loc, locale, patch = {}, allowlist = {}, status = {} }) {
  const nextLoc = { ...loc };
  const nextStatus = {};
  const added = [];
  const refreshed = [];

  for (const key of Object.keys(en)) {
    const enValue = en[key];
    const prev = status[key];

    if (!(key in nextLoc)) {
      nextLoc[key] = patch[key] ?? enValue;
      added.push(key);
    } else if (isRecordedPlaceholder(nextLoc[key], prev) && nextLoc[key] !== enValue) {
      nextLoc[key] = patch[key] ?? enValue;
      refreshed.push(key);
    }

    const value = nextLoc[key];
    const translated = prev?.status === TRANSLATED;
    if (isAllowlisted(key, enValue, locale, allowlist)) {
      if (translated) nextStatus[key] = prev;
    } else if (value === enValue) {
      nextStatus[key] = isConfirmedSameAsEn(enValue, prev) ? prev : { status: NEEDS_TRANSLATION, en_hash: hashEn(value) };
    } else if (typeof value === "string" && value.trim() !== "") {
      nextStatus[key] = translated ? prev : legacyRecord(hashEn(enValue));
    }
  }

  for (const key of Object.keys(nextLoc)) {
    const base = pluralExtraBase(key, en);
    if (!base) continue;
    const prev = status[key];
    nextStatus[key] = prev?.status === TRANSLATED ? prev : legacyRecord(hashPluralGroup(en, base));
  }

  return { loc: nextLoc, status: nextStatus, added, refreshed };
}

function legacyRecord(enHash) {
  return { status: TRANSLATED, method: "legacy", reviewed: false, en_hash: enHash };
}

/** Deterministic key order so diffs stay small. */
function sortObject(obj) {
  return Object.fromEntries(
    Object.keys(obj)
      .sort()
      .map((k) => [k, obj[k]])
  );
}

/**
 * translation-status.json is ~one line per placeholder (thousands of them), so write
 * each entry on its own line instead of pretty-printing 4 lines per entry.
 */
function serializeStatus(status, readme) {
  const locales = Object.keys(status).filter((l) => !l.startsWith("_")).sort();
  const lines = ["{", `  "_readme": ${JSON.stringify(readme)}${locales.length ? "," : ""}`];
  locales.forEach((locale, li) => {
    const entries = Object.keys(status[locale]).sort();
    const tail = li === locales.length - 1 ? "" : ",";
    if (!entries.length) {
      lines.push(`  ${JSON.stringify(locale)}: {}${tail}`);
      return;
    }
    lines.push(`  ${JSON.stringify(locale)}: {`);
    entries.forEach((key, ki) => {
      const comma = ki === entries.length - 1 ? "" : ",";
      lines.push(`    ${JSON.stringify(key)}: ${serializeEntry(status[locale][key])}${comma}`);
    });
    lines.push(`  }${tail}`);
  });
  lines.push("}");
  return `${lines.join("\n")}\n`;
}

const ENTRY_FIELDS = ["status", "method", "reviewed", "date", "en_hash", "same_as_en"];

/** One status entry on one line, fields in a fixed order. */
function serializeEntry(entry) {
  const keys = [...ENTRY_FIELDS.filter((k) => k in entry), ...Object.keys(entry).filter((k) => !ENTRY_FIELDS.includes(k))];
  return `{${keys.map((k) => `${JSON.stringify(k)}: ${JSON.stringify(entry[k])}`).join(", ")}}`;
}

module.exports = {
  NEEDS_TRANSLATION,
  TRANSLATED,
  PLURAL_SUFFIX,
  hashEn,
  hashPluralGroup,
  pluralExtraBase,
  currentEnHash,
  isStale,
  isRecordedPlaceholder,
  isAllowlisted,
  isCovered,
  computeCoverage,
  syncLocale,
  sortObject,
  serializeStatus,
};
