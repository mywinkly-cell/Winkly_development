# Supabase — Production project & backups

**Last updated:** 2026-06-06

Winkly uses **two active environments** today. A separate staging project is **deferred until app publishing**.

| Environment | Backend | Project ref | GitHub (team) |
| ----------- | ------- | ----------- | ------------- |
| **development** | Local (`supabase start`) | n/a | Main app repo (`develop` / feature branches) |
| **production** | Supabase cloud — **winkly-production** | **`orjccytcmklzcfjgqwwj`** ([dashboard](https://supabase.com/dashboard/project/orjccytcmklzcfjgqwwj)) | [`mywinkly-cell/winkly-production`](https://github.com/mywinkly-cell/winkly-production) |

The former `winkly-staging` project was **renamed to winkly-production** and is now the single cloud backend. **Development** stays local — no second cloud slot needed until go-live staging is introduced.

---

## 0. Current layout

1. **Development** → `supabase start` locally.
2. **Production** → `orjccytcmklzcfjgqwwj` — migrations, Edge Functions, EAS **preview** and **production** builds.

**Never** run `supabase db reset` against the linked remote project. **Never** apply untested migrations to production.

---

## 1. One-time: production project setup

1. Open [winkly-production](https://supabase.com/dashboard/project/orjccytcmklzcfjgqwwj) in the Supabase dashboard.
2. Copy **Project URL** + **anon key** into `apps/mobile/.env.production` (local) and EAS **preview** / **production** env vars.
3. Link CLI: `npm run supabase:link:production` (or `supabase link --project-ref orjccytcmklzcfjgqwwj`).
4. Apply migrations: `npm run supabase:push:production`.
5. Deploy Edge Functions + set production secrets (see **docs/API_KEYS_AND_ENV.md** §3.1).

### Auth redirect URLs (production)

In production **Authentication → URL configuration**:

- **Site URL**: `winkly://` or your production web URL
- **Redirect URLs**: `winkly://callback`, `winkly://**`, HTTPS auth-redirect function URL

---

## 2. Migration promotion checklist

```
local (db reset) → production (db push + app QA)
```

1. `supabase db reset` locally — verify app + tests
2. `npm run supabase:push:production`
3. Run EAS preview build; smoke-test critical flows
4. Deploy Edge Functions to production if changed

**Future (at app publish):** add a separate `winkly-staging` project and promote `local → staging → production`.

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
- [ ] Store the **service role key** and **database password** in a team password manager — not in git.
- [ ] Enable **database network restrictions** if your deployment model allows fixed egress IPs.

### Verify backups in dashboard

1. Open **winkly-production** (`orjccytcmklzcfjgqwwj`).
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

- Never point `development` mobile builds at the production Supabase URL.
- Never run `supabase db reset` against a linked remote project.
- Never apply migrations to production without local verification.
- Rotate keys if a `.env` or service account is exposed.

See also: `docs/ENVIRONMENTS.md`, `docs/GO_LIVE_AND_PLAY_STORE.md`.
