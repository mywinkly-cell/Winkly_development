#!/usr/bin/env node
/**
 * Promote Winkly_development → winkly-production.
 *
 * The two repos have unrelated histories (production started as a bare README),
 * so promotion is a force push: production becomes an exact mirror of your
 * development main. That is the intended model — production is a snapshot, not
 * a branch you commit to directly.
 *
 * Usage:
 *   node scripts/promote-to-production.mjs --dry-run   # show what would happen
 *   node scripts/promote-to-production.mjs             # promote (asks to confirm)
 *   node scripts/promote-to-production.mjs --yes       # promote without asking
 *
 * Or via npm:  npm run promote:dry-run  /  npm run promote
 *
 * Safety checks before anything is pushed:
 *   1. current branch is main
 *   2. working tree is clean (no uncommitted work)
 *   3. local main is in sync with origin (not ahead or behind)
 *   4. no real secret files are tracked
 *   5. explicit typed confirmation
 */

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import path from "node:path";

const PRODUCTION_REMOTE = "production";
const PRODUCTION_URL = "git@github.com:mywinkly-cell/winkly-production.git";
const BRANCH = "main";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const skipConfirm = args.includes("--yes");

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Run a git command and capture stdout. Returns null on failure. */
function git(gitArgs) {
  const r = spawnSync("git", gitArgs, { cwd: root, encoding: "utf8", shell: false });
  if (r.status !== 0) return null;
  return (r.stdout ?? "").trim();
}

/** Run a git command with output streamed; exit the process on failure. */
function gitLoud(gitArgs) {
  const r = spawnSync("git", gitArgs, { cwd: root, stdio: "inherit", shell: false });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

function fail(message, hint) {
  console.error(`\n✗ ${message}`);
  if (hint) console.error(`  ${hint}`);
  process.exit(1);
}

console.log(`\nPromote → winkly-production${dryRun ? "  [dry-run]" : ""}\n`);

// ── 1. Branch ────────────────────────────────────────────────────────────────
const branch = git(["rev-parse", "--abbrev-ref", "HEAD"]);
if (branch !== BRANCH) {
  fail(
    `You are on "${branch}", not "${BRANCH}".`,
    `Production mirrors ${BRANCH}. Switch with: git checkout ${BRANCH}`
  );
}

// ── 2. Clean working tree ────────────────────────────────────────────────────
// Promoting while dirty is how you ship something you never actually committed.
const dirty = git(["status", "--porcelain"]);
if (dirty) {
  const files = dirty.split("\n").slice(0, 10).join("\n    ");
  fail(
    "You have uncommitted changes.",
    `Commit or stash them first — production can only mirror committed work.\n\n    ${files}`
  );
}

// ── 3. In sync with origin ───────────────────────────────────────────────────
const fetched = git(["fetch", "origin", BRANCH, "--quiet"]);
if (fetched === null) {
  fail(
    `Could not fetch origin/${BRANCH}.`,
    "Check your network and that the origin remote exists."
  );
}
const behind = git(["rev-list", "--count", `${BRANCH}..origin/${BRANCH}`]);
const ahead = git(["rev-list", "--count", `origin/${BRANCH}..${BRANCH}`]);
if (behind === null || ahead === null) {
  fail(
    `Could not compare local ${BRANCH} to origin/${BRANCH}.`,
    `Does origin/${BRANCH} exist? Try: git fetch origin ${BRANCH}`
  );
}
if (behind !== "0") {
  fail(
    `Your local ${BRANCH} is ${behind} commit(s) behind origin.`,
    `Pull first: git pull origin ${BRANCH}`
  );
}
if (ahead !== "0") {
  fail(
    `Your local ${BRANCH} is ${ahead} commit(s) ahead of origin.`,
    `Push first so production mirrors what is on GitHub: git push origin ${BRANCH}`
  );
}

// ── 4. Secret scan ───────────────────────────────────────────────────────────
// A tracked .env would land in winkly-production permanently, and git history
// makes that very hard to undo — so refuse rather than warn.
const tracked = git(["ls-files"]) ?? "";

/** .env, .env.production, .env.local … but NOT .env.example / .env.*.example */
const ENV_FILE = /(^|\/)\.env(\.[^/]+)*$/;
const TEMPLATE = /\.(example|sample|template)$/;
const OTHER_SECRETS = [
  /google-service-account\.json$/,
  /\.(pem|p12|pfx|keystore|jks)$/,
];

const leaked = tracked.split("\n").filter((f) => {
  if (!f) return false;
  if (TEMPLATE.test(f)) return false; // templates carry no real values
  return ENV_FILE.test(f) || OTHER_SECRETS.some((re) => re.test(f));
});

if (leaked.length > 0) {
  fail(
    "Refusing to promote — these look like real secret files and are tracked in git:",
    leaked.join("\n    ")
  );
}

// ── 5. Remote ────────────────────────────────────────────────────────────────
const remotes = (git(["remote"]) ?? "").split("\n").filter(Boolean);
if (!remotes.includes(PRODUCTION_REMOTE)) {
  console.log(`Adding missing remote "${PRODUCTION_REMOTE}" → ${PRODUCTION_URL}`);
  if (!dryRun) gitLoud(["remote", "add", PRODUCTION_REMOTE, PRODUCTION_URL]);
}

// ── Summary ──────────────────────────────────────────────────────────────────
const head = git(["log", "-1", "--oneline"]);
const fileCount = tracked.split("\n").filter(Boolean).length;

console.log("  Source      Winkly_development / main");
console.log("  Target      winkly-production / main");
console.log(`  Commit      ${head}`);
console.log(`  Files       ${fileCount} tracked`);
console.log("  Method      force push (histories are unrelated by design)\n");

if (dryRun) {
  console.log("Dry run — nothing was pushed.");
  console.log(`Would run: git push ${PRODUCTION_REMOTE} ${BRANCH} --force\n`);
  process.exit(0);
}

// ── Confirm ──────────────────────────────────────────────────────────────────
if (!skipConfirm) {
  const rl = createInterface({ input: stdin, output: stdout });
  const answer = await rl.question('Type "promote" to overwrite production: ');
  rl.close();
  if (answer.trim().toLowerCase() !== "promote") {
    console.log("Cancelled.");
    process.exit(0);
  }
}

// ── Push ─────────────────────────────────────────────────────────────────────
console.log("");
gitLoud(["push", PRODUCTION_REMOTE, BRANCH, "--force"]);

console.log(`
✓ Production updated.

Next:
  • Vercel redeploys winkly-website automatically (it watches winkly-production/main).
    Check: Vercel → winkly-website → Deployments
  • Edge Functions and migrations are NOT promoted by this script.
    See docs/RUNBOOK_GO_LIVE.md §4.
`);
