# Security audit — August 2026: what changed and how to deploy it

Companion to the audit. This is the operational half: what each change does,
the order it has to be applied in, and how to confirm it worked.

Everything here has been applied and re-applied against a scratch Postgres with
the same shape as the hosted project. What has **not** been tested is the live
Edge Function path — there is no way to exercise the real provider APIs offline,
so treat the ai-gateway changes as reviewed-but-unrun until they are on dev.

---

## What changed

| ID | Change | Files |
|----|--------|-------|
| SEC-1 | `public.users` billing and moderation columns are no longer client-writable | `20260821120000_…` |
| SEC-2 | `user_locations` is owner-only again; the discover feed reads it through a `private` DEFINER function | `20260821120000_…` |
| SEC-3 | `companies` / `business_services` are read-only for clients | `20260821120000_…` |
| SEC-5 | `match_events_for_concierge` is no longer executable by `anon` | `20260821120000_…` |
| SAFE-1 | 18+ enforced by CHECK constraint and by client validation | `20260821120000_…`, `lib/profile/validation.ts` |
| — | Blocked users can no longer read your `user_profiles` row | `20260821120000_…` |
| COST-1 | Rate limiting fails closed instead of open | `ai-gateway/index.ts` |
| COST-2 | Tokens and cost recorded per request; daily and monthly spend ceilings | `20260821120100_…`, `ai-gateway/{index,usage,pricing}.ts` |
| SEC-4 | Cron secret comparison is constant-time and shared across all three crons | `_shared/timingSafeEqual.ts` + the three crons |
| SEC-6 | Calendar token encryption supports key rotation | `_shared/calendarTokenCrypto.ts` |
| PROD-1 | The placeholder verification screen redirects to the real one | `app/profile/{index,verification}.tsx` |
| OPS-3 | CodeQL, gitleaks, dependency review and npm audit in CI | `.github/workflows/security.yml` |

---

## Deploy order

The two migrations are independent of each other but **both must land before**
the new ai-gateway is deployed, because the gateway writes columns and calls
functions they create. Deploying the function first does not break anything —
the inserts would just fail on unknown columns and the spend guard is disabled
by default — but there is no reason to find out.

### 1. Dev first, always

```bash
npm run supabase:push:development:dry-run   # read what it plans to do
npm run supabase:push:development
```

Then, **before** anything else, check for existing under-18 accounts:

```
supabase/scripts/underage-audit.sql
```

The 18+ constraints are created `NOT VALID` on purpose: they guard every new
write immediately but do not scan existing rows, so an under-18 account already
in the table surfaces as a moderation decision rather than a failed migration.
Once that query is empty (or the accounts have been actioned):

```sql
ALTER TABLE public.user_profiles VALIDATE CONSTRAINT user_profiles_min_age_chk;
ALTER TABLE public.profiles_core VALIDATE CONSTRAINT profiles_core_min_age_chk;
```

### 2. Run the regression test

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/security_hardening_test.sql
```

Twelve assertions, all printing `PASS:`. It runs in a transaction and rolls
back, so it is safe against dev. It has been verified to **fail** against the
un-hardened schema — a test that cannot fail proves nothing.

### 3. Deploy the Edge Functions

Push to `main` and `deploy-functions.yml` handles dev. For production use the
manual `workflow_dispatch` with `target: production`.

Functions changed: `ai-gateway`, `weather-pivot-cron`, `weekly-spark-cron`,
`calendar-sync-sweep`. `_shared` is bundled into each of them, so
`calendar-oauth-callback`, `calendar-oauth-disconnect` and
`calendar-sync-confirmed-event` need redeploying too — they import the rewritten
`calendarTokenCrypto.ts`.

### 4. Set the new secrets

Nothing here is required — every new variable has a safe default — but two are
worth setting deliberately:

```bash
# Production: leave AI_RATELIMIT_OPTIONAL unset. Local dev only:
npx supabase secrets set AI_RATELIMIT_OPTIONAL=true --project-ref <dev-ref>
```

Leave the spend ceilings at 0 until you have a week of real numbers from the
beta, then set them from the `ai_spend_daily` view rather than from a guess.

### 5. Then production

Same sequence. Run the regression test against production too.

---

## How to confirm it actually worked

Beyond the regression test, four things are worth checking by hand on dev,
because they are the ones a passing test suite would not notice:

1. **Discover still returns people.** Open Romance discover on a device. The
   distance labels must still appear. If the feed is empty, the wrapper function
   is the first place to look.
2. **The account-type switch still works.** Settings → switch to business and
   back. This is the one column the SEC-1 change deliberately left writable, and
   breaking it is the most likely regression.
3. **Onboarding rejects an under-18 date.** The date picker already prevented
   choosing one; now the validation message appears too.
4. **`ai_requests` is filling in.** After a few concierge calls:

   ```sql
   SELECT day, requests, input_tokens, output_tokens, cost_eur
   FROM public.ai_spend_daily ORDER BY day DESC LIMIT 7;
   ```

   If `cost_eur` is 0 while `requests` climbs, the usage ledger is not recording
   — check the function logs for `[usage] AsyncLocalStorage unavailable`.

---

## Rolling back

Both migrations are additive and idempotent; neither drops a column or destroys
data. If SEC-1 or SEC-3 turns out to break a flow nobody remembered:

```sql
-- restores the pre-audit (vulnerable) grants — temporary only
GRANT UPDATE ON public.users TO authenticated;
```

Do this only to unblock, and re-apply the migration once the caller is fixed.
The trigger is the safety net: it keeps rejecting billing-column writes from the
client roles even with the broad grant restored, so a rollback of the grant does
not silently reopen the escalation path. To roll back the trigger too:

```sql
DROP TRIGGER IF EXISTS users_guard_privileged_columns_trg ON public.users;
```

---

## Not done here

Named so they do not get lost:

- **LEG-1 / LEG-2 / LEG-3** — the Impressum, privacy policy and DSA work all
  need real entity data and a lawyer's eye. `website/legal-entity.json` is still
  placeholders and is still being served live.
- **STORE-1** — the Play API 36 extension request. A form in Play Console, and
  the deadline is 31 August.
- **STORE-2** — the `.well-known` files need the Play App Signing SHA-256 and
  the Apple Team ID, so they are blocked on the store accounts existing.
- **BIZ-1** — RevenueCat. Now unblocked, because SEC-1 means a tier is
  something a user has to be granted rather than something they can assign
  themselves.
- **Column-level data minimisation on `user_profiles`.** Blocked users can no
  longer read the row at all, but every other authenticated user still reads
  every column, including `religion` and `allergies`. Fixing that properly means
  a restricted view and changes to the queries that read it — a deliberate
  follow-up rather than something to slip into a security migration.
- **AES-GCM `additionalData`** binding calendar token blobs to their `user_id`.
  Requires changing four call signatures; the rotation gap was the operationally
  urgent half and that is closed.
