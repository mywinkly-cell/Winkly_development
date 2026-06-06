#!/usr/bin/env node
/**
 * Select the active Winkly environment for local development.
 *
 * Copies apps/mobile/.env.<env> -> apps/mobile/.env so that Expo (which loads
 * .env automatically) runs against the chosen environment.
 *
 * Usage (from repo root):
 *   node scripts/use-env.mjs development
 *   node scripts/use-env.mjs production
 *
 * Or via npm scripts: `npm run env:dev` | `npm run env:prod`.
 *
 * This is a LOCAL convenience only. For EAS/CI builds, env values come from
 * EAS environment variables / GitHub Actions secrets, not from these files.
 */
import { copyFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const VALID = new Set(["development", "production"]);

const arg = (process.argv[2] || "").toLowerCase();
const env =
  arg === "dev" ? "development" : arg === "prod" ? "production" : arg;

if (!VALID.has(env)) {
  console.error(
    `Unknown environment "${process.argv[2] ?? ""}".\n` +
      `Usage: node scripts/use-env.mjs <development|production>`
  );
  process.exit(1);
}

const here = dirname(fileURLToPath(import.meta.url));
const mobileDir = join(here, "..", "apps", "mobile");
const source = join(mobileDir, `.env.${env}`);
const target = join(mobileDir, ".env");

if (!existsSync(source)) {
  console.error(
    `Missing ${source}.\n` +
      `Create it by copying apps/mobile/.env.${env}.example and filling in values.`
  );
  process.exit(1);
}

copyFileSync(source, target);
console.log(`Active environment: ${env}  (apps/mobile/.env.${env} -> apps/mobile/.env)`);
if (env === "production") {
  console.warn(
    "WARNING: You selected PRODUCTION. This points at live user data. " +
      "Do not run experiments or untested migrations against it."
  );
}
