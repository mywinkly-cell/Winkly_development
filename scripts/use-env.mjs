#!/usr/bin/env node
/**
 * Select the active Winkly environment for local development.
 *
 * Copies apps/mobile/.env.<env> -> apps/mobile/.env so that Expo loads the
 * chosen Supabase backend.
 *
 * Usage (from repo root):
 *   npm run env:dev        → Winkly_development cloud (gwgjdpqskusuejlwrsnd)
 *   npm run env:local      → local `supabase start` stack
 *   npm run env:prod       → winkly-production cloud (orjccytcmklzcfjgqwwj)
 *
 * EAS/CI builds use EAS environment variables — not these files.
 */
import { copyFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const VALID = new Set(["development", "cloud-development", "production"]);

const ALIASES = {
  dev: "cloud-development",
  "cloud-dev": "cloud-development",
  cloud: "cloud-development",
  local: "development",
  prod: "production",
};

const arg = (process.argv[2] || "").toLowerCase();
const env = ALIASES[arg] ?? arg;

if (!VALID.has(env)) {
  console.error(
    `Unknown environment "${process.argv[2] ?? ""}".\n` +
      `Usage: node scripts/use-env.mjs <cloud-development|development|production>\n` +
      `Aliases: dev, cloud-dev, local, prod`
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
const labels = {
  "cloud-development": "Winkly_development cloud (gwgjdpqskusuejlwrsnd)",
  development: "local Supabase stack (supabase start)",
  production: "winkly-production cloud (orjccytcmklzcfjgqwwj)",
};
console.log(`Active environment: ${env} — ${labels[env]}`);
console.log(`  apps/mobile/.env.${env} → apps/mobile/.env`);
if (env === "production") {
  console.warn(
    "WARNING: PRODUCTION backend. Do not run experiments or untested migrations here."
  );
}
