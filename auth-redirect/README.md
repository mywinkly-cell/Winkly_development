# Auth Redirect Page

Fixes verification links when they open in Gmail or in-app browsers. The redirect page must be served with `Content-Type: text/html` or the browser shows raw HTML instead of running the script.

## Option 1: Supabase Edge Function (recommended)

Supabase Storage can serve HTML as plain text. The Edge Function ensures correct headers.

### 1. Deploy the function

From the project root (WinklyApp_3):

```powershell
npm run supabase:deploy-auth-redirect
```

If prompted, run `npx supabase login` once, then `npx supabase link --project-ref gwgjdpqskusuejlwrsnd` to link to your project.

### 2. Add URL to Supabase Redirect URLs

1. **Supabase Dashboard** → **Authentication** → **URL Configuration** → **Redirect URLs**
2. Add: `https://YOUR_PROJECT_REF.supabase.co/functions/v1/auth-redirect`
   (Replace YOUR_PROJECT_REF with your project ID, e.g. `gwgjdpqskusuejlwrsnd`)
3. Save

### 3. App config

In `apps/mobile/.env`:

```
EXPO_PUBLIC_AUTH_REDIRECT_URL=https://gwgjdpqskusuejlwrsnd.supabase.co/functions/v1/auth-redirect
```

Replace `gwgjdpqskusuejlwrsnd` with your Supabase project ref. Restart Expo.

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
