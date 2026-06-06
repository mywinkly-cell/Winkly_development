#!/usr/bin/env node
/**
 * Link + push migrations to staging or production.
 * Usage: node scripts/supabase-push.mjs staging|production
 */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const REFS = {
  staging: "orjccytcmklzcfjgqwwj",
  production: "gwgjdpqskusuejlwrsnd",
};

const target = process.argv[2];
if (!target || !REFS[target]) {
  console.error("Usage: node scripts/supabase-push.mjs <staging|production>");
  process.exit(1);
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ref = REFS[target];

function run(cmd, args) {
  const r = spawnSync(cmd, args, { cwd: root, stdio: "inherit", shell: true });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

console.log(`→ ${target} (${ref})`);
run("npx", ["supabase", "link", "--project-ref", ref]);
run("npx", ["supabase", "db", "push", "--yes"]);
