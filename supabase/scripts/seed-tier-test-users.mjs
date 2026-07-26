#!/usr/bin/env node
/**
 * Seed four test accounts, one per subscription tier, so every AI gating path can be
 * exercised side by side without mutating a single account back and forth.
 *
 * Why separate accounts rather than flipping one:
 *   - The free daily plan quota is counted from `ai_requests` by user_id, so flipping
 *     tiers on one account pollutes that count and produces confusing quota behaviour.
 *   - `trial_ends_at` is effectively single-use per user; once burned, re-testing the
 *     trial-expiry cliff needs a fresh account anyway.
 *
 * IMPORTANT — the trial trap:
 *   `handle_new_user()` grants every new signup a 3-day Premium trial, and
 *   `effectiveTierFromRow()` resolves paid → trial → free. So a freshly created account
 *   is NOT free, it is Premium for 3 days. This script explicitly expires the trial on
 *   the accounts that are meant to be Free/Super/Premium.
 *
 * Idempotent: re-run any time to reset all four accounts to their intended state.
 *
 * Usage (from repo root):
 *   export SUPABASE_URL="https://gwgjdpqskusuejlwrsnd.supabase.co"
 *   export SUPABASE_SERVICE_ROLE_KEY="<service_role key>"
 *   node supabase/scripts/seed-tier-test-users.mjs
 *
 * Never point this at production with real users. It refuses unless you pass
 * --i-know-this-is-production.
 */

const SUPABASE_URL = process.env.SUPABASE_URL?.replace(/\/$/, "");
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PROD_REF = "orjccytcmklzcfjgqwwj";
const TEST_PASSWORD = "TestPassword123!";

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

if (SUPABASE_URL.includes(PROD_REF) && !process.argv.includes("--i-know-this-is-production")) {
  console.error(
    `Refusing to run: ${SUPABASE_URL} looks like production.\n` +
      "Test accounts belong in dev. Re-run with --i-know-this-is-production if you really mean it."
  );
  process.exit(1);
}

const DAY = 86_400_000;
const iso = (ms) => new Date(Date.now() + ms).toISOString();

/**
 * Tier resolution reference (supabase/functions/ai-gateway/index.ts → effectiveTierFromRow):
 *   paid tier + (premium_until null OR in future) → that paid tier
 *   else trial_ends_at in future                  → premium
 *   else                                          → free
 */
const ACCOUNTS = [
  {
    email: "tier-free@winkly-test.local",
    label: "Free (trial expired)",
    patch: {
      subscription_tier: "free",
      premium_until: null,
      trial_started_at: iso(-10 * DAY),
      trial_ends_at: iso(-7 * DAY), // expired, otherwise this account reads as Premium
    },
    expect: "3 AI plans/day, no concierge, no chat topics, no match agent",
  },
  {
    email: "tier-super@winkly-test.local",
    label: "Super",
    patch: {
      subscription_tier: "super",
      premium_until: iso(365 * DAY),
      trial_started_at: iso(-10 * DAY),
      trial_ends_at: iso(-7 * DAY),
    },
    expect: "plans, event suggestions, chat topics, match agent — but NOT concierge",
  },
  {
    email: "tier-premium@winkly-test.local",
    label: "Premium",
    patch: {
      subscription_tier: "premium",
      premium_until: iso(365 * DAY),
      trial_started_at: iso(-10 * DAY),
      trial_ends_at: iso(-7 * DAY),
    },
    expect: "everything, including full concierge and match_bridge",
  },
  {
    email: "tier-trial@winkly-test.local",
    label: "Trial (3-day Premium, expires soon)",
    patch: {
      subscription_tier: "free",
      premium_until: null,
      trial_started_at: iso(-2 * DAY),
      trial_ends_at: iso(1 * DAY), // expires in ~24h — good for testing the cliff
    },
    expect: "Premium behaviour now; drops to Free in ~24h without any downgrade job",
  },
];

const authHeaders = {
  Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
  apikey: SERVICE_ROLE_KEY,
  "Content-Type": "application/json",
};

/**
 * Page through admin users to find one by email. The `filter` query param is not
 * consistently supported across GoTrue versions, so we page rather than rely on it.
 */
async function findUserByEmail(email) {
  const target = email.toLowerCase();
  for (let page = 1; page <= 20; page++) {
    const res = await fetch(
      `${SUPABASE_URL}/auth/v1/admin/users?page=${page}&per_page=200`,
      { headers: authHeaders }
    );
    if (!res.ok) return null;
    const body = await res.json().catch(() => ({}));
    const list = Array.isArray(body?.users) ? body.users : [];
    if (list.length === 0) return null;
    const hit = list.find((u) => String(u.email ?? "").toLowerCase() === target);
    if (hit) return hit;
    if (list.length < 200) return null; // last page
  }
  return null;
}

async function createUser(email) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({
      email,
      password: TEST_PASSWORD,
      email_confirm: true, // skip the verification mail for test accounts
    }),
  });
  if (res.ok) return res.json();

  // Already registered (race, or the lookup above missed it) — recover rather than fail.
  const text = await res.text();
  if (res.status === 422 || /already/i.test(text)) {
    const existing = await findUserByEmail(email);
    if (existing) return existing;
  }
  throw new Error(`create ${email} failed: ${res.status} ${text}`);
}

async function patchTier(userId, patch) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/users?id=eq.${userId}`, {
    method: "PATCH",
    headers: { ...authHeaders, Prefer: "return=representation" },
    body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() }),
  });
  if (!res.ok) {
    throw new Error(`patch ${userId} failed: ${res.status} ${await res.text()}`);
  }
  const rows = await res.json().catch(() => []);
  return Array.isArray(rows) ? rows[0] : null;
}

async function main() {
  console.log(`Seeding tier test accounts on ${SUPABASE_URL}\n`);

  for (const acct of ACCOUNTS) {
    let user = await findUserByEmail(acct.email);
    const existed = !!user;
    if (!user) user = await createUser(acct.email);

    // handle_new_user() fires on auth.users INSERT and creates the public.users row,
    // but the trigger is async relative to this call — retry briefly if it's not there.
    let row = null;
    for (let attempt = 0; attempt < 5 && !row; attempt++) {
      try {
        row = await patchTier(user.id, acct.patch);
      } catch {
        await new Promise((r) => setTimeout(r, 400));
      }
    }
    if (!row) {
      console.error(`  ✗ ${acct.email} — public.users row never appeared; is handle_new_user() installed?`);
      continue;
    }

    console.log(`  ✓ ${acct.label}`);
    console.log(`      ${acct.email}  (${existed ? "updated" : "created"})`);
    console.log(`      expect: ${acct.expect}\n`);
  }

  console.log(`Password for all four: ${TEST_PASSWORD}`);
  console.log(
    "\nNote: if this project has Upstash configured, the gateway caches tier for 300s.\n" +
      "Either wait it out or delete the tier:<user-id> keys before testing."
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
