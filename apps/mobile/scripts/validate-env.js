#!/usr/bin/env node
/**
 * Build-time environment variable validation for Winkly.
 *
 * Runs automatically before every EAS build via the `eas-build-pre-install`
 * npm hook, and can be run manually with `npm run validate-env`. It fails the
 * build LOUDLY (non-zero exit) when required EXPO_PUBLIC_* secrets are missing
 * or obviously invalid for staging/production — instead of shipping a broken
 * binary that crashes at user runtime in lib/supabase.ts.
 *
 * In `development` it only warns, so local `expo start` keeps working even
 * before a .env is fully populated.
 */

/* eslint-disable no-console */

const APP_ENV = process.env.APP_ENV || "development";
const isStrict = APP_ENV === "staging" || APP_ENV === "production";

const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const GREEN = "\x1b[32m";
const RESET = "\x1b[0m";

/** Placeholder values from the .env.*.example templates that must never ship. */
const PLACEHOLDER_PATTERNS = [
  /YOUR_.*_PROJECT_REF/i,
  /your_.*_key/i,
  /your-.*-key/i,
  /example\.supabase\.co/i,
  /changeme/i,
];

function isPlaceholder(value) {
  return PLACEHOLDER_PATTERNS.some((re) => re.test(value));
}

/**
 * Each rule: { key, required, validate?, hint }
 * `required: true` means it must be present (and valid) for a strict build.
 */
const RULES = [
  {
    key: "EXPO_PUBLIC_SUPABASE_URL",
    required: true,
    validate: (v) => /^https:\/\/.+\.supabase\.(co|in|net)\/?$/.test(v) || /^https?:\/\/(localhost|127\.0\.0\.1|10\.0\.2\.2)/.test(v),
    hint: "Must be your Supabase project URL, e.g. https://xxxx.supabase.co",
  },
  {
    key: "EXPO_PUBLIC_SUPABASE_ANON_KEY",
    required: true,
    // Supabase anon keys are JWTs (eyJ...) or the newer sb_publishable_ keys.
    validate: (v) => v.startsWith("eyJ") || v.startsWith("sb_publishable_"),
    hint: "Must be the Supabase anon/publishable key from Project Settings → API.",
  },
  {
    key: "EXPO_PUBLIC_AUTH_REDIRECT_URL",
    required: false,
    hint: "Recommended in production: the auth-redirect Edge Function URL.",
  },
  {
    key: "EXPO_PUBLIC_EAS_PROJECT_ID",
    required: false,
    validate: (v) =>
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v),
    hint: "Should be your Expo/EAS project UUID (needed for remote push).",
  },
];

const errors = [];
const warnings = [];

for (const rule of RULES) {
  // Dynamic lookup is intentional: this script validates a fixed RULES list.
  // eslint-disable-next-line expo/no-dynamic-env-var
  const raw = process.env[rule.key];
  const value = typeof raw === "string" ? raw.trim() : "";

  if (!value) {
    const msg = `${rule.key} is not set. ${rule.hint}`;
    if (rule.required && isStrict) errors.push(msg);
    else warnings.push(msg);
    continue;
  }

  if (isPlaceholder(value)) {
    const msg = `${rule.key} still contains a placeholder value ("${value}"). ${rule.hint}`;
    if (rule.required && isStrict) errors.push(msg);
    else warnings.push(msg);
    continue;
  }

  if (rule.validate && !rule.validate(value)) {
    const msg = `${rule.key} looks invalid. ${rule.hint}`;
    if (rule.required && isStrict) errors.push(msg);
    else warnings.push(msg);
  }
}

console.log(`\nWinkly env validation — APP_ENV=${APP_ENV} (${isStrict ? "strict" : "lenient"})`);

for (const w of warnings) console.warn(`${YELLOW}  ⚠ ${w}${RESET}`);

if (errors.length > 0) {
  for (const e of errors) console.error(`${RED}  ✖ ${e}${RESET}`);
  console.error(
    `\n${RED}Environment validation FAILED for APP_ENV=${APP_ENV}.${RESET}\n` +
      `Set the missing variables (EAS dashboard → Environment variables, or the build profile's "env" in eas.json) and rebuild.\n`
  );
  process.exit(1);
}

console.log(`${GREEN}  ✓ Environment looks good.${RESET}\n`);
