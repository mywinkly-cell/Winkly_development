#!/usr/bin/env node
/**
 * Link the Supabase CLI to winkly-production.
 * Usage: node scripts/supabase-link.mjs production
 */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const PRODUCTION_REF = "orjccytcmklzcfjgqwwj";

const target = process.argv[2];
if (target !== "production") {
  console.error("Usage: node scripts/supabase-link.mjs production");
  process.exit(1);
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
console.log(`Linking Supabase CLI to production (${PRODUCTION_REF})…`);
const r = spawnSync("npx", ["supabase", "link", "--project-ref", PRODUCTION_REF], {
  cwd: root,
  stdio: "inherit",
  shell: true,
});
process.exit(r.status ?? 1);
