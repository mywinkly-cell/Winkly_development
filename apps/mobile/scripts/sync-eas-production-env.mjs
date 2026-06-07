#!/usr/bin/env node
/**
 * Push EXPO_PUBLIC_* vars from a local env file to EAS (production + preview).
 * Usage: node scripts/sync-eas-production-env.mjs [--file .env] [--dry-run]
 *
 * Requires: eas login, eas project linked (app.config.js projectId).
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MOBILE_ROOT = path.resolve(__dirname, "..");

const KEYS = [
  "EXPO_PUBLIC_SUPABASE_URL",
  "EXPO_PUBLIC_SUPABASE_ANON_KEY",
  "EXPO_PUBLIC_AUTH_REDIRECT_URL",
  "EXPO_PUBLIC_EAS_PROJECT_ID",
  "EXPO_PUBLIC_POSTHOG_API_KEY",
  "EXPO_PUBLIC_POSTHOG_HOST",
  "EXPO_PUBLIC_SENTRY_DSN",
  "EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID",
  "EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID",
  "EXPO_PUBLIC_FACEBOOK_APP_ID",
];

const ENVIRONMENTS = ["production", "preview"];

function parseEnvFile(filePath) {
  const text = fs.readFileSync(filePath, "utf8");
  const out = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const fileArgIdx = args.indexOf("--file");
  const envFile = path.resolve(
    MOBILE_ROOT,
    fileArgIdx >= 0 ? args[fileArgIdx + 1] : ".env"
  );

  if (!fs.existsSync(envFile)) {
    console.error(`Env file not found: ${envFile}`);
    process.exit(1);
  }

  const parsed = parseEnvFile(envFile);

  // Default EAS project id from app.config.js constant when not in env file.
  if (!parsed.EXPO_PUBLIC_EAS_PROJECT_ID) {
    const configText = fs.readFileSync(path.join(MOBILE_ROOT, "app.config.js"), "utf8");
    const m = configText.match(/LINKED_EAS_PROJECT_ID\s*=\s*"([^"]+)"/);
    if (m) parsed.EXPO_PUBLIC_EAS_PROJECT_ID = m[1];
  }

  const required = [
    "EXPO_PUBLIC_SUPABASE_URL",
    "EXPO_PUBLIC_SUPABASE_ANON_KEY",
    "EXPO_PUBLIC_AUTH_REDIRECT_URL",
  ];
  const missing = required.filter((k) => !parsed[k]?.trim());
  if (missing.length) {
    console.error(`Missing required keys in ${envFile}: ${missing.join(", ")}`);
    process.exit(1);
  }

  const toSet = KEYS.filter((k) => parsed[k]?.trim());
  console.log(`Source: ${envFile}`);
  console.log(`EAS environments: ${ENVIRONMENTS.join(", ")}`);
  console.log(`Variables: ${toSet.join(", ")}`);
  if (dryRun) {
    console.log("Dry run — no changes written.");
    return;
  }

  for (const name of toSet) {
    const value = parsed[name].trim();
    const visibility = name.startsWith("EXPO_PUBLIC_") ? "sensitive" : "secret";

    for (const environment of ENVIRONMENTS) {
      const result = spawnSync(
        "npx",
        [
          "eas-cli",
          "env:create",
          environment,
          "--name",
          name,
          "--value",
          value,
          "--visibility",
          visibility,
          "--force",
          "--non-interactive",
        ],
        { cwd: MOBILE_ROOT, stdio: "inherit", shell: true }
      );
      if (result.status !== 0) {
        console.error(`Failed to set ${name} for ${environment}`);
        process.exit(result.status ?? 1);
      }
    }
  }

  console.log("\nDone. Verify: npx eas-cli env:list --environment production");
}

main();
