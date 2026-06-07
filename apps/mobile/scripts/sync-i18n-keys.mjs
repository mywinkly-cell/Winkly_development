#!/usr/bin/env node
/**
 * Merge missing locale keys from en.json, using per-locale patch translations when available.
 * Usage: node scripts/sync-i18n-keys.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const localesDir = path.join(__dirname, "..", "lib", "i18n", "locales");
const patchPath = path.join(__dirname, "..", "lib", "i18n", "patches", "auth-onboarding.json");

const en = JSON.parse(fs.readFileSync(path.join(localesDir, "en.json"), "utf8"));
const enKeys = Object.keys(en);
const patches = fs.existsSync(patchPath)
  ? JSON.parse(fs.readFileSync(patchPath, "utf8"))
  : {};

const files = fs
  .readdirSync(localesDir)
  .filter((f) => f.endsWith(".json") && f !== "en.json" && !f.startsWith("_"));

let updated = 0;
for (const file of files.sort()) {
  const locale = file.replace(".json", "");
  const filePath = path.join(localesDir, file);
  const loc = JSON.parse(fs.readFileSync(filePath, "utf8"));
  const patch = patches[locale] ?? {};
  let changed = false;

  for (const key of enKeys) {
    if (key in loc) continue;
    loc[key] = patch[key] ?? en[key];
    changed = true;
  }

  if (changed) {
    const sorted = Object.fromEntries(
      Object.keys(loc)
        .sort()
        .map((k) => [k, loc[k]])
    );
    fs.writeFileSync(filePath, `${JSON.stringify(sorted, null, 2)}\n`, "utf8");
    updated += 1;
    console.log(`Updated ${file}`);
  }
}

console.log(updated ? `\nSynced ${updated} locale file(s).` : "\nAll locales already up to date.");
