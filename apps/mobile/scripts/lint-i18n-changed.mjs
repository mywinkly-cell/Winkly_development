#!/usr/bin/env node
/**
 * Strict i18n lint for changed files: runs winkly/no-literal-string as an ERROR on every
 * apps/mobile .ts/.tsx file that differs from the base ref (repo-wide it's only a warning).
 * CI runs this on every PR/push so new hard-coded text can't land. See docs/I18N.md.
 *
 * Base ref, first match wins:
 *   --base <ref>  |  $I18N_LINT_BASE  |  origin/$GITHUB_BASE_REF  |  origin/main
 * Locally this also includes uncommitted and untracked files.
 *
 * Usage: npm run lint:i18n-changed [-- --base <ref>]
 */
import { execFileSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.join(__dirname, "..");
const RULE = "winkly/no-literal-string";
const ZERO_SHA = /^0+$/;

function git(...args) {
  return execFileSync("git", args, { cwd: appDir, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function refExists(ref) {
  try {
    git("rev-parse", "--verify", "--quiet", `${ref}^{commit}`);
    return true;
  } catch {
    return false;
  }
}

function resolveBase() {
  const argIdx = process.argv.indexOf("--base");
  const candidates = [
    argIdx !== -1 ? process.argv[argIdx + 1] : undefined,
    process.env.I18N_LINT_BASE,
    process.env.GITHUB_BASE_REF ? `origin/${process.env.GITHUB_BASE_REF}` : undefined,
    "origin/main",
  ].filter((ref) => ref && !ZERO_SHA.test(ref));
  for (const ref of candidates) {
    if (refExists(ref)) return ref;
    console.warn(`lint-i18n-changed: base "${ref}" not found, trying the next one.`);
  }
  // New branch pushed with no usable base (e.g. first push): fall back to the last commit.
  return refExists("HEAD~1") ? "HEAD~1" : null;
}

const base = resolveBase();
if (!base) {
  console.log("lint-i18n-changed: no base commit to diff against — nothing to check.");
  process.exit(0);
}

const repoRoot = git("rev-parse", "--show-toplevel");
const mergeBase = git("merge-base", base, "HEAD");
const changed = new Set([
  ...git("diff", "--name-only", "--diff-filter=ACMR", mergeBase).split("\n"),
  ...git("ls-files", "--others", "--exclude-standard", "--full-name").split("\n"),
]);

const files = [...changed]
  .filter((f) => /^apps\/mobile\/.+\.tsx?$/.test(f) && !f.endsWith(".d.ts"))
  .map((f) => path.join(repoRoot, f))
  .filter((f) => fs.existsSync(f));

if (!files.length) {
  console.log(`lint-i18n-changed: no app .ts/.tsx files changed since ${base}.`);
  process.exit(0);
}

// Must be set before ESLint loads eslint.config.js — it flips the rule from warn to error.
process.env.WINKLY_I18N_STRICT = "1";
const { ESLint } = await import("eslint");
const eslint = new ESLint({ cwd: appDir, ruleFilter: ({ ruleId }) => ruleId === RULE });

const lintable = [];
for (const f of files) if (!(await eslint.isPathIgnored(f))) lintable.push(f);

const results = await eslint.lintFiles(lintable);
const errorCount = results.reduce((n, r) => n + r.errorCount, 0);
const formatter = await eslint.loadFormatter("stylish");
const output = await formatter.format(results);
if (output) console.log(output);

console.log(`lint-i18n-changed: checked ${lintable.length} changed file(s) against ${base}.`);
if (errorCount) {
  console.error(
    "Hard-coded user-facing text in files this change touches. Move it to lib/i18n/locales/en.json and use t() — see docs/I18N.md."
  );
  process.exit(1);
}
