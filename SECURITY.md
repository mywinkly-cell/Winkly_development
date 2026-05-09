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

### `auth-redirect` Edge Function and JWT verification

The Supabase Edge Function `auth-redirect` (`supabase/functions/auth-redirect`) serves a **small static HTML page** used when email verification or magic links open in a system browser (e.g. Gmail). Those requests are **not** sent with a Supabase `Authorization: Bearer` session JWT, so the platform cannot require JWT verification for this function without **breaking** the email link flow.

**Configuration (source of truth):** `supabase/config.toml`:

```toml
[functions.auth-redirect]
verify_jwt = false
```

Deploy with `npm run supabase:deploy-auth-redirect` (the CLI reads `verify_jwt` from `config.toml` for the linked project).

**What this function does not do:** It does not implement a full OAuth authorization-server callback. It does not read URL fragments server-side (fragments are not sent to the server in HTTP). It only returns HTML; the browser forwards `#access_token=…` (and related params) to the app deep link `winkly://callback`. Session validity is enforced by **Supabase Auth** when the client calls `supabase.auth.setSession` with those tokens.

**Defense in depth:** The HTML response sets strict headers (CSP, `X-Frame-Options`, etc.) and only allows **GET** and **OPTIONS**. For abuse at scale, use **WAF / rate limits** in front of the function URL if needed.

### Supabase anon key in the mobile app

The **anon** key is **designed** to be embedded in client apps. Security depends on **Row Level Security (RLS)** and auth policies. Treat RLS review and testing as mandatory for every table and sensitive column.

### Auth rate limiting and brute-force protection

Configure **Supabase Auth rate limits** (and related protections) in the **Supabase Dashboard** under Authentication settings. Do not rely on client-side checks alone.

### Third-party npm packages

Some dependencies (for example `@neilromblon/expo-image-manipulator-view`) are maintained outside the core Expo org. Periodically **audit** usage, pin versions, review upstream changes, and replace with officially supported alternatives when they cover the same needs.

### Client bundles (Expo / React Native)

Release APK/IPA bundles can be inspected. **Never** embed service-role keys, private API secrets, or internal admin endpoints in app code or committed `.env` files. Use **EAS Secrets** / CI secrets for builds.

### Git history and `.env`

Standard `.gitignore` entries for `.env` are normal practice. If `.env` or real secrets were **ever** committed, assume they are recoverable from history: **rotate all affected credentials** (Supabase keys, OAuth client secrets, etc.) and enable **GitHub secret scanning** on the repository.

**Historical check (run locally):**

```bash
git log --all --full-history -- "**/.env" ".env" "apps/mobile/.env"
```

---

## Related documentation

- `docs/API_KEYS_AND_ENV.md` — environment variables and secrets layout  
- `auth-redirect/README.md` — deploying the redirect page  
- `docs/PRODUCT_DOCUMENTATION.md` — product and architecture (including security posture)
