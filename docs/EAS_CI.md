# EAS Build, Submit & GitHub Actions

**Last updated:** 2026-06-08

This doc covers Expo Application Services (EAS) profiles, credential storage, and how builds relate to the **two-repo** workflow (`Winkly_development` vs `winkly-production`). See **docs/BRANCHING.md**.

---

## 1. Which repo runs which build

| Build type | Git checkout | EAS profile | Purpose |
| ---------- | ------------ | ----------- | ------- |
| **Dev client** | `Winkly_development` (any branch) | `development` | Local dev with `expo-dev-client` |
| **Internal QA** | `Winkly_development` `main` or `develop` | `preview` | TestFlight + Play internal — pre-promotion smoke tests |
| **Store release** | **`winkly-production` `main` only** | `production` | Google Play AAB / App Store — shipped binaries |

**Rule:** `eas build --profile production` must run from a checkout of [**winkly-production**](https://github.com/mywinkly-cell/winkly-production) **`main`**, not from `Winkly_development`. That guarantees what ships is always the clean production snapshot.

---

## 2. Build profiles (`apps/mobile/eas.json`)

| Profile | `APP_ENV` | Distribution | Use case |
| ------- | --------- | ------------ | -------- |
| **development** | `development` | Internal dev client | Local dev builds with `expo-dev-client` |
| **preview** | `production` | Internal (TestFlight + Play internal) | Pre-release QA on real devices (winkly-production Supabase backend) |
| **production** | `production` | Store (AAB for Play) | **Public release — run only from `winkly-production/main`** |

Signing credentials (iOS distribution cert + provisioning profile, Android keystore) are stored **remotely in EAS** — not in git. Configure once per machine:

```bash
cd apps/mobile
eas login
eas credentials   # iOS + Android — EAS generates or uploads certs/keystores
```

`cli.appVersionSource: "remote"` lets EAS manage build numbers on the server (`autoIncrement` on production).

---

## 3. EAS environment variables

Set in [Expo dashboard](https://expo.dev) → Project → **Environment variables**, scoped per environment (`development`, `preview`, `production`):

| Variable | Required for |
| -------- | ------------ |
| `EXPO_PUBLIC_SUPABASE_URL` | All non-dev builds (`https://orjccytcmklzcfjgqwwj.supabase.co`) |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | All non-dev builds |
| `EXPO_PUBLIC_AUTH_REDIRECT_URL` | Email auth (HTTPS redirect) |
| `EXPO_PUBLIC_EAS_PROJECT_ID` | All non-dev builds | Push notifications (`5a6f6f9d-5969-4867-9572-5ee50a938066`; also in `app.config.js`) |
| `EXPO_PUBLIC_POSTHOG_API_KEY` | Analytics (optional) |
| `EXPO_PUBLIC_SENTRY_DSN` | Crash reporting (optional) |

`npm run validate-env` (hooked via `eas-build-pre-install`) **fails production builds** when required vars are missing or placeholders.

**Sync from local `.env` to EAS (production + preview):**

```bash
cd apps/mobile
npm run eas:sync-production-env          # uses .env
npm run eas:sync-production-env -- --file .env.production
```

---

## 4. Manual builds

### From Winkly_development (development / preview only)

```bash
cd apps/mobile

eas build --profile development --platform android
eas build --profile preview --platform all
```

### From winkly-production (store release)

```bash
git clone git@github.com:mywinkly-cell/winkly-production.git
cd winkly-production/apps/mobile
git checkout main && git pull

eas build --profile production --platform android
eas build --profile production --platform ios
```

Submit the latest production build:

```bash
eas submit --platform ios --latest --profile production
eas submit --platform android --latest --profile production
```

Preview submit (internal track) — typically from `Winkly_development` after a preview build:

```bash
eas submit --platform ios --latest --profile preview      # TestFlight internal
eas submit --platform android --latest --profile preview  # Play internal track
```

---

## 5. GitHub Actions — CI (`Winkly_development` only)

`.github/workflows/ci.yml` runs three jobs on every pull request and on pushes to `main` / `develop`:

- **Lint** — `npm run mobile:lint`
- **Typecheck** — `npm run mobile:typecheck` (TypeScript `strict` + `noImplicitAny`)
- **Unit tests** — `npm run mobile:test` (Jest)

### Block merge on failure

In **Winkly_development** **Settings → Branches**, require these status checks on `main` and `develop`:

- `Lint`
- `Typecheck`
- `Unit tests`

See `docs/BRANCHING.md` for the full protection checklist.

---

## 6. GitHub Actions — preview submit (`Winkly_development` only)

`.github/workflows/eas-submit.yml` triggers on every push to **`Winkly_development` `main`**:

1. Installs dependencies
2. Authenticates with EAS (`EXPO_TOKEN`)
3. Writes the Google Play service account JSON (if configured)
4. Runs `eas build --profile preview --platform all --non-interactive --auto-submit`

This uploads to **TestFlight** (iOS internal) and the **Google Play internal track** (Android) for **pre-promotion QA**. It does **not** replace the production store build from `winkly-production`.

### Required GitHub secrets (`Winkly_development`)

| Secret | How to obtain |
| ------ | ------------- |
| `EXPO_TOKEN` | [expo.dev](https://expo.dev) → Account → Access tokens → Create |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Full JSON from Google Cloud (Play Console release permissions). See `docs/GO_LIVE_AND_PLAY_STORE.md` §2.5 |

### iOS (TestFlight)

Apple credentials are managed in EAS (not GitHub). **One-time interactive setup** (cannot run inside CI):

1. Create the app in [App Store Connect](https://appstoreconnect.apple.com) for bundle id `com.winkly.app` (if it does not exist yet).
2. From a **local terminal** (not Cursor agent — prompts need stdin):

```bash
cd apps/mobile
npm run eas:setup-ios-credentials
# or: eas credentials:configure-build -p ios -e preview
```

Log in with your Apple Developer account when prompted. EAS generates and stores the distribution certificate + provisioning profile on Expo servers.

3. After App Store Connect shows the app, add its numeric **Apple ID** (`ascAppId`) to `eas.json` → `submit.preview.ios.ascAppId` so `--auto-submit` works in non-interactive CI.

**Why `preview` uses two distributions:** Android stays `internal` (Play internal track + APK). iOS overrides to `store` because TestFlight requires an App Store build — `internal` on iOS means Ad Hoc only and fails in CI with *"no credentials suitable for internal distribution"*.

`app.config.js` sets `ITSAppUsesNonExemptEncryption: false` (standard for apps that only use HTTPS).

### Disable auto-submit temporarily

Comment out the workflow trigger or add `if: false` on the build step while setting up credentials for the first time.

---

## 7. Quick reference

| Goal | Where | Command |
| ---- | ----- | ------- |
| Reproduce CI locally | `Winkly_development` | `npm run ci` |
| Dev client build | `Winkly_development` | `eas build --profile development --platform android` |
| Internal QA build | `Winkly_development` | `eas build --profile preview --platform all` |
| **Production AAB** | **`winkly-production/main`** | `eas build --profile production --platform android` |
| Submit last preview build | `Winkly_development` | `eas submit --platform all --latest --profile preview` |
| Submit store release | `winkly-production` | `eas submit --platform all --latest --profile production` |
