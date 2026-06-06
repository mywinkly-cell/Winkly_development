#!/usr/bin/env node
/**
 * Link the Supabase CLI to staging or production.
 * Usage: node scripts/supabase-link.mjs staging|production
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
  console.error("Usage: node scripts/supabase-link.mjs <staging|production>");
  process.exit(1);
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ref = REFS[target];
console.log(`Linking Supabase CLI to ${target} (${ref})…`);
const r = spawnSync("npx", ["supabase", "link", "--project-ref", ref], {
  cwd: root,
  stdio: "inherit",
  shell: true,
});
process.exit(r.status ?? 1);
