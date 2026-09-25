/**
 * Pure helpers for translate-i18n.mjs (unit-tested in __tests__/i18nTranslate.test.ts).
 * No file I/O or network here. See docs/I18N.md.
 *
 *  - what to translate per locale (placeholders, stale translations, missing plural forms)
 *  - CLDR plural categories and example numbers per language
 *  - validation of a translation against its English source ({{placeholders}}, <tags>,
 *    emoji, line breaks, never-translate terms)
 *  - length warnings for buttons / chips / tabs
 *  - review CSV export / import
 */
const crypto = require("crypto");
const {
  NEEDS_TRANSLATION,
  TRANSLATED,
  PLURAL_SUFFIX,
  hashEn,
  hashPluralGroup,
  isAllowlisted,
  isStale,
} = require("./i18nCoverage");

// ─── Tokens that must survive translation unchanged ────────────────────────────

const PLACEHOLDER = /\{\{\s*[^}]+?\s*\}\}/g;
/** <bold>, </bold>, <0/> — react-i18next <Trans> components. */
const TAG = /<\/?[A-Za-z0-9]+\s*\/?>/g;
const EMOJI = /\p{Extended_Pictographic}(?:\uFE0F|\u200D\p{Extended_Pictographic})*/gu;

const sorted = (list) => [...list].sort();
const normalizePlaceholder = (p) => p.replace(/\s+/g, "");

function placeholders(text) {
  return sorted((String(text).match(PLACEHOLDER) ?? []).map(normalizePlaceholder));
}
function tags(text) {
  return sorted(String(text).match(TAG) ?? []);
}
function emoji(text) {
  return sorted(String(text).match(EMOJI) ?? []);
}
function lineBreaks(text) {
  return (String(text).match(/\n/g) ?? []).length;
}

/** Items in `a` not matched one-for-one in `b` (multiset difference). */
function missingFrom(a, b) {
  const pool = [...b];
  const out = [];
  for (const x of a) {
    const i = pool.indexOf(x);
    if (i === -1) out.push(x);
    else pool.splice(i, 1);
  }
  return out;
}

const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Never-translate terms that appear (as whole words) in `source`. */
function doNotTranslateIn(source, terms = []) {
  return terms.filter((t) => new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegExp(t)}($|[^\\p{L}\\p{N}])`, "u").test(source));
}

/**
 * Problems with `translation` as a rendering of `source`. Empty array = valid.
 * Placeholders and tags must match exactly (none missing, none added); emoji and line breaks
 * must be kept; never-translate terms in the source must appear verbatim.
 */
function validateTranslation(source, translation, { doNotTranslate = [] } = {}) {
  const errors = [];
  if (typeof translation !== "string" || translation.trim() === "") return ["empty translation"];
  const check = (label, fn) => {
    const want = fn(source);
    const got = fn(translation);
    const missing = missingFrom(want, got);
    const added = missingFrom(got, want);
    if (missing.length) errors.push(`missing ${label}: ${missing.join(" ")}`);
    if (added.length) errors.push(`added ${label}: ${added.join(" ")}`);
  };
  check("placeholder", placeholders);
  check("tag", tags);
  check("emoji", emoji);
  if (lineBreaks(source) !== lineBreaks(translation)) {
    errors.push(`line breaks: expected ${lineBreaks(source)}, got ${lineBreaks(translation)}`);
  }
  for (const term of doNotTranslateIn(source, doNotTranslate)) {
    if (!translation.includes(term)) errors.push(`"${term}" must stay untranslated`);
  }
  return errors;
}

// ─── Length check ──────────────────────────────────────────────────────────────

/** A key segment naming a button, chip or tab: "button", "chips", "allTab", "deleteButton". */
const SHORT_UI_SEGMENT = /^(buttons?|chips?|tabs?)$|(Buttons?|Chips?|Tabs?)$/;
const LENGTH_RATIO = 1.5;

function isLengthChecked(key) {
  return key.split(".").some((segment) => SHORT_UI_SEGMENT.test(segment));
}

/** Warning text when a button/chip/tab translation is >150% of the English, else null. */
function lengthWarning(key, source, translation) {
  if (!isLengthChecked(key)) return null;
  const strip = (s) => String(s).replace(PLACEHOLDER, "").replace(TAG, "");
  const en = [...strip(source)].length;
  const tr = [...strip(translation)].length;
  if (en === 0 || tr <= en * LENGTH_RATIO) return null;
  return `${key}: ${tr} chars vs ${en} in English (${Math.round((tr * 100) / en)}%)`;
}

// ─── Plurals ───────────────────────────────────────────────────────────────────

const CATEGORY_ORDER = ["zero", "one", "two", "few", "many", "other"];

/** CLDR plural categories i18next will ask for in `locale` (it uses Intl.PluralRules too). */
function pluralCategories(locale) {
  try {
    const cats = new Intl.PluralRules(locale).resolvedOptions().pluralCategories;
    return CATEGORY_ORDER.filter((c) => cats.includes(c));
  } catch {
    return ["one", "other"];
  }
}

const CANDIDATE_NUMBERS = [
  ...Array.from({ length: 201 }, (_, i) => i),
  1000, 1000000, 0.5, 1.5, 2.5, 10.5,
];

/**
 * Example numbers per category for `locale`: { few: [2, 3, 4, 22, …], … }.
 * Decimals / millions only appear for categories integers never reach (cs "many" = 1.5).
 */
function pluralExamples(locale) {
  const rules = new Intl.PluralRules(locale);
  const out = {};
  for (const n of CANDIDATE_NUMBERS) {
    const cat = rules.select(n);
    out[cat] ??= [];
    if (out[cat].length < 6) out[cat].push(n);
  }
  return out;
}

/** True when `category` in `locale` is used for 1 and nothing else (so "One member" works). */
function isExactlyOne(locale, category) {
  const rules = new Intl.PluralRules(locale);
  return CANDIDATE_NUMBERS.every((n) => (rules.select(n) === category) === (n === 1));
}

/** English plural groups: [{ base, one, other }] for every key_other in en.json. */
function pluralGroups(en) {
  return Object.keys(en)
    .filter((k) => k.endsWith("_other"))
    .map((k) => k.slice(0, -"_other".length))
    .map((base) => ({ base, one: en[`${base}_one`] ?? en[`${base}_other`], other: en[`${base}_other`] }));
}

/**
 * English text a category is translated from. English _one only when it fits every number the
 * category covers — it may be "One member" (no {{count}}), which is wrong for Ukrainian 21 or
 * French 0; otherwise _other, so {{count}} is required in the translation.
 */
function pluralSource(locale, category, group) {
  if (category !== "one") return group.other;
  if (isExactlyOne(locale, "one")) return group.one;
  const same = missingFrom(placeholders(group.other), placeholders(group.one)).length === 0;
  return same ? group.one : group.other;
}

// ─── What to translate ─────────────────────────────────────────────────────────

/**
 * Work for one locale.
 *  - plain keys: recorded placeholders (needs_translation) and translations whose English changed
 *  - plural groups: every category the language needs (from en _one/_other), when any form is
 *    missing, a placeholder or stale
 * With `force`, every non-allowlisted key except human translations is redone.
 * `only` limits keys to a prefix.
 *
 * @returns {{ items: Array<{ key, source, previous?, reason, plural? }> }}
 */
function planLocale({ en, loc, locale, status = {}, allowlist = {}, force = false, only }) {
  const items = [];
  const groups = pluralGroups(en);
  const groupKeys = new Set(groups.flatMap((g) => [`${g.base}_one`, `${g.base}_other`]));
  const inScope = (key) => !only || key.startsWith(only);

  const reasonFor = (key, enValue) => {
    const entry = status[key];
    if (!(key in loc)) return "missing";
    if (entry?.status === NEEDS_TRANSLATION) return "untranslated";
    if (loc[key] === enValue && !(entry?.status === TRANSLATED && entry.same_as_en)) return "untranslated";
    if (isStale(key, entry, en)) return "english changed";
    if (force && entry?.method !== "human") return "forced";
    return null;
  };

  for (const key of Object.keys(en)) {
    if (groupKeys.has(key) || !inScope(key)) continue;
    if (isAllowlisted(key, en[key], locale, allowlist)) continue;
    const reason = reasonFor(key, en[key]);
    if (reason) items.push({ key, source: en[key], previous: previousFor(key, loc, en, status), reason });
  }

  const examples = pluralExamples(locale);
  for (const group of groups) {
    if (!inScope(group.base)) continue;
    const categories = pluralCategories(locale);
    const existing = {};
    const need = [];
    for (const cat of categories) {
      const key = `${group.base}_${cat}`;
      if (key in loc) existing[cat] = loc[key];
      const source = pluralSource(locale, cat, group);
      if (isAllowlisted(key, source, locale, allowlist)) continue;
      const reason = reasonFor(key, en[key] ?? source);
      if (reason) need.push({ cat, key, source, reason });
    }
    for (const n of need) {
      items.push({
        key: n.key,
        source: n.source,
        previous: previousFor(n.key, loc, en, status),
        reason: n.reason,
        plural: { base: group.base, category: n.cat, examples: examples[n.cat] ?? [], one: group.one, other: group.other, existing },
      });
    }
  }
  return { items };
}

/** The old translation when English changed — useful context for the translator. */
function previousFor(key, loc, en, status) {
  const entry = status[key];
  const value = loc[key];
  if (!entry || entry.status !== TRANSLATED || typeof value !== "string") return undefined;
  return value === en[key] ? undefined : value;
}

/** Hash stored with a new translation of `key`: its English, or both English plural forms. */
function enHashFor(key, en) {
  if (key in en) return hashEn(en[key]);
  const m = PLURAL_SUFFIX.exec(key);
  return m ? hashPluralGroup(en, m[1]) : hashEn("");
}

/** Translation record for `value`; flags a value identical to its English as confirmed. */
function translationRecord({ key, en, value, method, reviewed, date }) {
  const record = { status: TRANSLATED, method, reviewed, date, en_hash: enHashFor(key, en) };
  if (key in en && value === en[key]) record.same_as_en = true;
  return record;
}

/** Stable cache key for one translation request. */
function cacheKey(parts) {
  return crypto.createHash("sha1").update(JSON.stringify(parts), "utf8").digest("hex").slice(0, 16);
}

// ─── DeepL markup (see translationProviders.mjs) ───────────────────────────────

function escapeXml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function unescapeXml(s) {
  return s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
}

// A string, not a regex literal: it is concatenated with the names below, and Babel (Jest)
// rewrites \p{…} in literals so `.source` would no longer work with the "u" flag.
const PROTECT = String.raw`\{\{\s*[^}]+?\s*\}\}|<\/?[A-Za-z0-9]+\s*\/?>|\p{Extended_Pictographic}(?:\uFE0F|\u200D\p{Extended_Pictographic})*`;

function protectForDeepl(text, doNotTranslate = []) {
  const names = [...doNotTranslate].sort((a, b) => b.length - a.length).map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const re = new RegExp(`${PROTECT}${names.length ? `|${names.join("|")}` : ""}|\\n`, "gu");
  let out = "";
  let last = 0;
  for (const m of text.matchAll(re)) {
    out += escapeXml(text.slice(last, m.index));
    out += m[0] === "\n" ? "<lb/>" : `<x>${escapeXml(m[0])}</x>`;
    last = m.index + m[0].length;
  }
  return out + escapeXml(text.slice(last));
}

function restoreFromDeepl(xml) {
  return unescapeXml(xml.replace(/<lb\s*\/>/g, "\n").replace(/<x>(.*?)<\/x>/gs, "$1"));
}

/** Pick an example number for a plural category that the source text doesn't already contain. */
function sampleNumber(item) {
  return (item.plural.examples ?? []).find((n) => n !== 0 && !item.source.includes(String(n))) ?? item.plural.examples?.[0];
}

/** Put {{count}} back where DeepL left the sample number; null if it isn't there exactly once. */
function restoreCount(text, n) {
  const variants = new Set([String(n), String(n).replace(".", ","), n.toLocaleString("de-DE"), n.toLocaleString("fr-FR"), n.toLocaleString("en-US")]);
  for (const v of variants) {
    const parts = text.split(v);
    if (parts.length === 2) return parts.join("{{count}}");
  }
  return null;
}

// ─── Review CSV ────────────────────────────────────────────────────────────────

const CSV_COLUMNS = ["key", "english", "translation", "method", "reviewed", "note", "approve", "correction", "comment"];

function csvCell(value) {
  const s = value == null ? "" : String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(rows) {
  const lines = [CSV_COLUMNS.join(",")];
  for (const row of rows) lines.push(CSV_COLUMNS.map((c) => csvCell(row[c])).join(","));
  // BOM so Excel opens UTF-8 correctly.
  return `﻿${lines.join("\r\n")}\r\n`;
}

/** RFC 4180 parser (quoted fields, "" escapes, CRLF or LF). Returns objects keyed by header. */
function parseCsv(text) {
  const src = String(text).replace(/^﻿/, "");
  const records = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(cell);
      records.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    records.push(row);
  }
  const [header = [], ...body] = records.filter((r) => r.some((c) => c !== ""));
  return body.map((r) => Object.fromEntries(header.map((h, i) => [h.trim(), r[i] ?? ""])));
}

const APPROVED = /^(x|y|yes|ja|так|tak|oui|sí|si|1|true|ok|✓|✔)$/i;

/**
 * Rows for a native speaker: every translatable key (plural forms included) that is not yet
 * human-reviewed — or every key with `all`.
 */
function reviewRows({ en, loc, locale, status = {}, allowlist = {}, all = false }) {
  const rows = [];
  const push = (key, source) => {
    if (isAllowlisted(key, source, locale, allowlist)) return;
    const entry = status[key] ?? {};
    if (!all && entry.reviewed) return;
    const notes = [];
    if (entry.status === NEEDS_TRANSLATION) notes.push("not translated yet");
    if (isStale(key, entry, en)) notes.push("English changed since translation");
    const warn = lengthWarning(key, source, loc[key]);
    if (warn) notes.push("too long for a button/chip/tab");
    rows.push({
      key,
      english: source,
      translation: loc[key] ?? "",
      method: entry.method ?? (entry.status === NEEDS_TRANSLATION ? "english placeholder" : ""),
      reviewed: entry.reviewed ? "yes" : "",
      note: notes.join("; "),
    });
  };
  const groups = pluralGroups(en);
  const groupKeys = new Set(groups.flatMap((g) => [`${g.base}_one`, `${g.base}_other`]));
  for (const key of Object.keys(en)) if (!groupKeys.has(key)) push(key, en[key]);
  for (const g of groups) {
    for (const cat of pluralCategories(locale)) push(`${g.base}_${cat}`, pluralSource(locale, cat, g));
  }
  return rows;
}

/**
 * Apply a reviewed CSV to one locale.
 *  - `correction` filled → new value, { method: "human", reviewed: true }
 *  - `approve` = x / yes / 1 … → existing value kept, marked reviewed
 * Rows whose English no longer matches en.json are skipped (the English changed after export).
 * Corrections that break placeholders are rejected.
 *
 * @returns {{ loc, status, corrected: string[], approved: string[], skipped: Array<{ key, reason }> }}
 */
function applyReview({ rows, en, loc, locale, status = {}, date, doNotTranslate = [] }) {
  const nextLoc = { ...loc };
  const nextStatus = { ...status };
  const corrected = [];
  const approved = [];
  const skipped = [];
  const sources = {};
  for (const g of pluralGroups(en)) {
    for (const cat of pluralCategories(locale)) sources[`${g.base}_${cat}`] = pluralSource(locale, cat, g);
  }

  for (const row of rows) {
    const key = row.key?.trim();
    if (!key) continue;
    const source = sources[key] ?? en[key];
    if (source === undefined) {
      skipped.push({ key, reason: "key not in en.json" });
      continue;
    }
    if (row.english !== undefined && row.english !== source) {
      skipped.push({ key, reason: "English changed since export — re-export" });
      continue;
    }
    const correction = row.correction ?? "";
    if (correction.trim() !== "") {
      const errors = validateTranslation(source, correction, { doNotTranslate });
      if (errors.length) {
        skipped.push({ key, reason: errors.join("; ") });
        continue;
      }
      nextLoc[key] = correction;
      nextStatus[key] = translationRecord({ key, en, value: correction, method: "human", reviewed: true, date });
      corrected.push(key);
    } else if (APPROVED.test((row.approve ?? "").trim())) {
      if (!(key in nextLoc)) {
        skipped.push({ key, reason: "approved but no translation exists" });
        continue;
      }
      const prev = nextStatus[key];
      const method = prev?.status === TRANSLATED ? prev.method : "human";
      nextStatus[key] = translationRecord({ key, en, value: nextLoc[key], method, reviewed: true, date });
      approved.push(key);
    }
  }
  return { loc: nextLoc, status: nextStatus, corrected, approved, skipped };
}

module.exports = {
  protectForDeepl,
  restoreFromDeepl,
  restoreCount,
  sampleNumber,
  placeholders,
  tags,
  emoji,
  validateTranslation,
  doNotTranslateIn,
  isLengthChecked,
  lengthWarning,
  pluralCategories,
  pluralExamples,
  isExactlyOne,
  pluralGroups,
  pluralSource,
  planLocale,
  translationRecord,
  enHashFor,
  cacheKey,
  toCsv,
  parseCsv,
  reviewRows,
  applyReview,
};
