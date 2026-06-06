# Winkly — Environments (dev / production)

**Last updated:** 2026-06-06

Winkly uses **two active environments** today. A separate **staging** Supabase project is deferred until app publishing.

| Environment     | Backend                          | Mobile env file              | EAS profile / channel | Purpose |
| --------------- | -------------------------------- | ---------------------------- | --------------------- | ------- |
| **development** | Supabase **local** (`supabase start`) | `apps/mobile/.env.development` | `development`         | Day-to-day local work; disposable data. |
| **production**  | **winkly-production** `orjccytcmklzcfjgqwwj` | `apps/mobile/.env.production`  | `production` / `preview` | Cloud backend for QA builds and release. [Dashboard](https://supabase.com/dashboard/project/orjccytcmklzcfjgqwwj). GitHub: [`mywinkly-cell/winkly-production`](https://github.com/mywinkly-cell/winkly-production). |

**Never** test untested migrations or experiments against production without local verification first.

---

## 1. One-time setup

### 1.1 Create the env files (local)

Copy each template and fill in values (the real files are git-ignored):

```bash
cp apps/mobile/.env.development.example apps/mobile/.env.development
cp apps/mobile/.env.production.example   apps/mobile/.env.production
```

### 1.2 Create / link the Supabase projects

- **development** — no cloud project needed. Start the local stack:
  ```bash
  supabase start
  ```
  Copy the printed **API URL** and **anon key** into `apps/mobile/.env.development`.
- **production** — **winkly-production** (`orjccytcmklzcfjgqwwj`). Copy its URL + anon key into
  `apps/mobile/.env.production` (or, preferably, only as EAS production/preview env vars).

---

## 2. Running locally against an environment

Expo loads `apps/mobile/.env` automatically. Pick which environment that points at:

```bash
npm run env:dev       # copies .env.development -> .env
npm run env:prod      # copies .env.production   -> .env  (warns: live cloud data)
```

Or start in one step:

```bash
npm run start:dev
npm run start:prod
```

At runtime the active environment is available via `Constants.expoConfig.extra.appEnv`.

---

## 3. Database migrations — promote dev → production

Migrations live in `supabase/migrations/`. **Always** verify locally before pushing to production.

```bash
# 1) Develop locally — new migration files are picked up by db reset
supabase db reset                 # rebuild local DB from migrations + seed

# 2) Promote to PRODUCTION and verify the app
npm run supabase:push:production
# or manually:
supabase link --project-ref orjccytcmklzcfjgqwwj
supabase db push
```

Edge Functions follow the same flow — deploy to production after local verification:

```bash
npx supabase functions deploy ai-gateway --project-ref orjccytcmklzcfjgqwwj --use-api
```

Set production secrets once per project (see **docs/API_KEYS_AND_ENV.md** §3.1).

---

## 4. EAS builds per environment

`apps/mobile/eas.json` defines profiles that stamp `APP_ENV`:

```bash
eas build --profile development   # APP_ENV=development (local Supabase)
eas build --profile preview       # APP_ENV=production (winkly-production backend)
eas build --profile production    # APP_ENV=production (Play AAB)
```

Store `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` (and other public
vars) as **EAS environment variables** scoped to `preview` and `production` in the Expo dashboard,
rather than committing real `.env.*` files.

---

## 5. CI (GitHub Actions)

`.github/workflows/ci.yml` runs on every PR and on pushes to `main` / `develop` as **three required jobs**:

- **Lint** — `npm run mobile:lint`
- **Typecheck** — `npm run mobile:typecheck` (TypeScript `strict` + `noImplicitAny`)
- **Unit tests** — `npm run mobile:test`

Configure branch protection to require all three before merge (`docs/BRANCHING.md`). Reproduce locally with `npm run ci`.

On merge to **`main`**, `.github/workflows/eas-submit.yml` builds the **preview** profile and auto-submits to TestFlight + Play internal (`docs/EAS_CI.md`).

---

## 6. Golden rules

- Never point local dev at production data unless you intend to test against the live cloud project.
- Test every migration locally (`supabase db reset`) before `supabase db push` to production.
- Keep real `.env.*` files off git (only `*.example` is tracked).
- Use separate analytics keys per environment so dev traffic never pollutes product metrics.
- **Staging (future):** when the app is ready to publish, add a separate `winkly-staging` Supabase project for pre-release QA; until then, use local dev + winkly-production.
