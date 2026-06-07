# Secrets & environment audit

**Last updated:** 2026-06-06  
**Status:** No committed secrets found in tracked files.

## Checks performed

| Check | Result |
|-------|--------|
| `git log --all --full-history -- "**/.env" ".env" "apps/mobile/.env"` | No real `.env` files in history (templates only) |
| Ripgrep for JWT-shaped keys (`eyJ…`) in `*.ts`, `*.tsx`, `*.js`, `*.json`, `*.env`, `*.sql` | **No matches** |
| `sk_live_` / `sk_test_` / hardcoded `service_role` in client code | **None** (service role only referenced as `Deno.env.get` in Edge Functions) |
| `.gitignore` | Blocks `.env`, `.env.*`, `apps/mobile/.env*`, certs, `google-service-account.json` |
| CI placeholders | `https://example.supabase.co` + `ci-placeholder-anon-key` in `.github/workflows/ci.yml` only |

## Expected secret locations

| Secret | Where it must live |
|--------|-------------------|
| Supabase **anon** key | `apps/mobile/.env` (local), EAS env vars (builds) |
| Supabase **service_role** | Supabase Edge Function secrets only (auto-injected + Dashboard) |
| OpenAI / Gemini / Meetup / etc. | `npx supabase secrets set` or Dashboard |
| Google Play submit key | `apps/mobile/google-service-account.json` (local only, gitignored) or GitHub secret `GOOGLE_SERVICE_ACCOUNT_JSON` (CI) |
| Expo / EAS token | GitHub secret `EXPO_TOKEN` (`.github/workflows/eas-submit.yml`) |
| Sentry upload token | EAS secrets (`SENTRY_AUTH_TOKEN`), not `EXPO_PUBLIC_*` |

## Local setup checklist

- [ ] `cp apps/mobile/.env.example apps/mobile/.env` (or use `npm run env:dev` with `.env.development`)
- [ ] Optional: `cp apps/mobile/.env.local.example apps/mobile/.env.local` for machine-specific overrides
- [ ] EAS: env vars for `preview` (QA from `WinklyApp_3`) and `production` (store builds from `winkly-production` repo) — winkly-production Supabase URL + anon key
- [ ] Supabase: use local dev for day-to-day work; never use production anon key in local `.env.development`
- [ ] GitHub: add repository secrets `EXPO_TOKEN`, `GOOGLE_SERVICE_ACCOUNT_JSON` for EAS submit (`docs/EAS_CI.md`)
- [ ] GitHub: enable **Secret scanning** and **Dependabot security updates** (Settings → Code security)

## If a secret was ever committed

1. Rotate the key in Supabase / provider dashboards immediately.  
2. Revoke old keys.  
3. Update EAS and local `.env` files.  
4. Consider `git filter-repo` only if the repo was public with real secrets in history.

See also [`SECURITY.md`](../SECURITY.md) and [`docs/API_KEYS_AND_ENV.md`](API_KEYS_AND_ENV.md).
