# Winkly

Multi-mode social app (Romance, Friends, Business, Events) with AI planning, chat, and Supabase backend. Monorepo: **Expo mobile** (`apps/mobile`) + **Supabase** (`supabase/`).

**Product reference:** [`docs/PRODUCT_DOCUMENTATION.md`](docs/PRODUCT_DOCUMENTATION.md)  
**Env & secrets:** [`docs/API_KEYS_AND_ENV.md`](docs/API_KEYS_AND_ENV.md)  
**Branching:** [`docs/BRANCHING.md`](docs/BRANCHING.md)

---

## Prerequisites

| Tool | Version / notes |
|------|-----------------|
| [Node.js](https://nodejs.org/) | 20 LTS (matches CI) |
| npm | 10+ (workspaces) |
| [Expo CLI](https://docs.expo.dev/) | via `npx expo` |
| [Supabase CLI](https://supabase.com/docs/guides/cli) | `npx supabase` (devDependency at repo root) |
| iOS | Xcode + CocoaPods (for `expo run:ios` / device builds) |
| Android | Android Studio + SDK (for `expo run:android`) |
| [EAS CLI](https://docs.expo.dev/build/setup/) | `npm i -g eas-cli` for cloud builds and secrets |

Optional: [GitHub CLI](https://cli.github.com/) (`gh`) for PRs and merging Dependabot updates.

---

## Quick verify (clone → emulator, cloud dev)

One path to confirm the app runs against **Winkly_development** (no local Supabase required):

```bash
git clone git@github.com:mywinkly-cell/Winkly_development.git
cd Winkly_development
npm ci
cp apps/mobile/.env.development.example apps/mobile/.env.development
# Edit .env.development: set EXPO_PUBLIC_SUPABASE_URL + EXPO_PUBLIC_SUPABASE_ANON_KEY from the cloud dev project
npm run env:dev
npm run mobile:android    # Android emulator (or: npm run mobile:ios)
```

Optional sanity checks before shipping a change:

```bash
npm run mobile:lint
npm run mobile:typecheck
npm run mobile:test
npm run mobile:audit-a11y
```

---

## Quick start (local development)

```bash
git clone git@github.com:mywinkly-cell/Winkly_development.git
cd Winkly_development
npm ci
```

### 1. Environment file (never commit real keys)

Expo loads `apps/mobile/.env` (and optionally `.env.local` — same rules, git-ignored).

```bash
cp apps/mobile/.env.example apps/mobile/.env
# Or per-environment templates (recommended):
cp apps/mobile/.env.development.example apps/mobile/.env.development
npm run env:dev   # copies .env.development → .env
```

Edit `.env` and set at minimum:

| Variable | Required |
|----------|----------|
| `EXPO_PUBLIC_SUPABASE_URL` | Yes |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Yes |

See [`docs/API_KEYS_AND_ENV.md`](docs/API_KEYS_AND_ENV.md) for PostHog, OAuth, Sentry, EAS project ID, etc.

**Security:** Only the **anon** key belongs in the app. Never commit `service_role`, OpenAI, or other server secrets. `.gitignore` blocks `.env`, `.env.*`, and `apps/mobile/.env.local`.

### 2. Supabase (local stack)

```bash
supabase start
# Copy API URL + anon key from the CLI output into apps/mobile/.env.development, then:
npm run env:dev
# Edge Function secrets (LLM keys, etc.) — copy template, fill locally (never commit):
cp supabase/functions/.env.example supabase/functions/.env
supabase db reset    # applies all migrations in supabase/migrations/ + seed
```

### 3. Run the app

```bash
npm start              # Expo dev server (uses apps/mobile/.env)
npm run mobile:ios     # native iOS (requires prebuild / dev client)
npm run mobile:android # native Android
```

Reproduce CI locally:

```bash
$env:EXPO_PUBLIC_SUPABASE_URL="https://example.supabase.co"
$env:EXPO_PUBLIC_SUPABASE_ANON_KEY="ci-placeholder-anon-key"
npm run ci   # lint + typecheck + test
```

---

## EAS secrets (preview / production builds)

Do not put production keys in git. Use [Expo environment variables](https://docs.expo.dev/build-reference/variables/) per EAS profile (`development`, `preview`, `production` in `apps/mobile/eas.json`).

**Minimum for a build:**

- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`

**Common optional (same names as `.env.example`):**

- `EXPO_PUBLIC_POSTHOG_API_KEY`, `EXPO_PUBLIC_POSTHOG_HOST`
- `EXPO_PUBLIC_AUTH_REDIRECT_URL`
- `EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID`, `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`, `EXPO_PUBLIC_FACEBOOK_APP_ID`
- `EXPO_PUBLIC_EAS_PROJECT_ID` (Expo Push)
- `EXPO_PUBLIC_SENTRY_DSN` (runtime)
- Build-only: `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT` (source maps)

Example (run in your terminal; do not paste secrets into chat):

```bash
cd apps/mobile
eas secret:create --name EXPO_PUBLIC_SUPABASE_URL --value "https://YOUR_REF.supabase.co" --scope project --type string
eas secret:create --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value "your-anon-key" --scope project --type string
```

Supabase **Edge Function** secrets (`OPENAI_API_KEY`, `GEMINI_API_KEY`, etc.) are set in the Supabase Dashboard or `npx supabase secrets set` — not in EAS.

---

## Supabase migrations

- **52** SQL migrations in `supabase/migrations/` (ordered by timestamp prefix).
- Inventory and RLS notes: [`supabase/migrations/README.md`](supabase/migrations/README.md).

**Local:**

```bash
supabase db reset
```

**Dev cloud → production:**

```bash
supabase link --project-ref YOUR_DEV_REF
supabase db push
# verify app + run RLS audit (below), then:
supabase link --project-ref YOUR_PROD_REF
supabase db push
```

**Post-deploy RLS check** (SQL Editor as `service_role`):

```sql
SELECT * FROM public.rls_audit_report();
```

Or run [`supabase/scripts/rls-audit.sql`](supabase/scripts/rls-audit.sql). Every `public` table should show `status = OK`. Details: [`SECURITY.md`](SECURITY.md).

Deploy Edge Functions after schema changes; see [`docs/ENVIRONMENTS.md`](docs/ENVIRONMENTS.md).

---

## Repository layout

```
apps/mobile/     Expo Router app
supabase/        migrations, functions, seed, scripts
docs/            product, env, environments, go-live
packages/        shared packages (if any)
```

---

## Dependabot

Weekly npm updates are configured in [`.github/dependabot.yml`](.github/dependabot.yml). Merge status and deferred major upgrades: [`docs/DEPENDABOT.md`](docs/DEPENDABOT.md).

---

## Scripts (root)

| Command | Description |
|---------|-------------|
| `npm start` | Expo dev server |
| `npm run env:dev` / `env:local` / `env:prod` | Switch active `.env` |
| `npm run ci` | lint + typecheck + test |
| `npm run supabase:deploy-auth-redirect` | Deploy auth-redirect function |

---

## Security

See [`SECURITY.md`](SECURITY.md) for reporting vulnerabilities, RLS expectations, and secret hygiene.
