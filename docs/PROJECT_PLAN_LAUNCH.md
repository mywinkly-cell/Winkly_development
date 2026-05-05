# Winkly — Project Plan: Ready App → APK → Publish → Promote

**Purpose:** Step-by-step plan from current status to a ready-to-use app, installable APK/AAB, verified quality, store publication, and promotion.  
**References:** [GO_LIVE_AND_PLAY_STORE.md](./GO_LIVE_AND_PLAY_STORE.md), [PRODUCT_DOCUMENTATION.md](./PRODUCT_DOCUMENTATION.md), [API_KEYS_AND_ENV.md](./API_KEYS_AND_ENV.md).

---

## Current status (summary)

- **App:** Expo SDK 54, React Native 0.81, expo-router 6; Romance, Friends, Business, Events modes; Planner; Chats (1:1 + group); Discover; AI concierge; i18n (26 languages).
- **Backend:** Supabase (Auth, Postgres, RLS, Edge Functions: auth-redirect, ai-gateway, delete-account, get-nearby-external-events).
- **Legal:** Terms and Privacy Policy written in `docs/`; need to be **hosted** at winkly.app (terms, privacy, community).
- **Build:** EAS configured (`eas.json`: development, preview [APK], production [AAB]); `app.config.js` has placeholder `projectId` until `eas init`.
- **Known gaps:** Data export not implemented; profile verification is placeholder; Terms/Privacy/Community must be live at winkly.app; EAS project not yet initialized for production.

---

## Phase 1 — Make the app ready to use

### 1.1 Backend and environment (production-ready)

| Step | Action | Done? |
|------|--------|-------|
| 1.1.1 | Use or create a **production** Supabase project; run all migrations: `supabase link` (to prod) then `supabase db push`. | ☐ |
| 1.1.2 | Deploy Edge Functions: `auth-redirect`, `ai-gateway`, `delete-account`, `get-nearby-external-events`. | ☐ |
| 1.1.3 | Set Supabase secrets (Dashboard or CLI): `OPENAI_API_KEY` or `GEMINI_API_KEY` for AI; optional `MEETUP_API_KEY`, `EVENTBRITE_PRIVATE_TOKEN`. | ☐ |
| 1.1.4 | In Supabase **Authentication → URL configuration**: Site URL (e.g. `winkly://`); Redirect URLs = auth-redirect URL + `winkly://callback`. | ☐ |
| 1.1.5 | Prepare production env for app: `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `EXPO_PUBLIC_AUTH_REDIRECT_URL`; optional PostHog, Google/Facebook OAuth. Never commit real keys; use EAS/Expo env. | ☐ |

### 1.2 Legal and support (required for stores and GDPR)

| Step | Action | Done? |
|------|--------|-------|
| 1.2.1 | **Host legal pages** at live URLs (e.g. winkly.app): Terms (`docs/TERMS_OF_SERVICE.md` → `/terms`), Privacy (`docs/PRIVACY_POLICY.md` → `/privacy`), optional Community (`/community`). | ☐ |
| 1.2.2 | Confirm in-app links (General settings → Support & legal → Legal) open: `https://winkly.app/terms`, `https://winkly.app/privacy`, `https://winkly.app/community`, and Contact (e.g. support@winkly.app). | ☐ |
| 1.2.3 | Ensure sign-up / intro flows reference Terms and Privacy Policy. | ☐ |

### 1.3 EAS and app identity

| Step | Action | Done? |
|------|--------|-------|
| 1.3.1 | Install EAS CLI: `npm install -g eas-cli`; log in: `eas login`. | ☐ |
| 1.3.2 | From `apps/mobile`: run `eas init` to create/link Expo project; this replaces placeholder `projectId` in `app.config.js` with real ID from expo.dev. | ☐ |
| 1.3.3 | In Expo dashboard (or EAS secrets), set **production** env vars for builds: `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `EXPO_PUBLIC_AUTH_REDIRECT_URL`, optional PostHog/OAuth. | ☐ |

### 1.4 OAuth (if using Google / Facebook sign-in)

| Step | Action | Done? |
|------|--------|-------|
| 1.4.1 | **Google:** Create OAuth 2.0 credentials for production (Android: SHA-1 from upload keystore / Play App Signing). Add to EAS env: `EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID` (and iOS if needed). Configure in Supabase Auth. | ☐ |
| 1.4.2 | **Facebook** (if used): Production app, Android key hash, `EXPO_PUBLIC_FACEBOOK_APP_ID`, Supabase Auth config. | ☐ |

### 1.5 Feature and quality checks (pre-build)

| Step | Action | Done? |
|------|--------|-------|
| 1.5.1 | **Smoke test** on device/emulator: sign up → onboarding → switch modes → Discover → match/connect → chat → Planner → create event → AI concierge (if tier allows). | ☐ |
| 1.5.2 | Test **email verification** flow with auth-redirect URL (open link → redirect to app). | ☐ |
| 1.5.3 | Test **account deletion** (General settings → Delete my account) and confirm data removed. | ☐ |
| 1.5.4 | Run `npm run lint` and `npm run test` in `apps/mobile`; fix blocking issues. | ☐ |
| 1.5.5 | Confirm **version** in `app.config.js`: `version: "1.0.0"` (and Android `versionCode` if not using EAS `autoIncrement`). | ☐ |

---

## Phase 2 — Create APK and AAB

### 2.1 Preview build (APK for testing)

| Step | Action | Done? |
|------|--------|-------|
| 2.1.1 | From repo root or `apps/mobile`: `eas build --platform android --profile preview`. This produces an **APK** (eas.json: `buildType: "apk"`). | ☐ |
| 2.1.2 | Download APK from EAS build page; install on physical devices for internal testing. | ☐ |

### 2.2 Production build (AAB for Play Store)

| Step | Action | Done? |
|------|--------|-------|
| 2.2.1 | Run: `eas build --platform android --profile production`. First run may prompt for **keystore**; let EAS generate and store it. | ☐ |
| 2.2.2 | Download the **.aab** from the build page when ready (required for Play upload). | ☐ |
| 2.2.3 | Keep **version** and (if used) **versionCode** in sync for each store release; bump for subsequent updates. | ☐ |

### 2.3 Optional: local / debug APK

| Step | Action | Done? |
|------|--------|-------|
| 2.3.1 | For quick device testing without EAS: `cd apps/mobile && npx expo run:android` (requires Android SDK; produces debug APK). | ☐ |

---

## Phase 3 — Ensure everything works

### 3.1 Internal testing (recommended before production)

| Step | Action | Done? |
|------|--------|-------|
| 3.1.1 | Create app in **Google Play Console** (see Phase 4). Use **Internal testing** track: upload the same .aab, add testers by email. | ☐ |
| 3.1.2 | Install from Play Console internal testing link; verify: install, open, sign up, auth redirect, core flows (Discover, Chats, Planner, Events), legal links, sign out, delete account. | ☐ |
| 3.1.3 | Optionally use **Closed testing** for a wider beta group before going to Production. | ☐ |

### 3.2 Device and OS coverage

| Step | Action | Done? |
|------|--------|-------|
| 3.2.1 | Test on at least 2–3 Android devices (different brands/OS versions) and screen sizes. | ☐ |
| 3.2.2 | Verify deep link `winkly://callback` and auth redirect on real devices. | ☐ |

### 3.3 Performance and stability

| Step | Action | Done? |
|------|--------|-------|
| 3.3.1 | Check app doesn’t crash on cold start, mode switch, and after backgrounding. | ☐ |
| 3.3.2 | If using PostHog, confirm events and identity (no PII) look correct in dashboard. | ☐ |

---

## Phase 4 — Publish on Google Play

### 4.1 Developer account and app creation

| Step | Action | Done? |
|------|--------|-------|
| 4.1.1 | Register at [Google Play Console](https://play.google.com/console) — one-time **$25** fee; complete account details. | ☐ |
| 4.1.2 | **Create app:** Name (e.g. Winkly), default language, type (App), free/paid. | ☐ |

### 4.2 App content (required before first release)

| Step | Action | Done? |
|------|--------|-------|
| 4.2.1 | **Privacy policy:** URL to hosted policy (e.g. https://winkly.app/privacy). | ☐ |
| 4.2.2 | **App access:** Provide test credentials or state “All functionality available without login” if applicable. | ☐ |
| 4.2.3 | **Ads:** Declare “No” if no ads. | ☐ |
| 4.2.4 | **Content rating:** Complete questionnaire (e.g. IARC); submit and get rating. | ☐ |
| 4.2.5 | **Target audience:** Age groups. | ☐ |
| 4.2.6 | **Data safety:** Declare data collected and how it’s used (align with Privacy Policy and PostHog/Supabase). | ☐ |
| 4.2.7 | **COVID-19 / News app:** Declare if applicable. | ☐ |

### 4.3 Store listing

| Step | Action | Done? |
|------|--------|-------|
| 4.3.1 | **Main listing:** Short description, full description, **app icon 512×512**, **feature graphic 1024×500**, **screenshots** (phone; optionally 7" tablet). | ☐ |
| 4.3.2 | **Category:** e.g. Social, Dating, or Lifestyle. | ☐ |

### 4.4 Release

| Step | Action | Done? |
|------|--------|-------|
| 4.4.1 | **Release → Production** (or start Internal/Closed first): Create new release, upload **.aab**, set release name (e.g. "1.0.0 (1)"), add release notes. | ☐ |
| 4.4.2 | **Review and roll out.** | ☐ |

### 4.5 Optional: EAS Submit (automate uploads)

| Step | Action | Done? |
|------|--------|-------|
| 4.5.1 | Create **Google Play service account** with access to app; download JSON key. | ☐ |
| 4.5.2 | In `eas.json` submit profile, set `serviceAccountKeyPath` (or use EAS secrets). | ☐ |
| 4.5.3 | After successful build: `eas submit --platform android --latest --profile production` to upload to the configured track. | ☐ |

---

## Phase 5 — Promote the app

### 5.1 Store presence (ASO)

| Step | Action | Done? |
|------|--------|-------|
| 5.1.1 | **Keywords:** Use relevant terms in short and full description (e.g. dating, friends, events, planner, AI) without stuffing. | ☐ |
| 5.1.2 | **Localization:** Add store listing translations for priority locales (e.g. DE, UK, PL, ES) to improve discoverability. | ☐ |
| 5.1.3 | **Screenshots:** Show key value (modes, Discover, Planner, AI); add short captions if helpful. | ☐ |

### 5.2 Website and landing

| Step | Action | Done? |
|------|--------|-------|
| 5.2.1 | Ensure **winkly.app** (or main domain) has: landing page, /terms, /privacy, /community, contact/support. | ☐ |
| 5.2.2 | Add **Play Store badge/link** and optional “Download on Google Play” CTA on landing. | ☐ |

### 5.3 Marketing and awareness

| Step | Action | Done? |
|------|--------|-------|
| 5.3.1 | **Social:** Create or use accounts (e.g. Instagram, Facebook, LinkedIn); link to store and website. | ☐ |
| 5.3.2 | **Content:** Blog posts, short videos, or stories explaining Winkly (multi-mode, AI, Planner, Events). | ☐ |
| 5.3.3 | **Communities:** Share in relevant dating/social/lifestyle communities (respecting each group’s rules). | ☐ |
| 5.3.4 | **Influencers / press:** Reach out to micro-influencers or local tech/lifestyle press for reviews or features. | ☐ |
| 5.3.5 | **Paid (optional):** Google UAC or social ads once store listing and landing page are solid. | ☐ |

### 5.4 Post-launch

| Step | Action | Done? |
|------|--------|-------|
| 5.4.1 | Monitor **Play Console**: crashes, ANRs, reviews, ratings; fix critical issues and respond to reviews. | ☐ |
| 5.4.2 | Use **PostHog** (or analytics) to understand retention and feature usage; iterate on onboarding and core flows. | ☐ |
| 5.4.3 | Plan **releases:** version bumps, release notes, and regular updates to improve trust and store ranking. | ☐ |

---

## Quick command reference

| Goal | Command |
|------|--------|
| Link EAS project | `cd apps/mobile && eas init` |
| Build APK (preview) | `eas build --platform android --profile preview` |
| Build AAB (production) | `eas build --platform android --profile production` |
| Submit last build to Play | `eas submit --platform android --latest --profile production` |
| Run migrations (prod) | `supabase link` then `supabase db push` |
| Deploy auth redirect | `npm run supabase:deploy-auth-redirect` (from repo root) |

---

## Optional: iOS later

- **Apple Developer account** ($99/year); then `eas build --platform ios --profile production` and submit via EAS Submit or App Store Connect/Transporter.
- Same legal pages and app behavior apply; add iOS-specific store listing and screenshots.

---

*Update this plan as you complete steps or change scope. Last updated: 2026-03-04.*
