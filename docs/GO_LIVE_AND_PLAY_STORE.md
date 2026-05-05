# Winkly — Go live and Google Play Store

Checklist to **activate** the app (production-ready backend + build) and **publish on Google Play**.

---

## Part 1: Activate the app (make it “live”)

### 1.1 Supabase production

- [ ] Use a **production** Supabase project (or promote your current one).
- [ ] Run all migrations on production: `supabase link` (to prod project) then `supabase db push`.
- [ ] Deploy Edge Functions (e.g. `auth-redirect`, `ai-gateway`) and set secrets (Supabase dashboard or CLI).
- [ ] In Supabase **Authentication → URL configuration**:
  - **Site URL**: your app’s production URL or `winkly://` for deep link.
  - **Redirect URLs**: add your auth-redirect URL (e.g. `https://your-project.supabase.co/functions/v1/auth-redirect`) and `winkly://callback`.

### 1.2 Environment variables (production)

- [ ] **Backend (Supabase)**  
  No extra env in the app for “backend URL” — the app uses `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` baked in at build time.

- [ ] **App build**  
  For EAS Build, set in [Expo dashboard](https://expo.dev) → Project → **Environment variables** (or in `eas.json` under the build profile’s `env`):
  - `EXPO_PUBLIC_SUPABASE_URL` — production Supabase URL
  - `EXPO_PUBLIC_SUPABASE_ANON_KEY` — production anon key
  - `EXPO_PUBLIC_AUTH_REDIRECT_URL` — production auth-redirect URL (if different from default)
  - `EXPO_PUBLIC_POSTHOG_API_KEY` (optional) — for production analytics

- [ ] Never commit real production keys to git; use EAS secrets or Expo env vars.

### 1.3 EAS project

- [ ] Install EAS CLI: `npm install -g eas-cli`
- [ ] Log in: `eas login`
- [ ] From `apps/mobile`: `eas init` to create/link an Expo project (replaces placeholder `projectId` in `app.config.js` with a real one from expo.dev).

### 1.4 OAuth (Google / Facebook) for production

- [ ] **Google**: Create OAuth 2.0 credentials in Google Cloud Console for **production** (Android: SHA-1 from your upload keystore / Play App Signing; iOS if you add it later). Add client IDs to EAS env: `EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID`, `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`. Add the Google client ID to Supabase Auth providers.
- [ ] **Facebook** (if used): Create production app, set Android key hash, add `EXPO_PUBLIC_FACEBOOK_APP_ID` and configure in Supabase.

### 1.5 Legal and support

- [ ] **Privacy policy** URL (required for Play and for many auth providers). Source: `docs/PRIVACY_POLICY.md` — host at e.g. `https://winkly.app/privacy`.
- [ ] **Terms of service** URL (recommended). Source: `docs/TERMS_OF_SERVICE.md` — host at e.g. `https://winkly.app/terms`.
- [ ] Point account/legal screens to these URLs (see `app/account/legal.tsx`). For GDPR/EEA, ensure the Privacy Policy is live before launch.
- [ ] Optional: **Community guidelines** — host and link from legal screen; see `docs/` for data protection context (`DATA_PROTECTION_AND_PRIVACY_ASSESSMENT.md`).

### 1.6 Build a production Android app

- [ ] From repo root or `apps/mobile`:  
  `eas build --platform android --profile production`
- [ ] EAS uses the `production` profile in `apps/mobile/eas.json` (Android **App Bundle** by default). First build may prompt for credentials; EAS can generate and store a keystore for you.
- [ ] Download the `.aab` from the build page when ready (needed for Play upload).

---

## Part 2: Publish on Google Play Store

### 2.1 Google Play Developer account

- [ ] Register at [Google Play Console](https://play.google.com/console) — **one-time $25** fee.
- [ ] Complete account details (name, address, etc.).

### 2.2 Create the app in Play Console

- [ ] **Create app**: Enter app name (e.g. Winkly), default language, type (App), and confirm it’s free/paid.
- [ ] **App content** (required before first release):
  - [ ] **Privacy policy**: URL to your hosted privacy policy.
  - [ ] **App access**: If login required, provide test credentials or “All functionality available without login” if applicable.
  - [ ] **Ads**: Declare if your app contains ads (e.g. “No” if you don’t use ads).
  - [ ] **Content rating**: Complete the questionnaire and upload the rating (e.g. IARC).
  - [ ] **Target audience**: Age groups.
  - [ ] **News app** (if applicable): Declare.
  - [ ] **COVID-19 contact tracing** (if applicable): Declare.
  - [ ] **Data safety**: Declare what data you collect and how it’s used (align with your privacy policy and PostHog/Supabase usage).

### 2.3 Store listing

- [ ] **Main store listing**: Short description, full description, app icon (512×512), feature graphic (1024×500), screenshots (phone and optionally 7" tablet).
- [ ] **Categorization**: Choose category (e.g. Social, Dating, or Lifestyle).

### 2.4 Upload the app bundle and release

- [ ] In Play Console: **Release** → **Production** (or start with **Internal testing** / **Closed testing**).
- [ ] **Create new release** → Upload the **.aab** from EAS Build.
- [ ] Set **Release name** (e.g. “1.0.0 (1)”).
- [ ] Add **Release notes** for “What’s new”.
- [ ] **Review and roll out** (or start rollout).

### 2.5 Optional: Automated submissions with EAS Submit

- [ ] Create a **Google Play service account** with access to your app in Play Console, download JSON key.
- [ ] Save the key as `google-service-account.json` (e.g. in `apps/mobile/`) and reference it in `eas.json` under `submit.production.android.serviceAccountKeyPath` (or use EAS secrets).
- [ ] After a successful build:  
  `eas submit --platform android --latest --profile production`  
  to upload the last build to the track set in the submit profile (e.g. `internal` for testing first).

---

## Quick command reference

| Goal | Command (from repo root or `apps/mobile`) |
|------|------------------------------------------|
| Link EAS project | `cd apps/mobile && eas init` |
| Production Android build (AAB) | `eas build --platform android --profile production` |
| Submit last build to Play | `eas submit --platform android --latest --profile production` |

---

## Notes

- **First release**: Prefer **Internal testing** or **Closed testing** to validate install and auth before **Production**.
- **Version**: Bump `version` in `app.config.js` (and optionally `android.versionCode` if not using `autoIncrement`) for each store release.
- **iOS**: To publish on the App Store you’ll need an Apple Developer account ($99/year), then `eas build --platform ios --profile production` and submit via EAS Submit or Transporter/App Store Connect.
