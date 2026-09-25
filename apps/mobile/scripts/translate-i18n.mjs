#!/usr/bin/env node
/**
 * Machine-translate the app into every language and keep it in sync with English (docs/I18N.md).
 *
 * Per locale it translates:
 *  - keys still holding an English placeholder (status "needs_translation"),
 *  - translations whose English changed since (en_hash differs from en.json),
 *  - every CLDR plural form the language needs (key_few, key_many, …) from English _one/_other.
 * Each result is validated ({{placeholders}}, <tags>, emoji, line breaks, never-translate names
 * from lib/i18n/glossary.json) and recorded in translation-status.json as
 * { method: "machine", reviewed: false, date }. Results are cached in .cache/translate-i18n/.
 *
 * Usage (from apps/mobile, or the repo root via `npm run translate-i18n -- …`):
 *   npm run translate-i18n                          all locales
 *   npm run translate-i18n -- --locales de,fr       a subset
 *   npm run translate-i18n -- --dry-run             show what would be translated, no API calls
 *   npm run translate-i18n -- --check               validate placeholders / plurals / lengths only
 *   npm run translate-i18n -- --export-review de    i18n-review/de.csv for a native speaker
 *   npm run translate-i18n -- --import-review i18n-review/de.csv
 *
 * Options: --provider anthropic|deepl|mock (default: whichever key is set, anthropic first)
 *          --only <key prefix>  --limit <n per locale>  --force (redo all but human translations)
 *          --concurrency <n>  --no-cache  --all (export reviewed rows too)
 *
 * Keys: ANTHROPIC_API_KEY (model: WINKLY_TRANSLATE_MODEL, default claude-opus-5) or DEEPL_API_KEY,
 * from the shell or apps/mobile/.env.translate (git-ignored). Never commit keys.
 */
import fs from "fs";
import path from "path";
import coverage from "./lib/i18nCoverage.js";
import translate from "./lib/i18nTranslate.js";
import { createProvider, defaultProviderName } from "./lib/translationProviders.mjs";
import {
  appDir,
  listLocales,
  loadConfig,
  loadEn,
  loadEnvFile,
  loadGlossary,
  loadLocale,
  loadMergedPatches,
  loadStatus,
  writeLocale,
  writeStatus,
} from "./lib/i18nFiles.mjs";

const { syncLocale, computeCoverage, isStale, NEEDS_TRANSLATION } = coverage;
const {
  planLocale,
  validateTranslation,
  lengthWarning,
  translationRecord,
  cacheKey,
  pluralGroups,
  pluralCategories,
  pluralSource,
  toCsv,
  parseCsv,
  reviewRows,
  applyReview,
} = translate;

// ─── CLI ───────────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = { cache: true };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => {
      const v = argv[++i];
      if (v === undefined || v.startsWith("--")) throw new Error(`${a} needs a value`);
      return v;
    };
    if (a === "--locales" || a === "--locale") args.locales = next().split(",").map((s) => s.trim()).filter(Boolean);
    else if (a.startsWith("--locales=")) args.locales = a.slice(10).split(",").filter(Boolean);
    else if (a === "--provider") args.provider = next();
    else if (a === "--only") args.only = next();
    else if (a === "--limit") args.limit = Number(next());
    else if (a === "--concurrency") args.concurrency = Number(next());
    else if (a === "--batch") args.batch = Number(next());
    else if (a === "--export-review") args.exportReview = next().split(",").filter(Boolean);
    else if (a === "--import-review") args.importReview = next();
    else if (a === "--dry-run") args.dryRun = true;
    else if (a === "--check") args.check = true;
    else if (a === "--force") args.force = true;
    else if (a === "--all") args.all = true;
    else if (a === "--no-cache") args.cache = false;
    else if (a === "--help" || a === "-h") args.help = true;
    else throw new Error(`Unknown option ${a} (see --help)`);
  }
  return args;
}

const today = () => new Date().toISOString().slice(0, 10);

function resolveLocales(requested) {
  const all = listLocales();
  if (!requested?.length) return all;
  const unknown = requested.filter((l) => !all.includes(l));
  if (unknown.length) throw new Error(`Unknown locale(s): ${unknown.join(", ")} (have: ${all.join(", ")})`);
  return requested;
}

// ─── Cache ─────────────────────────────────────────────────────────────────────

const cacheDir = path.join(appDir, ".cache", "translate-i18n");

function openCache(locale, enabled) {
  const file = path.join(cacheDir, `${locale}.json`);
  const data = enabled && fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : {};
  return {
    get: (k) => (enabled ? data[k] : undefined),
    set: (k, v) => {
      data[k] = v;
    },
    save: () => {
      if (!enabled) return;
      fs.mkdirSync(cacheDir, { recursive: true });
      fs.writeFileSync(file, JSON.stringify(data), "utf8");
    },
  };
}

// ─── Translation ───────────────────────────────────────────────────────────────

async function mapLimit(list, limit, fn) {
  let next = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(limit, list.length)) }, async () => {
    while (next < list.length) {
      const i = next++;
      await fn(list[i], i);
    }
  });
  await Promise.all(workers);
}

function chunk(list, size) {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

/**
 * Translate plan items for one locale: cache first, then batched provider calls, one retry
 * round for rejected items (with the rejection reasons passed to the provider).
 * @returns {{ results: Record<key, string>, failures: Array<{ key, errors }> }}
 */
async function translateItems({ items, locale, provider, glossary, cache, concurrency, batchSize }) {
  const dnt = glossary.doNotTranslate ?? [];
  const results = {};
  const lastErrors = {};
  const keyOf = (it) =>
    cacheKey([provider.cacheId, glossary.version, locale, it.key, it.source, it.plural?.category ?? null, it.previous ?? null]);

  let pending = [];
  for (const it of items) {
    const cached = cache.get(keyOf(it));
    if (cached !== undefined && validateTranslation(it.source, cached, { doNotTranslate: dnt }).length === 0) {
      results[it.key] = cached;
    } else pending.push(it);
  }
  const fromCache = items.length - pending.length;
  if (fromCache) console.log(`  ${fromCache} from cache`);

  for (let round = 0; round < 2 && pending.length; round++) {
    const retryErrors = round === 0 ? {} : Object.fromEntries(pending.map((it) => [it.key, lastErrors[it.key]]));
    const failedThisRound = [];
    let done = 0;
    await mapLimit(chunk(pending, batchSize), concurrency, async (batch) => {
      const payload = batch.map((it) => ({ ...it, id: it.key }));
      let out = {};
      try {
        out = await provider.translate(payload, { locale, glossary, retryErrors });
      } catch (err) {
        for (const it of batch) lastErrors[it.key] = [`request failed: ${err.message}`];
      }
      for (const it of batch) {
        const text = out[it.key];
        if (text === undefined) {
          lastErrors[it.key] ??= ["no translation returned"];
          failedThisRound.push(it);
          continue;
        }
        const errors = validateTranslation(it.source, text, { doNotTranslate: dnt });
        if (errors.length) {
          lastErrors[it.key] = errors;
          failedThisRound.push(it);
        } else {
          results[it.key] = text;
          delete lastErrors[it.key];
          cache.set(keyOf(it), text);
        }
      }
      cache.save();
      done += batch.length;
      process.stdout.write(`  ${round ? "retry " : ""}${done}/${pending.length}\r`);
    });
    process.stdout.write("\n");
    pending = failedThisRound;
  }
  return { results, failures: pending.map((it) => ({ key: it.key, errors: lastErrors[it.key] ?? [] })) };
}

// ─── Modes ─────────────────────────────────────────────────────────────────────

async function runTranslate(args) {
  const config = loadConfig();
  const glossary = loadGlossary();
  const en = loadEn();
  const patches = loadMergedPatches();
  const status = loadStatus();
  const locales = resolveLocales(args.locales);

  let provider = null;
  if (!args.dryRun) {
    const name = args.provider ?? defaultProviderName();
    if (!name) {
      throw new Error(
        "No translation provider configured. Set ANTHROPIC_API_KEY or DEEPL_API_KEY (shell or apps/mobile/.env.translate), " +
          "or run with --dry-run to see what would be translated."
      );
    }
    provider = createProvider(name);
    console.log(`Provider: ${provider.cacheId}`);
  }

  const date = today();
  const summary = [];
  let failedTotal = 0;

  for (const locale of locales) {
    const synced = syncLocale({
      en,
      loc: loadLocale(locale),
      locale,
      patch: patches[locale] ?? {},
      allowlist: config.allowlist,
      status: status[locale] ?? {},
    });
    const loc = synced.loc;
    status[locale] = synced.status;

    let { items } = planLocale({ en, loc, locale, status: status[locale], allowlist: config.allowlist, force: args.force, only: args.only });
    if (args.limit > 0) items = items.slice(0, args.limit);
    const plural = items.filter((it) => it.plural).length;
    const stale = items.filter((it) => it.reason === "english changed").length;
    const chars = items.reduce((n, it) => n + it.source.length, 0);
    console.log(`\n${locale}: ${items.length} to translate (${plural} plural forms, ${stale} English changed) · ${chars} chars`);

    if (args.dryRun || !items.length) {
      summary.push({ locale, translated: 0, failed: 0, warnings: [] });
      if (!args.dryRun && (synced.added.length || synced.refreshed.length)) writeLocale(locale, loc);
      continue;
    }

    const { results, failures } = await translateItems({
      items,
      locale,
      provider,
      glossary,
      cache: openCache(locale, args.cache),
      concurrency: args.concurrency ?? (provider.name === "deepl" ? 2 : 4),
      batchSize: args.batch ?? provider.batchSize,
    });

    const warnings = [];
    for (const it of items) {
      const text = results[it.key];
      if (text === undefined) continue;
      loc[it.key] = text;
      status[locale][it.key] = translationRecord({ key: it.key, en, value: text, method: "machine", reviewed: false, date });
      const warn = lengthWarning(it.key, it.source, text);
      if (warn) warnings.push(warn);
    }
    writeLocale(locale, loc);
    writeStatus(status);

    console.log(`  ✓ ${Object.keys(results).length} translated${failures.length ? `, ✗ ${failures.length} failed` : ""}`);
    for (const f of failures.slice(0, 10)) console.log(`    ✗ ${f.key}: ${f.errors.join("; ")}`);
    if (failures.length > 10) console.log(`    … ${failures.length - 10} more`);
    for (const w of warnings) console.log(`    ⚠ too long: ${w}`);
    failedTotal += failures.length;
    summary.push({ locale, translated: Object.keys(results).length, failed: failures.length, warnings });
  }

  if (!args.dryRun) writeStatus(status);

  console.log("\nCoverage after this run:");
  for (const locale of locales) {
    const r = computeCoverage({ en, loc: loadLocale(locale), locale, allowlist: config.allowlist, status });
    const s = summary.find((x) => x.locale === locale);
    console.log(
      `  ${locale.padEnd(4)} ${`${r.percent}%`.padStart(4)}  ${`${r.covered}/${r.total}`.padStart(9)}` +
        (s?.translated ? `  +${s.translated}` : "") +
        (s?.failed ? `  ✗${s.failed}` : "") +
        (s?.warnings.length ? `  ⚠${s.warnings.length} long` : "")
    );
  }
  if (failedTotal) {
    console.error(`\n${failedTotal} translation(s) failed validation and were not written — re-run to retry.`);
    process.exitCode = 1;
  }
}

/** Validate existing translations: placeholders/tags (error), plural forms (error), the rest (warning). */
function runCheck(args) {
  const glossary = loadGlossary();
  const en = loadEn();
  const status = loadStatus();
  const dnt = glossary.doNotTranslate ?? [];
  const HARD = /^(missing|added) (placeholder|tag)/;
  let errorCount = 0;

  for (const locale of resolveLocales(args.locales)) {
    const loc = loadLocale(locale);
    const st = status[locale] ?? {};
    const errors = [];
    const warnings = [];
    const check = (key, source) => {
      const value = loc[key];
      if (value === undefined || st[key]?.status === NEEDS_TRANSLATION) return;
      for (const e of validateTranslation(source, value, { doNotTranslate: dnt })) {
        (HARD.test(e) ? errors : warnings).push(`${key}: ${e}`);
      }
      const warn = lengthWarning(key, source, value);
      if (warn) warnings.push(`too long: ${warn}`);
    };

    const groups = pluralGroups(en);
    const groupKeys = new Set(groups.flatMap((g) => [`${g.base}_one`, `${g.base}_other`]));
    for (const key of Object.keys(en)) if (!groupKeys.has(key)) check(key, en[key]);
    let missingPlural = 0;
    for (const g of groups) {
      for (const cat of pluralCategories(locale)) {
        const key = `${g.base}_${cat}`;
        if (!(key in loc)) {
          missingPlural++;
          continue;
        }
        check(key, pluralSource(locale, cat, g));
      }
    }
    if (missingPlural) errors.push(`${missingPlural} plural form(s) missing (${pluralCategories(locale).join("/")})`);
    const stale = Object.entries(st).filter(([k, e]) => isStale(k, e, en)).length;

    const line = `${locale.padEnd(4)} ${errors.length ? `✗ ${errors.length} error(s)` : "✓"}` +
      `${warnings.length ? `, ${warnings.length} warning(s)` : ""}${stale ? `, ${stale} stale` : ""}`;
    console.log(line);
    for (const e of errors.slice(0, 15)) console.log(`   ✗ ${e}`);
    if (errors.length > 15) console.log(`   … ${errors.length - 15} more`);
    if (args.all) for (const w of warnings) console.log(`   ⚠ ${w}`);
    errorCount += errors.length;
  }
  if (errorCount) {
    console.error("\nValidation failed. Missing plural forms: run `npm run translate-i18n`. Placeholder errors: fix the locale file.");
    process.exitCode = 1;
  } else console.log("\nAll translations validate.");
}

const reviewDir = path.join(appDir, "i18n-review");

function runExport(args) {
  const config = loadConfig();
  const en = loadEn();
  const status = loadStatus();
  fs.mkdirSync(reviewDir, { recursive: true });
  for (const locale of resolveLocales(args.exportReview)) {
    const rows = reviewRows({ en, loc: loadLocale(locale), locale, status: status[locale] ?? {}, allowlist: config.allowlist, all: args.all });
    const file = path.join(reviewDir, `${locale}.csv`);
    fs.writeFileSync(file, toCsv(rows), "utf8");
    console.log(`${path.relative(process.cwd(), file)}: ${rows.length} row(s) to review`);
  }
  console.log('\nReviewer: put x in "approve" when a translation is fine, or write the fix in "correction". See docs/I18N.md.');
}

function runImport(args) {
  const file = path.resolve(args.importReview);
  const locale = args.locales?.[0] ?? path.basename(file).replace(/\.csv$/i, "").split(/[._-]/)[0];
  resolveLocales([locale]);
  const en = loadEn();
  const status = loadStatus();
  const rows = parseCsv(fs.readFileSync(file, "utf8"));
  const r = applyReview({
    rows,
    en,
    loc: loadLocale(locale),
    locale,
    status: status[locale] ?? {},
    date: today(),
    doNotTranslate: loadGlossary().doNotTranslate,
  });
  writeLocale(locale, r.loc);
  status[locale] = r.status;
  writeStatus(status);
  console.log(`${locale}: ${r.corrected.length} corrected (human), ${r.approved.length} approved, ${r.skipped.length} skipped`);
  for (const s of r.skipped) console.log(`  skipped ${s.key}: ${s.reason}`);
  if (r.skipped.length) process.exitCode = 1;
}

// ─── Main ──────────────────────────────────────────────────────────────────────

try {
  loadEnvFile();
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    const src = fs.readFileSync(new URL(import.meta.url), "utf8");
    console.log(src.slice(src.indexOf("/**") + 3, src.indexOf("*/")).replace(/^ \* ?/gm, ""));
  } else if (args.exportReview) runExport(args);
  else if (args.importReview) runImport(args);
  else if (args.check) runCheck(args);
  else await runTranslate(args);
} catch (err) {
  console.error(`translate-i18n: ${err.message}`);
  process.exitCode = 1;
}
