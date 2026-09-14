#!/usr/bin/env node
/**
 * Flags hardcoded colors / font sizes / font families that should come from
 * the design system instead (see docs/DESIGN_SYSTEM.md and
 * constants/design-system/). Mirrors the audit-a11y pattern: a checklist tool,
 * not a hard CI gate — but pass --changed in a pre-PR check to fail only on
 * NEW/edited files, so we can hold the line going forward without needing to
 * fix ~450 pre-existing hits across the app in one pass.
 *
 * Usage:
 *   node scripts/audit-design-tokens.mjs            # full-repo report (exit 0)
 *   node scripts/audit-design-tokens.mjs --changed  # only files changed vs. main (exit 1 on violations)
 */
import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const mobileRoot = path.join(__dirname, "..");

const SCAN_DIRS = ["app", "components"];

/** New-system files are allowed to define the raw values; everything else should consume tokens. */
const EXEMPT_PATHS = [
  "constants/design-system/",
  "constants/tokens.ts", // legacy token source — not yet migrated, tracked separately
  "components/ds/", // design-system primitives themselves define the values
];

const HEX_COLOR_RE = /#(?:[0-9a-fA-F]{3}){1,2}\b/g;
const FONT_SIZE_RE = /fontSize:\s*\d+/g;
const RAW_FONT_FAMILY_RE = /fontFamily:\s*["'](?!Poppins_|Archivo_|PublicSans_)[^"']+["']/g;

function isExempt(relPath) {
  return EXEMPT_PATHS.some((p) => relPath.startsWith(p));
}

function collectFiles(entry) {
  const abs = path.join(mobileRoot, entry);
  if (!fs.existsSync(abs)) return [];
  const stat = fs.statSync(abs);
  if (stat.isFile()) return entry.endsWith(".tsx") || entry.endsWith(".ts") ? [abs] : [];
  if (!stat.isDirectory()) return [];
  const out = [];
  for (const name of fs.readdirSync(abs)) {
    if (name.startsWith(".")) continue;
    const child = path.join(abs, name);
    const rel = path.relative(mobileRoot, child).replace(/\\/g, "/");
    if (isExempt(rel + "/") || isExempt(rel)) continue;
    const childStat = fs.statSync(child);
    if (childStat.isDirectory()) out.push(...collectFiles(rel));
    else if (name.endsWith(".tsx") || name.endsWith(".ts")) out.push(child);
  }
  return out;
}

function findViolations(filePath) {
  const text = fs.readFileSync(filePath, "utf8");
  const lines = text.split("\n");
  const violations = [];

  lines.forEach((line, i) => {
    for (const re of [HEX_COLOR_RE, FONT_SIZE_RE, RAW_FONT_FAMILY_RE]) {
      re.lastIndex = 0;
      const match = re.exec(line);
      if (match) violations.push({ line: i + 1, snippet: line.trim().slice(0, 100) });
    }
  });
  return violations;
}

function getChangedFiles() {
  try {
    const base = execSync("git merge-base HEAD origin/main", { cwd: mobileRoot }).toString().trim();
    const out = execSync(`git diff --name-only --relative ${base} -- .`, { cwd: mobileRoot }).toString();
    return out
      .split("\n")
      .map((f) => f.trim())
      .filter((f) => f && (f.endsWith(".ts") || f.endsWith(".tsx")))
      .map((f) => path.join(mobileRoot, f))
      .filter((f) => fs.existsSync(f));
  } catch {
    console.warn("Could not compute changed files vs origin/main — falling back to full scan.");
    return null;
  }
}

const onlyChanged = process.argv.includes("--changed");
let files;
if (onlyChanged) {
  const changed = getChangedFiles();
  files = (changed ?? SCAN_DIRS.flatMap(collectFiles)).filter((f) => {
    const rel = path.relative(mobileRoot, f).replace(/\\/g, "/");
    return SCAN_DIRS.some((d) => rel.startsWith(d + "/")) && !isExempt(rel);
  });
} else {
  files = [...new Set(SCAN_DIRS.flatMap(collectFiles))].sort();
}

console.log(`Scanning ${files.length} file(s) for hardcoded colors/font sizes/font families${onlyChanged ? " (changed vs. main)" : ""}…\n`);

let totalViolations = 0;
for (const file of files) {
  const rel = path.relative(mobileRoot, file).replace(/\\/g, "/");
  const violations = findViolations(file);
  if (!violations.length) continue;
  totalViolations += violations.length;
  console.log(`${rel}:`);
  for (const v of violations) console.log(`  L${v.line}: ${v.snippet}`);
}

if (totalViolations === 0) {
  console.log("No hardcoded design values found.");
  process.exit(0);
}

console.log(`\n${totalViolations} violation(s) found. Use tokens from constants/design-system (see docs/DESIGN_SYSTEM.md) instead.`);
process.exit(onlyChanged ? 1 : 0);
