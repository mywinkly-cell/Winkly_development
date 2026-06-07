#!/usr/bin/env node
/**
 * Link + push migrations to development or production cloud.
 * Usage: node scripts/supabase-push.mjs development|production [--dry-run]
 */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const REFS = {
  development: "gwgjdpqskusuejlwrsnd",
  production: "orjccytcmklzcfjgqwwj",
};

const args = process.argv.slice(2);
const target = args[0];
const dryRun = args.includes("--dry-run");

if (!target || !REFS[target]) {
  console.error("Usage: node scripts/supabase-push.mjs <development|production> [--dry-run]");
  process.exit(1);
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ref = REFS[target];

function run(cmd, runArgs) {
  const r = spawnSync(cmd, runArgs, { cwd: root, stdio: "inherit", shell: true });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

console.log(`→ ${target} (${ref})${dryRun ? " [dry-run]" : ""}`);
run("npx", ["supabase", "link", "--project-ref", ref]);
const pushArgs = ["supabase", "db", "push", "--linked"];
if (dryRun) pushArgs.push("--dry-run");
else pushArgs.push("--yes");
run("npx", pushArgs);
