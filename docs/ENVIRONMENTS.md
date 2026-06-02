# Winkly — Environments (dev / staging / production)

**Last updated:** 2026-06-01

Winkly runs in three isolated environments. Each has its own Supabase project (or
local stack), its own data, and its own `.env` file. **Never test new features or run
untested migrations against production data.**

| Environment     | Backend                          | Mobile env file              | EAS profile / channel | Purpose |
| --------------- | -------------------------------- | ---------------------------- | --------------------- | ------- |
| **development** | Supabase **local** (`supabase start`) | `apps/mobile/.env.development` | `development`         | Day-to-day local work; disposable data. |
| **staging**     | Separate Supabase **project**    | `apps/mobile/.env.staging`     | `staging` / `preview` | Pre-prod testing; test migrations + features here first. |
| **production**  | Live Supabase **project**        | `apps/mobile/.env.production`  | `production`          | Real users. Read/observe only; promote vetted changes. |

---

## 1. One-time setup

### 1.1 Create the env files (local)

Copy each template and fill in values (the real files are git-ignored):

```bash
cp apps/mobile/.env.development.example apps/mobile/.env.development
cp apps/mobile/.env.staging.example     apps/mobile/.env.staging
cp apps/mobile/.env.production.example   apps/mobile/.env.production
```

### 1.2 Create the Supabase projects

- **development** — no project needed. Start the local stack:
  ```bash
  supabase start
  ```
  Copy the printed **API URL** and **anon key** into `apps/mobile/.env.development`.
- **staging** — In the Supabase dashboard create a new project named e.g. `winkly-staging`.
  Put its URL + anon key in `apps/mobile/.env.staging`.
- **production** — your existing live project. Put its URL + anon key in
  `apps/mobile/.env.production` (or, preferably, only as EAS production env vars).

---

## 2. Running locally against an environment

Expo loads `apps/mobile/.env` automatically. Pick which environment that points at:

```bash
npm run env:dev       # copies .env.development -> .env
npm run env:staging   # copies .env.staging     -> .env
npm run env:prod      # copies .env.production   -> .env  (warns: live data)
```

Or start in one step:

```bash
npm run start:dev
npm run start:staging
npm run start:prod
```

At runtime the active environment is available via `Constants.expoConfig.extra.appEnv`.

---

## 3. Database migrations — promote dev → staging → prod

Migrations live in `supabase/migrations/`. **Always** apply them to staging and verify
before production.

```bash
# 1) Develop locally — new migration files are picked up by db reset
supabase db reset                 # rebuild local DB from migrations + seed

# 2) Promote to STAGING and verify the app + data there
supabase link --project-ref YOUR_STAGING_PROJECT_REF
supabase db push

# 3) Only after staging is verified, promote to PRODUCTION
supabase link --project-ref YOUR_PROD_PROJECT_REF
supabase db push
```

Edge Functions follow the same flow — deploy to staging first, then production:

```bash
npx supabase functions deploy ai-gateway --project-ref YOUR_STAGING_PROJECT_REF --use-api
# verify on staging, then:
npx supabase functions deploy ai-gateway --project-ref YOUR_PROD_PROJECT_REF --use-api
```

Set per-project secrets (OpenAI, Gemini, etc.) separately for staging and production.

---

## 4. EAS builds per environment

`apps/mobile/eas.json` defines profiles that stamp `APP_ENV`:

```bash
eas build --profile development   # APP_ENV=development
eas build --profile staging       # APP_ENV=staging
eas build --profile production    # APP_ENV=production (Play AAB)
```

Store `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` (and other public
vars) as **EAS environment variables** scoped to each environment in the Expo dashboard,
rather than committing real `.env.*` files.

---

## 5. CI (GitHub Actions)

`.github/workflows/ci.yml` runs on every PR and on pushes to `main`:

- `npm ci` (workspace install; root **`postinstall`** runs `patch-package --patch-dir apps/mobile/patches` so hoisted deps like `react-native-range-slider-expo` typecheck in CI)
- `npm run mobile:lint`
- `npm run mobile:typecheck` (the RN "build" check)
- `npm run mobile:test`

Keep CI green before merging. Locally you can reproduce it with `npm run ci`.

---

## 6. Golden rules

- Never point local dev or staging at production data.
- Test every migration on staging before production.
- Keep real `.env.*` files off git (only `*.example` is tracked).
- Use separate analytics keys per environment so staging traffic never pollutes product metrics.
