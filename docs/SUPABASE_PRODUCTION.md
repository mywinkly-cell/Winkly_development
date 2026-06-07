# Supabase — Cloud projects, migrations & backups

**Last updated:** 2026-06-06

| Repo | Supabase | Project ref | Role |
| ---- | -------- | ----------- | ---- |
| [**WinklyApp_3**](https://github.com/mywinkly-cell/WinklyApp_3) | **WinklyApp** (development) | `gwgjdpqskusuejlwrsnd` | Author `supabase/`; push migrations here first |
| [**winkly-production**](https://github.com/mywinkly-cell/winkly-production) | **winkly-production** | `orjccytcmklzcfjgqwwj` | Mirrored snapshot; prod push + store builds |

Optional **local** stack: `supabase start` on developer machines (fastest loop). Full matrix: **docs/ENVIRONMENTS.md**.

The former staging project (`orjccytcmklzcfjgqwwj`) is now **production**. Development cloud is the long-running **WinklyApp** project (`gwgjdpqskusuejlwrsnd`).

---

## 0. Migration flow (strict)

```
WinklyApp_3 (author) → db reset (local) → push dev → promote repo → dry-run prod → push prod
```

**Never** author migrations in `winkly-production`. See **supabase/PROJECTS.md**.

**Status (2026-06-06):** `npm run supabase:push:production:dry-run` and `supabase:push:development:dry-run` from WinklyApp_3 both report **Remote database is up to date** (52 migrations on dev and prod).

---

## 1. Development cloud (`gwgjdpqskusuejlwrsnd`)

1. [WinklyApp dashboard](https://supabase.com/dashboard/project/gwgjdpqskusuejlwrsnd) → copy URL + anon key → `apps/mobile/.env.cloud-development`.
2. `npm run supabase:link:development`
3. After local `supabase db reset`: `npm run supabase:push:development:dry-run` then `npm run supabase:push:development`
4. Deploy changed Edge Functions to dev ref first; set dev secrets (see **docs/API_KEYS_AND_ENV.md** §3.1).

---

## 2. Production cloud (`orjccytcmklzcfjgqwwj`)

1. [winkly-production dashboard](https://supabase.com/dashboard/project/orjccytcmklzcfjgqwwj) → `.env.production` / EAS env vars.
2. Promote `WinklyApp_3/main` → `winkly-production/main` (must include mirrored `supabase/`).
3. From `winkly-production` checkout: `npm run supabase:push:production:dry-run` then `npm run supabase:push:production`
4. Deploy Edge Functions + production secrets (see **docs/API_KEYS_AND_ENV.md** §3.2).

### Auth redirect URLs (production)

- **Site URL**: `winkly://` or production web URL
- **Redirect URLs**: `winkly://callback`, `winkly://**`, HTTPS auth-redirect function URL

---

## 3. winkly-production repo — `supabase/` mirror

On each promote, **`winkly-production/main` must contain the full `supabase/` tree** from `WinklyApp_3/main` (migrations, `functions/`, `config.toml`). Verify:

```bash
# After first promote, in winkly-production checkout:
ls supabase/migrations/*.sql | wc -l   # should match WinklyApp_3 (52)
npm run supabase:push:production:dry-run
```

Could not verify the private repo contents from this environment (no local clone, API 404 without auth). **Action:** clone `winkly-production` and confirm `supabase/migrations/` exists; if empty, promote `WinklyApp_3/main` now to seed it.

---

## 4. Backups (production only)

Before go-live on `orjccytcmklzcfjgqwwj`:

- [ ] Paid plan with **PITR** (Dashboard → Database → Backups)
- [ ] Document recovery procedure; store DB password + service role in password manager
- [ ] Never run `supabase db reset` against a linked remote project

---

## 5. Golden rules

- One-direction migrations: **WinklyApp_3 → dev cloud → prod cloud**
- Dry-run prod before every push
- Dev experiments on `gwgjdpqskusuejlwrsnd`, never on `orjccytcmklzcfjgqwwj` without promote checklist

See also: **docs/BRANCHING.md**, **docs/GO_LIVE_AND_PLAY_STORE.md**.
