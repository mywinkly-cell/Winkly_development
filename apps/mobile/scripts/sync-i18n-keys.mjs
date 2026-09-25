#!/usr/bin/env node
/**
 * Merge missing locale keys from en.json, using per-locale patch translations when available.
 * Every English placeholder left in a locale is recorded in lib/i18n/translation-status.json
 * (locale → key → { status: "needs_translation", en_hash }) so the audit can tell it apart
 * from a real translation; translations are recorded as { status: "translated", … } (see
 * scripts/lib/i18nCoverage.js). See docs/I18N.md.
 * Usage: node scripts/sync-i18n-keys.mjs
 */
import coverage from "./lib/i18nCoverage.js";
import {
  listLocales,
  loadConfig,
  loadEn,
  loadLocale,
  loadMergedPatches,
  loadStatus,
  writeLocale,
  writeStatus,
} from "./lib/i18nFiles.mjs";

const { NEEDS_TRANSLATION, syncLocale } = coverage;

const config = loadConfig();
const en = loadEn();
const patches = loadMergedPatches();
const prevStatus = loadStatus();
const nextStatus = {};

let updated = 0;
for (const locale of listLocales()) {
  const result = syncLocale({
    en,
    loc: loadLocale(locale),
    locale,
    patch: patches[locale] ?? {},
    allowlist: config.allowlist,
    status: prevStatus[locale] ?? {},
  });
  nextStatus[locale] = result.status;

  if (result.added.length || result.refreshed.length) {
    writeLocale(locale, result.loc);
    updated += 1;
    const parts = [];
    if (result.added.length) parts.push(`${result.added.length} added`);
    if (result.refreshed.length) parts.push(`${result.refreshed.length} placeholder(s) refreshed to new English`);
    console.log(`Updated ${locale}.json: ${parts.join(", ")}`);
  }
}

const statusChanged = writeStatus(nextStatus);

const pending = Object.values(nextStatus).reduce(
  (n, s) => n + Object.values(s).filter((e) => e.status === NEEDS_TRANSLATION).length,
  0
);
console.log(updated ? `\nSynced ${updated} locale file(s).` : "\nAll locales already up to date.");
console.log(
  `${pending} placeholder(s) need translation — run \`npm run translate-i18n\` ` +
    `(lib/i18n/translation-status.json${statusChanged ? ", updated" : ""}).`
);
