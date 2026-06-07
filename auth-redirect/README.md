# Auth Redirect Page

Fixes verification links when they open in Gmail or in-app browsers. The redirect page must be served with `Content-Type: text/html` or the browser shows raw HTML instead of running the script.

## Option 1: Supabase Edge Function (recommended)

Supabase Storage can serve HTML as plain text. The Edge Function ensures correct headers.

### 1. Deploy the function

From the project root (Winkly_development):

```powershell
npm run supabase:deploy-auth-redirect
```

If prompted, run `npx supabase login` once, then `npx supabase link --project-ref YOUR_PROJECT_REF` to link to your project.

### 2. Add URL to Supabase Redirect URLs

1. **Supabase Dashboard** → **Authentication** → **URL Configuration** → **Redirect URLs**
2. Add: `https://YOUR_PROJECT_REF.supabase.co/functions/v1/auth-redirect`
   (Replace `YOUR_PROJECT_REF` with your Supabase project ID)
3. Save

### 3. App config

In `apps/mobile/.env`:

```
EXPO_PUBLIC_AUTH_REDIRECT_URL=https://YOUR_PROJECT_REF.supabase.co/functions/v1/auth-redirect
```

Restart Expo after changing `.env`.

### 4. CSRF secret (production)

In **Supabase Dashboard → Edge Functions → Secrets**, set **`AUTH_REDIRECT_STATE_SECRET`** (random, ≥ 16 characters). Redeploy `auth-redirect`. The mobile app mints `winkly_state` before sign-up / password reset emails when using this HTTPS URL.

---

## Option 2: Supabase Storage (can show HTML as source)

If Storage serves with correct `Content-Type: text/html`, this works. Otherwise use Option 1.

1. Create public bucket `auth-redirect`
2. Upload `index.html` to the bucket root
3. Add the Storage public URL to Supabase Redirect URLs
4. Set `EXPO_PUBLIC_AUTH_REDIRECT_URL` to that URL

---

## Option 3: Vercel

If using Vercel, disable **Deployment Protection** so the page is public.

---

## Security notes

- **JWT verification:** Email and magic links open in a **browser** without a Supabase session JWT. Keep **`verify_jwt = false`** in **`supabase/config.toml`** (`[functions.auth-redirect]`). Deploy with `npm run supabase:deploy-auth-redirect` — **do not** pass `--no-verify-jwt` on the CLI; **`config.toml`** is the source of truth.
- **CSRF (`winkly_state`):** When **`AUTH_REDIRECT_STATE_SECRET`** is set, the function rejects requests without a valid signed `winkly_state` query param. See **SECURITY.md**.
- **What it does:** This endpoint returns **static HTML** only. OAuth/session tokens in the **URL fragment** are not visible to the server; the page forwards them to the app deep link. See **SECURITY.md** in the repo root for the full threat model and operational checklist (RLS, rate limits, repo visibility).
