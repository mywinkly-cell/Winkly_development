#!/usr/bin/env node
/**
 * i18n audit (docs/I18N.md):
 *  1. key parity — every locale has exactly en.json's keys
 *  2. real translation coverage per language — a key counts only if its value differs from
 *     English and isn't a recorded placeholder (translation-status.json), or it's allowlisted
 *  3. hard-coded strings left in the app (the winkly/no-literal-string lint rule)
 *
 * Exit 1 on missing/extra keys, or when a tier-1 language is below its minCoverage in
 * lib/i18n/coverage-config.json.
 *
 * Usage: node scripts/audit-i18n.mjs [--no-lint]   (--no-lint skips step 3, ~15s)
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import coverage from "./lib/i18nCoverage.js";

const { computeCoverage, isStale, NEEDS_TRANSLATION, TRANSLATED } = coverage;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.join(__dirname, "..");
const i18nDir = path.join(appDir, "lib", "i18n");
const localesDir = path.join(i18nDir, "locales");
const statusPath = path.join(i18nDir, "translation-status.json");
const config = JSON.parse(fs.readFileSync(path.join(i18nDir, "coverage-config.json"), "utf8"));
const en = JSON.parse(fs.readFileSync(path.join(localesDir, "en.json"), "utf8"));
const status = fs.existsSync(statusPath) ? JSON.parse(fs.readFileSync(statusPath, "utf8")) : {};
const enKeys = Object.keys(en);
const enKeySet = new Set(enKeys);
const tier1 = new Set(config.tier1);
const skipLint = process.argv.includes("--no-lint");

let failed = false;
const files = fs
  .readdirSync(localesDir)
  .filter((f) => f.endsWith(".json") && f !== "en.json" && !f.startsWith("_"))
  .sort();

console.log(`Reference: en.json (${enKeys.length} keys)\n`);

// 1. Key parity
let parityOk = true;
const locales = {};
for (const file of files) {
  const locale = file.replace(".json", "");
  const loc = JSON.parse(fs.readFileSync(path.join(localesDir, file), "utf8"));
  locales[locale] = loc;
  const missing = enKeys.filter((k) => !(k in loc));
  // Languages with more plural forms than English (pl: _few/_many) may add them to a pluralised key.
  const extra = Object.keys(loc).filter((k) => {
    if (enKeySet.has(k)) return false;
    const plural = k.match(/^(.+)_(zero|one|two|few|many|other)$/);
    return !(plural && enKeySet.has(`${plural[1]}_other`));
  });
  if (missing.length || extra.length) {
    parityOk = false;
    failed = true;
    console.log(`${file}: missing ${missing.length}, extra ${extra.length}`);
    if (missing.length) console.log("  missing:", missing.slice(0, 8).join(", "), missing.length > 8 ? "…" : "");
    if (extra.length) console.log("  extra:", extra.slice(0, 8).join(", "), extra.length > 8 ? "…" : "");
  }
}
console.log(parityOk ? "Key parity: all locales match en.json.\n" : "\nKey parity failed — run `npm run sync-i18n`.\n");

// 2. Coverage
const rows = Object.entries(locales).map(([locale, loc]) => ({
  ...computeCoverage({ en, loc, locale, allowlist: config.allowlist, status }),
  tier: tier1.has(locale) ? 1 : 2,
  min: config.minCoverage?.[locale],
}));
rows.sort((a, b) => a.tier - b.tier || b.percent - a.percent || a.locale.localeCompare(b.locale));

const below = [];
console.log("Translation coverage (translated / keys):");
console.log("  lang  tier  coverage          min   ");
for (const r of rows) {
  const belowMin = r.tier === 1 && typeof r.min === "number" && (r.covered * 100) / r.total < r.min;
  if (belowMin) below.push(r);
  const bar = "█".repeat(Math.round(r.percent / 10)).padEnd(10, "·");
  const min = typeof r.min === "number" ? `${r.min}%` : "–";
  console.log(
    `  ${r.locale.padEnd(4)}  ${String(r.tier).padEnd(4)}  ${`${r.percent}%`.padStart(4)} ${bar} ${`${r.covered}/${r.total}`.padStart(8)}  ${min.padEnd(4)} ${belowMin ? "✗ below min" : ""}`
  );
}
const records = Object.entries(status)
  .filter(([k]) => !k.startsWith("_"))
  .flatMap(([, s]) => Object.entries(s));
const count = (fn) => records.filter(([key, e]) => fn(e, key)).length;
const pending = count((e) => e.status === NEEDS_TRANSLATION);
const machine = count((e) => e.status === TRANSLATED && e.method === "machine" && !e.reviewed);
const legacy = count((e) => e.status === TRANSLATED && e.method === "legacy" && !e.reviewed);
const reviewed = count((e) => e.status === TRANSLATED && e.reviewed);
const stale = count((e, key) => isStale(key, e, en));
console.log(`\n${pending} English placeholder(s), ${stale} stale translation(s) (English changed) — \`npm run translate-i18n\` fixes both.`);
console.log(`Review: ${reviewed} reviewed, ${machine} machine and ${legacy} legacy translation(s) not yet reviewed (docs/I18N.md).`);

if (below.length) {
  failed = true;
  console.error(
    `\nTier-1 coverage below minimum: ${below.map((r) => `${r.locale} ${r.percent}% < ${r.min}%`).join(", ")}` +
      "\nTranslate the keys (see docs/I18N.md) — don't lower the threshold."
  );
}

// 3. Hard-coded strings left in the app
if (!skipLint) {
  const { ESLint } = await import("eslint");
  const eslint = new ESLint({ cwd: appDir, ruleFilter: ({ ruleId }) => ruleId === "winkly/no-literal-string" });
  const results = await eslint.lintFiles(["."]);
  const perFile = results
    .map((r) => ({
      file: path.relative(appDir, r.filePath).replace(/\\/g, "/"),
      count: r.messages.filter((m) => m.ruleId === "winkly/no-literal-string").length,
    }))
    .filter((r) => r.count > 0)
    .sort((a, b) => b.count - a.count);
  const total = perFile.reduce((n, r) => n + r.count, 0);
  console.log(`\nHard-coded user-facing strings (winkly/no-literal-string): ${total} in ${perFile.length} file(s)`);
  for (const r of perFile.slice(0, 10)) console.log(`  ${String(r.count).padStart(4)}  ${r.file}`);
  if (perFile.length > 10) console.log("  …");
}

if (failed) {
  console.error("\ni18n audit failed.");
  process.exit(1);
}
console.log("\ni18n audit passed.");
