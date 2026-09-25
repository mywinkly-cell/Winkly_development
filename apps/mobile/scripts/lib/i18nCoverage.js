/**
 * Pure helpers shared by sync-i18n-keys.mjs and audit-i18n.mjs (unit-tested in
 * __tests__/i18nCoverage.test.ts). No file I/O here.
 *
 * Terms:
 *  - placeholder: a locale value that is just the English text copied in by sync-i18n
 *    so the key exists. It is recorded in translation-status.json with the hash of the
 *    English it was copied from.
 *  - covered: the locale has a real translation — its value differs from English and is
 *    not a recorded placeholder, or the key is allowlisted (same in every language).
 */
const crypto = require("crypto");

const NEEDS_TRANSLATION = "needs_translation";

/** Short, stable hash of an English value — lets us tell a stale placeholder from a translation. */
function hashEn(value) {
  return crypto.createHash("sha1").update(String(value), "utf8").digest("hex").slice(0, 10);
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

function isCovered({ key, enValue, value, locale, allowlist, statusEntry }) {
  if (typeof value !== "string" || value.trim() === "") return false;
  if (isAllowlisted(key, enValue, locale, allowlist)) return true;
  if (value === enValue) return false;
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
 * Add missing keys to one locale and reconcile its placeholder records.
 *  - missing key → patch translation if there is one, else English (recorded as placeholder)
 *  - existing value identical to English (and not allowlisted) → recorded as placeholder
 *  - recorded placeholder whose English has since changed → refreshed to the new English
 *  - recorded placeholder that no longer matches its hash → someone translated it; record dropped
 *  - records for keys no longer in en.json → dropped
 *
 * @returns {{ loc: Record<string, string>, status: Record<string, { status: string, en_hash: string }>, added: string[], refreshed: string[] }}
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
    const stillPlaceholder = value === enValue || isRecordedPlaceholder(value, prev);
    if (stillPlaceholder && !isAllowlisted(key, enValue, locale, allowlist)) {
      nextStatus[key] = { status: NEEDS_TRANSLATION, en_hash: hashEn(value) };
    }
  }

  return { loc: nextLoc, status: nextStatus, added, refreshed };
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
      const e = status[locale][key];
      const comma = ki === entries.length - 1 ? "" : ",";
      lines.push(`    ${JSON.stringify(key)}: {"status": ${JSON.stringify(e.status)}, "en_hash": ${JSON.stringify(e.en_hash)}}${comma}`);
    });
    lines.push(`  }${tail}`);
  });
  lines.push("}");
  return `${lines.join("\n")}\n`;
}

module.exports = {
  NEEDS_TRANSLATION,
  hashEn,
  isAllowlisted,
  isRecordedPlaceholder,
  isCovered,
  computeCoverage,
  syncLocale,
  sortObject,
  serializeStatus,
};
