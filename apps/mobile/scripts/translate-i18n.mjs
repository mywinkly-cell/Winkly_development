#!/usr/bin/env node
/**
 * npm run translate-i18n — fill English placeholders (and missing plural forms) in every locale
 * with real translations from Claude, then re-run sync so translation-status.json is current.
 *
 *   npm run translate-i18n                       # all locales
 *   npm run translate-i18n -- --locales de,fi    # only these
 *   npm run translate-i18n -- --dry-run          # show what would be translated, no API calls
 *   npm run translate-i18n -- --limit 50         # at most 50 strings per locale (trial run)
 *
 * Credentials: whatever the Anthropic SDK resolves (ANTHROPIC_API_KEY, ANTHROPIC_AUTH_TOKEN, or an
 * `ant auth login` profile). Model: claude-opus-5 (override with --model or TRANSLATE_I18N_MODEL).
 * Every translation must keep the English {{placeholders}} and tags or it is dropped and reported.
 * See docs/I18N.md.
 */
import fs from "fs";
import path from "path";
import { execFileSync } from "child_process";
import { fileURLToPath } from "url";
import Anthropic from "@anthropic-ai/sdk";
import coverage from "./lib/i18nCoverage.js";
import tr from "./lib/translateI18n.js";

const { sortObject } = coverage;
const { LANGUAGE_NAMES, buildJobs, chunk, describeJob, acceptTranslations } = tr;

const here = path.dirname(fileURLToPath(import.meta.url));
const i18nDir = path.join(here, "..", "lib", "i18n");
const localesDir = path.join(i18nDir, "locales");
const statusPath = path.join(i18nDir, "translation-status.json");

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const dryRun = args.includes("--dry-run");
const limit = Number(flag("limit") ?? Infinity);
const model = flag("model") ?? process.env.TRANSLATE_I18N_MODEL ?? "claude-opus-5";
const batchSize = Number(flag("batch") ?? 60);
const concurrency = Number(flag("concurrency") ?? 3);

const en = JSON.parse(fs.readFileSync(path.join(localesDir, "en.json"), "utf8"));
const status = JSON.parse(fs.readFileSync(statusPath, "utf8"));
const allLocales = fs
  .readdirSync(localesDir)
  .filter((f) => f.endsWith(".json") && f !== "en.json" && !f.startsWith("_"))
  .map((f) => f.replace(".json", ""));
const locales = (flag("locales") ?? "").split(",").filter(Boolean);
const targets = locales.length ? allLocales.filter((l) => locales.includes(l)) : allLocales;

const SYSTEM = `You translate the user interface of Winkly, a mobile app: an AI planner for real-life plans and connections (dates, meet-ups with friends, business meetings, events). Never describe Winkly as a "dating app".

Rules for every string:
- Translate the meaning naturally for a native speaker, as the app's UI would say it — not word for word. Keep it about as short as the English; these are buttons, labels and short messages.
- Keep every {{placeholder}} and <tag> exactly as written — same names, same count. You may move them to fit the grammar.
- Keep brand names (Winkly, Winkly AI, Sparks, Premium, Super) and the "✦ • · → —" symbols as they are.
- Match the tone and form of address (informal/formal) shown in the examples from the existing translation.
- Where a line asks for a specific plural form, write that grammatical form for the count.
Return one item per numbered line, using its number as "i".`;

const OUTPUT_FORMAT = {
  type: "json_schema",
  schema: {
    type: "object",
    properties: {
      items: {
        type: "array",
        items: {
          type: "object",
          properties: { i: { type: "integer" }, text: { type: "string" } },
          required: ["i", "text"],
          additionalProperties: false,
        },
      },
    },
    required: ["items"],
    additionalProperties: false,
  },
};

/** A handful of existing real translations from the locale, so the model matches its voice. */
function styleExamples(loc, locale) {
  const out = [];
  for (const [key, value] of Object.entries(loc)) {
    if (out.length >= 12) break;
    const entry = status[locale]?.[key];
    if (entry || typeof en[key] !== "string" || value === en[key] || en[key].length > 80) continue;
    out.push(`${JSON.stringify(en[key])} → ${JSON.stringify(value)}`);
  }
  return out.join("\n");
}

const client = dryRun ? null : new Anthropic({ maxRetries: 4 });

async function translateBatch(locale, batch, examples) {
  const language = LANGUAGE_NAMES[locale] ?? locale;
  const response = await client.beta.messages.create({
    model,
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: SYSTEM,
    output_config: { format: OUTPUT_FORMAT },
    messages: [
      {
        role: "user",
        content: `Target language: ${language} (${locale}).\n\nExamples from the existing ${language} translation:\n${examples || "(none yet)"}\n\nTranslate:\n${batch
          .map(describeJob)
          .join("\n")}`,
      },
    ],
  });
  if (response.stop_reason === "refusal" || response.stop_reason === "max_tokens") {
    throw new Error(`stop_reason ${response.stop_reason}`);
  }
  const text = response.content.find((b) => b.type === "text")?.text ?? "{}";
  return acceptTranslations(batch, JSON.parse(text));
}

async function runLocale(locale) {
  const file = path.join(localesDir, `${locale}.json`);
  const loc = JSON.parse(fs.readFileSync(file, "utf8"));
  const jobs = buildJobs({ en, loc, locale, status: status[locale] ?? {} }).slice(0, limit);
  const plurals = jobs.filter((j) => j.plural).length;
  console.log(`${locale}: ${jobs.length} string(s) to translate (${plurals} plural form(s))`);
  if (dryRun || jobs.length === 0) return { locale, done: 0, rejected: [] };

  const examples = styleExamples(loc, locale);
  const batches = chunk(jobs, batchSize);
  const rejected = [];
  let done = 0;
  for (let i = 0; i < batches.length; i += concurrency) {
    const results = await Promise.allSettled(
      batches.slice(i, i + concurrency).map((b) => translateBatch(locale, b, examples))
    );
    results.forEach((r, k) => {
      if (r.status === "rejected") {
        batches[i + k].forEach((j) => rejected.push({ key: j.key, reason: String(r.reason?.message ?? r.reason) }));
        return;
      }
      for (const { key, value } of r.value.accepted) loc[key] = value;
      done += r.value.accepted.length;
      rejected.push(...r.value.rejected);
    });
    // Write after every round so an interrupted run keeps what it already paid for.
    fs.writeFileSync(file, `${JSON.stringify(sortObject(loc), null, 2)}\n`, "utf8");
    process.stdout.write(`  ${locale}: ${done}/${jobs.length}\r`);
  }
  console.log(`  ${locale}: ${done}/${jobs.length} translated, ${rejected.length} skipped`);
  return { locale, done, rejected };
}

const results = [];
for (const locale of targets) results.push(await runLocale(locale));

const skipped = results.flatMap((r) => r.rejected.map((x) => `${r.locale} ${x.key}: ${x.reason}`));
if (skipped.length) {
  console.log(`\nSkipped (kept English, will be retried next run):\n  ${skipped.slice(0, 40).join("\n  ")}`);
  if (skipped.length > 40) console.log(`  … and ${skipped.length - 40} more`);
}

if (!dryRun) {
  // sync-i18n drops translated keys from translation-status.json.
  execFileSync(process.execPath, [path.join(here, "sync-i18n-keys.mjs")], { stdio: "inherit" });
  console.log("\nNext: npm run audit-i18n, then review the diff (spot-check a few strings per language).");
}
