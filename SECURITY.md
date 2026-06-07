# Security policy

## Reporting a vulnerability

If you believe you have found a security issue in Winkly, please **do not** open a public GitHub issue.

- Email the maintainers with a clear description, steps to reproduce, and impact (if known).  
- Allow a reasonable time to fix before public disclosure.  
- We will acknowledge receipt and work with you on a fix and coordinated disclosure when appropriate.

We appreciate responsible research and will credit reporters who wish to be named (unless the report is confidential by nature).

---

## How we think about security (Winkly / this repo)

### Public source code and Supabase

A public repository exposes schema (migrations), auth patterns, and configuration. That is expected for many open projects but increases **reconnaissance** risk. Mitigations are: **strong RLS** on all tables, **no service-role or private keys in the client**, secrets only in Supabase / EAS, and (for non–open-source products) **making the repository private** if the team does not intend to run a public OSS program.

**Repository visibility (GitHub):** `repository_public: true` is a **GitHub / org setting**, not something this repo can change. To make the repo private: **Settings → General → Danger zone → Change repository visibility** (requires admin). For org repos, an org owner may need to allow private repos for your plan.

### `auth-redirect` Edge Function and JWT verification

The Supabase Edge Function `auth-redirect` (`supabase/functions/auth-redirect`) serves a **small static HTML page** used when email verification or magic links open in a system browser (e.g. Gmail). Those requests are **not** sent with a Supabase `Authorization: Bearer` session JWT, so the platform cannot require JWT verification for this function without **breaking** the email link flow.

**Configuration (source of truth):** `supabase/config.toml`:

```toml
[functions.auth-redirect]
verify_jwt = false
```

Deploy with `npm run supabase:deploy-auth-redirect` (the CLI reads `verify_jwt` from `config.toml` for the linked project).

**Root `package.json` contract:** the script must deploy **without** the `--no-verify-jwt` CLI flag (JWT behavior comes only from `config.toml`). Expected line:

`"supabase:deploy-auth-redirect": "supabase functions deploy auth-redirect"`

**What this function does not do:** It does not implement a full OAuth authorization-server callback. It does not read URL fragments server-side (fragments are not sent to the server in HTTP). It only returns HTML; the browser forwards `#access_token=…` (and related params) to the app deep link `winkly://callback`. Session validity is enforced by **Supabase Auth** when the client calls `supabase.auth.setSession` with those tokens.

**CSRF / open redirect (`winkly_state`):** When `AUTH_REDIRECT_STATE_SECRET` is set (Supabase Edge Function secret, **≥ 16 characters**), the app mints a signed `winkly_state` via `GET …/auth-redirect?action=mint` before `signUp` / `resetPasswordForEmail` / resend, appends it to `emailRedirectTo`, and the Edge Function **rejects** HTML without a valid signature (403). The redirect page forwards `winkly_state` on the `winkly://callback` deep link; the app checks it against `AsyncStorage` in `createSessionFromUrl`. URL **fragments** (`#access_token=…`) are still not visible to the server; JWT shape checks in the HTML remain defense in depth. **Supabase Auth** redirect URL allowlists still apply.

**OAuth / email errors:** The in-page script shows **OAuth error** query params (`?error=`, `error_description=`) without treating them as a successful session, and only auto-redirects when the fragment `access_token` **looks like a JWT** (three dot-separated segments).

**Defense in depth:** The HTML response sets strict headers (CSP, `X-Frame-Options`, etc.) and only allows **GET** and **OPTIONS**. For abuse at scale, use **WAF / rate limits** in front of the function URL if needed.

### Supabase anon key in the mobile app

The **anon** key is **designed** to be embedded in client apps. Security depends on **Row Level Security (RLS)** and auth policies. Treat RLS review and testing as mandatory for every table and sensitive column.

### Auth rate limiting and brute-force protection

**Local / config reference:** `supabase/config.toml` includes **`[auth.rate_limit]`** (defaults: `sign_in_sign_ups = 30` and `token_verifications = 30` per 5 minutes per IP; `email_sent = 2` per hour). This applies to **local** `supabase start`.

**Hosted project (required for MVP):** In **Supabase Dashboard → Authentication → Rate limits** (or **Settings → Auth** depending on UI version), confirm limits are **enabled** for sign-in, sign-up, OTP/magic-link verification, and password reset. Without this, credentials can be brute-forced and emails enumerated. For launch, consider **`[auth.captcha]`** in `config.toml` (hCaptcha) on self-hosted stacks; hosted projects can enable CAPTCHA in the same Auth settings area.

### Third-party npm packages

Some dependencies (for example `@neilromblon/expo-image-manipulator-view`) are maintained outside the core Expo org. Periodically **audit** usage, pin versions, review upstream changes, and replace with officially supported alternatives when they cover the same needs.

**Audit finding (2026-06-01) — `@neilromblon/expo-image-manipulator-view`: RESOLVED.** This package was **abandoned, single-maintainer risk**: all six versions published on a single day (2023-05-24), no updates since, single-digit weekly downloads, a fork of the unmaintained `gomo/expo-image-crop` → `brunon80/expo-image-crop` lineage. Its declared dependencies targeted **Expo SDK ~48** and only ran on the project's **SDK 54** via `package.json` `overrides`. It was used solely for the **interactive crop UI** in `apps/mobile/components/media/ImageCropModal.tsx` (which was not wired into any screen at the time).

**Remediation applied:** replaced with the actively maintained **`expo-dynamic-image-crop`** (last publish Dec 2025; built on the official `expo-image-manipulator` + `react-native-gesture-handler`); removed `@neilromblon/expo-image-manipulator-view` and its nested `overrides` block from root and `apps/mobile` `package.json`. Removing the abandoned package also surfaced a latent issue — **`@expo/vector-icons`** (imported across the app) was only present transitively via the removed package; it is now a **direct dependency** of `apps/mobile`. **`expo-dynamic-image-crop@1.4.51`** still declared outdated nested native deps in its published `package.json`; **`apps/mobile/patches/expo-dynamic-image-crop+1.4.51.patch`** bumps those ranges to SDK 54–compatible versions, and root **`postinstall`** runs **`scripts/prune-expo-dynamic-image-crop-nested.mjs`** so `expo-doctor` does not see duplicate `@expo/vector-icons` / `expo-image-manipulator` trees. Continue to periodically audit third-party packages: pin versions, review upstream activity, and prefer officially supported or actively maintained alternatives.

### Client bundles (Expo / React Native)

Release APK/IPA bundles can be inspected. **Never** embed service-role keys, private API secrets, or internal admin endpoints in app code or committed `.env` files. Use **EAS Secrets** / CI secrets for builds.

### Git history and `.env`

Standard `.gitignore` entries for `.env` are normal practice. If `.env` or real secrets were **ever** committed, assume they are recoverable from history: **rotate all affected credentials** (Supabase keys, OAuth client secrets, etc.) and enable **GitHub secret scanning** on the repository.

**Historical check (run locally):**

```bash
git log --all --full-history -- "**/.env" ".env" "apps/mobile/.env"
```

**Last local audit (CI / maintainer):** `git log` for real `*.env` (non-example) file adds showed **no** secret env files; only `apps/mobile/.env.example` appears in history as a **template**. Re-run the command after any incident.

### Row Level Security (RLS)

Migrations under `supabase/migrations/` include **`ENABLE ROW LEVEL SECURITY`** and policies (for example `20250130000002_winkly_rls.sql` and follow-on migrations). Migration **`20260601120000_security_rls_audit.sql`** adds **`public.rls_audit_report()`** (service_role only) and idempotently enables RLS on all `public` tables. Run **`supabase/scripts/rls-audit.sql`** in the SQL editor after deploy; every table should show `status = OK`. Test with the **anon** key and no session — queries must not return other users’ rows.

**Review each table** when adding features; new tables must ship with RLS policies before exposing data via the anon key.

### Dependabot and GitHub secret scanning

This repo includes **`.github/dependabot.yml`** so Dependabot can open npm update PRs after merge. **Secret scanning** and **Dependabot security updates** are toggled in **GitHub → Settings → Code security and analysis** (requires owner/admin).

---

## Related documentation

- `docs/API_KEYS_AND_ENV.md` — environment variables and secrets layout  
- `auth-redirect/README.md` — deploying the redirect page  
- `docs/PRODUCT_DOCUMENTATION.md` — product and architecture (including security posture)
