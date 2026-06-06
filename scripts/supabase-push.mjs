#!/usr/bin/env node
/**
 * Link + push migrations to winkly-production.
 * Usage: node scripts/supabase-push.mjs production
 */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const PRODUCTION_REF = "orjccytcmklzcfjgqwwj";

const target = process.argv[2];
if (target !== "production") {
  console.error("Usage: node scripts/supabase-push.mjs production");
  process.exit(1);
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function run(cmd, args) {
  const r = spawnSync(cmd, args, { cwd: root, stdio: "inherit", shell: true });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

console.log(`→ production (${PRODUCTION_REF})`);
run("npx", ["supabase", "link", "--project-ref", PRODUCTION_REF]);
run("npx", ["supabase", "db", "push", "--yes"]);
