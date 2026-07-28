# Winkly — Go-Live Runbook (manual steps)

**Created:** 25 July 2026
**Scope:** The steps that cannot be committed to the repo — they need Supabase credentials, dashboard access, or an external account.

Everything in this file is something a person has to run. Code-side fixes are already in the repo (see §0). Work top to bottom; each section is independently verifiable.

---

## 0. Already done in the repo — no action needed

| Change | File |
|---|---|
| Standalone dev APK build profile | `apps/mobile/eas.json` → `preview-dev` |
| Four tier test accounts, one per subscription level | `supabase/scripts/seed-tier-test-users.mjs` |
| Repealed statute references corrected (TMG → DDG) | `docs/IMPRINT.md`, `docs/PRODUCT_DOCUMENTATION.md`, `website/README.md`, `docs/GO_LIVE_ISSUES_PLAN.md` |
| Automated Edge Function deployment | `.github/workflows/deploy-functions.yml` |

> `website/dist/imprint/index.html` still shows the old § 5 TMG text. It is generated output — it regenerates correctly from `docs/IMPRINT.md` on the next `npm run website:build`. Don't hand-edit it.

---

## 1. Why the concierge was broken

Two unrelated failures that happened to look like one bug.

**Expo** loads `apps/mobile/.env` → the **dev** project, where `ai-gateway` is deployed. It reached the gateway and was rejected on tier: `TASK_MIN_TIER.concierge = "premium"` (`supabase/functions/ai-gateway/index.ts:156`) and the test account was Free. Result: **403 `ai_tier_required`**. Working as designed.

**The APK** was built with the `preview` or `production` profile → `APP_ENV=production` → `.env.production` → the **production** project, where no Edge Functions were ever deployed. Result: **404**. Every AI surface was dead, not just the concierge.

Separately, `CRON_SECRET` was missing on **both** projects, and both cron functions fail closed:

```
weather-pivot-cron/index.ts:81   if (!secret || got !== secret) → 401
weekly-spark-cron/index.ts:554   if (!secret || !timingSafeEqual(got, secret)) → 401
```

So weather pivots and Weekly Sparks were being actively rejected on every hourly invocation, in every environment. Neither feature has ever run.

---

## 2. Confirm before changing anything

```bash
# Production — expect 404 / NOT_FOUND (function not deployed)
curl -i -X POST https://orjccytcmklzcfjgqwwj.supabase.co/functions/v1/ai-gateway \
  -H "Content-Type: application/json" -d "{}"

# Dev — expect 401 "Missing or invalid authorization" (function IS deployed)
curl -i -X POST https://gwgjdpqskusuejlwrsnd.supabase.co/functions/v1/ai-gateway \
  -H "Content-Type: application/json" -d "{}"
```

If production returns 401 rather than 404, the function is already there and §3 is a no-op.

---

## 3. Dev first — get everything working here

Prod is a deployment target, not a debugging environment.

### 3.1 Seed the tier test accounts

```bash
export SUPABASE_URL="https://gwgjdpqskusuejlwrsnd.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="<dev service_role key>"
node supabase/scripts/seed-tier-test-users.mjs
```

Creates four accounts, password `TestPassword123!`:

| Account | Tier | Should be able to |
|---|---|---|
| `tier-free@winkly-test.local` | Free | 3 AI plans/day only — no concierge |
| `tier-super@winkly-test.local` | Super | Plans, events, chat topics, match agent — **not** concierge |
| `tier-premium@winkly-test.local` | Premium | Everything, including concierge |
| `tier-trial@winkly-test.local` | Trial | Premium now, drops to Free in ~24h |

**The trial trap:** `handle_new_user()` grants every new signup 3 days of Premium, and `effectiveTierFromRow()` resolves paid → trial → free. So a freshly registered account is **not** Free — it's Premium for 3 days. The script explicitly expires the trial on the accounts meant to be Free/Super/Premium. Keep this in mind if you create test accounts by hand.

The script refuses to run against production unless you pass `--i-know-this-is-production`.

### 3.2 Build a real APK that talks to dev

Previously impossible: `development` needs the Metro server (`developmentClient: true`), and `preview` points at production. The new profile fills the gap.

```bash
cd apps/mobile
eas build -p android --profile preview-dev
```

Installable standalone APK, pointed at the dev project. Use this for on-device testing instead of the production `preview` build.

### 3.3 Set `CRON_SECRET` on dev

```bash
openssl rand -hex 32          # generate; keep the value
npx supabase secrets set CRON_SECRET=<value> --project-ref gwgjdpqskusuejlwrsnd
```

Then insert the matching row — this is what supplies the `x-cron-secret` header. **Both pieces are required**; setting only one still yields 401.

```sql
insert into private.webhook_config (id, function_base_url, cron_secret)
values (true, 'https://gwgjdpqskusuejlwrsnd.supabase.co', '<same value>')
on conflict (id) do update
  set function_base_url = excluded.function_base_url,
      cron_secret       = excluded.cron_secret;
```

Verify:

```sql
select jobid, schedule, jobname, active from cron.job;
select * from cron.job_run_details order by start_time desc limit 20;
```

### 3.4 Test every AI surface, on each tier

Concierge plan generation · planner theme plans · chat topics · match agent · super-like icebreaker · weather pivot banner. They take different code paths and different tier gates — one working does not imply the rest do.

> Dev has Upstash configured, so the gateway caches tier for **300 seconds**. After changing a tier, Expo may keep showing the old gating for up to 5 minutes. This disappears once you complete §5.

---

## 4. Then promote to production

Code promotion and cloud promotion are separate. Git promote only mirrors the repo; it does **not** push migrations or deploy Edge Functions.

### 4.0 Promote the git snapshot

From a clean `Winkly_development` checkout on `main` (in sync with `origin/main`):

```bash
npm run promote:dry-run   # optional — show commit + file count
npm run promote           # force-pushes to winkly-production/main (type "promote")
```

Details and checklist: **docs/BRANCHING.md**. After this, Vercel redeploys the website from `winkly-production/main`. Continue below for Supabase.

### 4.1 Link and push migrations

```bash
npm run supabase:push:production:dry-run   # review first
npm run supabase:push:production
```

Or manually:

```bash
npx supabase login
npx supabase link --project-ref orjccytcmklzcfjgqwwj
npx supabase db diff --linked    # review first — this is the irreversible one
npx supabase db push
```

Migrations include `premium_trial`, `user_settings` and both cron schedules. Count must match `Winkly_development` after the git promote.

### 4.2 Deploy the functions

Either trigger the new workflow (Actions → **Deploy Edge Functions** → Run workflow → `production`), or:

```bash
npx supabase functions deploy --project-ref orjccytcmklzcfjgqwwj
```

### 4.3 Add the secrets production is missing

Already present on production: `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `OPENAI_API_KEY`, `GOOGLE_PLACES_API_KEY`, `AUTH_REDIRECT_STATE_SECRET`, `CORS_ALLOWED_ORIGINS`, `WEBHOOK_SECRET`.

Missing:

```bash
npx supabase secrets set CRON_SECRET=<new value, different from dev>
npx supabase secrets set UPSTASH_REDIS_REST_URL=...
npx supabase secrets set UPSTASH_REDIS_REST_TOKEN=...
npx supabase secrets set EVENTBRITE_PRIVATE_TOKEN=...
```

Then repeat the `private.webhook_config` insert from §3.3 with the production URL and the production secret.

Without `EVENTBRITE_PRIVATE_TOKEN`, Eventbrite results silently disappear from `get-nearby-external-events` — each provider is best-effort, so nothing errors, Events mode is just quietly thinner than in dev.

### 4.4 Harden production Auth

Dashboard → Authentication. The local `config.toml` has values that must **not** ship:

| Setting | Local value | Production must be |
|---|---|---|
| Email confirmations | `false` | **enabled** |
| Minimum password length | `6` | **≥ 8** |
| CAPTCHA | commented out | enabled |
| Rate limits | default | reviewed |

Also set Redirect URLs to include `winkly://callback`, `winkly://**` and the `auth-redirect` function URL, and update the Google/Apple OAuth consent screens to the live domain.

---

## 5. Upstash — move the free database to production

Upstash's free tier allows **one database per account**, not one per project. It's currently pointed at dev, while production — where uncapped AI spend actually costs money — has neither variable set.

Everything Winkly stores in Redis is cache with a TTL: rate-limit counters (60s), tier lookups (300s), AI response caches (86400s). Nothing durable, so the database is safe to delete and recreate.

1. Delete `WinklyApp_dev`; create a new database in an EU region (Frankfurt or Ireland — it caches tier keyed by user id, so GDPR applies).
2. Set `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` on **production only**.
3. Leave dev without them.

Two things follow:

- **Dev gets instant tier changes.** With no Upstash, `getSubscriptionTier()` reads the table directly — no more 300-second wait wondering whether a tier change took effect.
- **Rate limiting can no longer be tested in dev.** `rateLimitOrThrow()` returns OK when Upstash is absent (`ai-gateway/index.ts:332`). Verify burst limits once against production: three plan requests in a minute on a Free account, the third should return `limit_reached` / `burst`.

---

## 6. What never carries over automatically

Migrations and function code deploy. These do not — each must be redone per environment:

- [ ] Function secrets
- [ ] Auth dashboard settings (confirmations, password length, rate limits, CAPTCHA, redirect URLs)
- [ ] OAuth client IDs and secrets for Google / Apple
- [ ] The `private.webhook_config` row — the migration creates the *table*; the row is data
- [ ] Storage bucket contents

This list is the reason the original 404 happened. Walk it every time you promote.

---

## 7. Still outstanding

- **Billing.** Tiers are fully enforced but nothing charges anyone. Google Play Billing is mandatory for digital subscriptions on Android — Stripe is not permitted for in-app digital goods. RevenueCat on top of Play Billing is the usual route.
- **Legal entity.** Every field in `website/legal-entity.json` is still a placeholder. Blocks the Impressum, which blocks the store listing.
- **Support mailbox conflict.** Code uses `customer-care@mywinkly.de` (`app/account/legal.tsx:18`); `legal-entity.json` and `lib/location/citySearch.ts:9` use `info@mywinkly.de`. Pick one.
- **Stray dev secrets.** `POSTHOG_API_KEY` is referenced by no Edge Function (PostHog is client-side only). `WinklyApp` looks accidental — check the value before deleting.
