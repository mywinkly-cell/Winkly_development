# Supabase — Production project & backups

**Last updated:** 2026-06-06

Winkly uses **three logical environments**. Only **two** need paid Supabase cloud projects at once if you use **local** for development (see §0).

| Environment | Backend | Project ref | GitHub (team) |
| ----------- | ------- | ----------- | ------------- |
| **development** | Local (`supabase start`) | n/a | Main app repo (`develop` / feature branches) |
| **staging** | Supabase cloud | **`orjccytcmklzcfjgqwwj`** ([dashboard](https://supabase.com/dashboard/project/orjccytcmklzcfjgqwwj)) | Private [`mywinkly-cell/winkly-staging`](https://github.com/mywinkly-cell/winkly-staging) |
| **production** | Supabase cloud — **WinklyApp (main)** | **`gwgjdpqskusuejlwrsnd`** ([dashboard](https://supabase.com/dashboard/project/gwgjdpqskusuejlwrsnd)) | [`mywinkly-cell/winkly-prod`](https://github.com/mywinkly-cell/winkly-prod) (release mirror / ops) |

Both cloud projects are on the **Free** plan (2-project org limit). **Development** stays local — no third cloud slot needed.

**Status (2026-06-06):** All repo migrations applied to **staging** and **production**. Edge Functions deployed to staging (parity with production). Local env files: `apps/mobile/.env.staging`, `apps/mobile/.env.production` (git-ignored).

---

## 0. Two-cloud layout (current)

1. **Development** → `supabase start` locally.
2. **Staging** → `orjccytcmklzcfjgqwwj` — migration QA, EAS **preview** builds, disposable data.
3. **Production** → `gwgjdpqskusuejlwrsnd` — live **WinklyApp** project; promote migrations only after staging verification.

**Never** point preview/staging mobile builds at production keys. **Never** run experiments on production data.

---

## 1. One-time: create separate projects

### Staging

1. [Supabase Dashboard](https://supabase.com/dashboard) → **New project** → name `winkly-staging`.
2. Copy **Project URL** + **anon key** into `apps/mobile/.env.staging` (local) and EAS **preview** env vars.
3. Link CLI: `supabase link --project-ref YOUR_STAGING_REF`
4. Apply migrations: `supabase db push`
5. Deploy Edge Functions to staging first; set secrets per project.

### Production

1. Create a **separate** project (e.g. `winkly-prod`) — never reuse staging.
2. Copy URL + anon key into EAS **production** env vars only (avoid local `.env.production` on developer laptops when possible).
3. Link: `supabase link --project-ref YOUR_PROD_REF`
4. Apply migrations **only after** staging verification: `supabase db push`
5. Deploy Edge Functions + production secrets.

### Auth redirect URLs (production)

In production **Authentication → URL configuration**:

- **Site URL**: `winkly://` or your production web URL
- **Redirect URLs**: `winkly://callback`, `winkly://**`, HTTPS auth-redirect function URL

---

## 2. Migration promotion checklist

Never run untested migrations on production.

```
local (db reset) → staging (db push + app QA) → production (db push)
```

1. `supabase db reset` locally — verify app + tests
2. `supabase link --project-ref STAGING_REF && supabase db push`
3. Run staging EAS preview build; smoke-test critical flows
4. `supabase link --project-ref PROD_REF && supabase db push`
5. Deploy Edge Functions to production

---

## 3. Backups — enable and verify

Supabase backup options depend on your plan:

| Feature | Free | Pro+ |
| ------- | ---- | ---- |
| Daily logical backups | 7-day retention | Configurable |
| Point-in-time recovery (PITR) | No | Yes (recommended for production) |

### Production checklist (blocking before go-live)

- [ ] Production project is on a **paid plan** with **PITR enabled** (Dashboard → **Database → Backups**).
- [ ] Confirm **daily backup schedule** is active and retention meets your policy (minimum 7 days; 30+ recommended).
- [ ] Document the **recovery procedure**: restore to a new project or use PITR to a timestamp (Supabase support/docs).
- [ ] Test a **staging restore** at least once so the team knows the steps.
- [ ] Store the **service role key** and **database password** in a team password manager — not in git.
- [ ] Enable **database network restrictions** if your deployment model allows fixed egress IPs.

### Verify backups in dashboard

1. Open the **production** project (not staging).
2. Go to **Database → Backups**.
3. Confirm status is **Enabled** and recent backup timestamps are listed.
4. For PITR: note the earliest recoverable time and test window.

---

## 4. Monitoring production

- **Database → Reports** — connection count, disk, slow queries
- **Advisors** (CLI `supabase db lint` or dashboard) — RLS gaps, missing indexes
- **Logs** — Auth errors, Edge Function failures
- Run `supabase/scripts/verify-setup.sql` after major migrations

---

## 5. Golden rules

- Never point `development` or `staging` mobile builds at the production Supabase URL.
- Never run `supabase db reset` against a linked remote project.
- Never apply migrations to production without staging verification.
- Rotate keys if a `.env` or service account is exposed.

See also: `docs/ENVIRONMENTS.md`, `docs/GO_LIVE_AND_PLAY_STORE.md`.
