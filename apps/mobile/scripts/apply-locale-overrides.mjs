#!/usr/bin/env node
/**
 * Apply native overrides from lib/i18n/patches/locale-overrides/{locale}.json
 * into lib/i18n/locales/{locale}.json (sorted keys).
 *
 * Usage: node scripts/apply-locale-overrides.mjs [locale]
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const localesDir = path.join(__dirname, "..", "lib", "i18n", "locales");
const overridesDir = path.join(__dirname, "..", "lib", "i18n", "patches", "locale-overrides");

const onlyLocale = process.argv[2];

if (!fs.existsSync(overridesDir)) {
  console.log("No locale-overrides directory.");
  process.exit(0);
}

const files = fs
  .readdirSync(overridesDir)
  .filter((f) => f.endsWith(".json") && (!onlyLocale || f === `${onlyLocale}.json`));

let updated = 0;
for (const file of files) {
  const locale = file.replace(".json", "");
  const localePath = path.join(localesDir, `${locale}.json`);
  if (!fs.existsSync(localePath)) {
    console.warn(`Skip ${file}: no ${locale}.json`);
    continue;
  }
  const overrides = JSON.parse(fs.readFileSync(path.join(overridesDir, file), "utf8"));
  const loc = JSON.parse(fs.readFileSync(localePath, "utf8"));
  let changed = false;
  for (const [key, value] of Object.entries(overrides)) {
    if (loc[key] !== value) {
      loc[key] = value;
      changed = true;
    }
  }
  if (changed) {
    const sorted = Object.fromEntries(Object.keys(loc).sort().map((k) => [k, loc[k]]));
    fs.writeFileSync(localePath, `${JSON.stringify(sorted, null, 2)}\n`, "utf8");
    updated++;
    console.log(`Applied overrides to ${locale}.json`);
  }
}

console.log(updated ? `\nUpdated ${updated} locale(s).` : "\nNo changes.");
