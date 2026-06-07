#!/usr/bin/env node
/**
 * Compare locale JSON files against en.json — reports missing/extra keys.
 * Usage: node scripts/audit-i18n.mjs
 * Exit 1 if any non-en locale is missing keys.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const localesDir = path.join(__dirname, "..", "lib", "i18n", "locales");
const en = JSON.parse(fs.readFileSync(path.join(localesDir, "en.json"), "utf8"));
const enKeys = Object.keys(en).sort();

let failed = false;
const files = fs
  .readdirSync(localesDir)
  .filter((f) => f.endsWith(".json") && f !== "en.json" && !f.startsWith("_"));

console.log(`Reference: en.json (${enKeys.length} keys)\n`);

for (const file of files.sort()) {
  const loc = JSON.parse(fs.readFileSync(path.join(localesDir, file), "utf8"));
  const keys = Object.keys(loc);
  const missing = enKeys.filter((k) => !(k in loc));
  const extra = keys.filter((k) => !enKeys.includes(k));
  if (missing.length || extra.length) {
    failed = true;
    console.log(`${file}: missing ${missing.length}, extra ${extra.length}`);
    if (missing.length) console.log("  missing:", missing.slice(0, 8).join(", "), missing.length > 8 ? "…" : "");
    if (extra.length) console.log("  extra:", extra.slice(0, 8).join(", "), extra.length > 8 ? "…" : "");
  }
}

if (!failed) {
  console.log("All locales match en.json key set.");
  process.exit(0);
}
console.error("\nAudit failed — add missing keys to locale files.");
process.exit(1);
