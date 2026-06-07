# EAS Build, Submit & GitHub Actions

**Last updated:** 2026-06-06

This doc covers Expo Application Services (EAS) profiles, credential storage, and how builds relate to the **two-repo** workflow (`WinklyApp_3` vs `winkly-production`). See **docs/BRANCHING.md**.

---

## 1. Which repo runs which build

| Build type | Git checkout | EAS profile | Purpose |
| ---------- | ------------ | ----------- | ------- |
| **Dev client** | `WinklyApp_3` (any branch) | `development` | Local dev with `expo-dev-client` |
| **Internal QA** | `WinklyApp_3` `main` or `develop` | `preview` | TestFlight + Play internal — pre-promotion smoke tests |
| **Store release** | **`winkly-production` `main` only** | `production` | Google Play AAB / App Store — shipped binaries |

**Rule:** `eas build --profile production` must run from a checkout of [**winkly-production**](https://github.com/mywinkly-cell/winkly-production) **`main`**, not from `WinklyApp_3`. That guarantees what ships is always the clean production snapshot.

---

## 2. Build profiles (`apps/mobile/eas.json`)

| Profile | `APP_ENV` | Distribution | Use case |
| ------- | --------- | ------------ | -------- |
| **development** | `development` | Internal dev client | Local dev builds with `expo-dev-client` |
| **preview** | `production` | Internal (TestFlight + Play internal) | Pre-release QA on real devices (winkly-production Supabase backend) |
| **staging** | `production` | Same as `preview` (`extends`) | Backward-compatible alias |
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
| `EXPO_PUBLIC_EAS_PROJECT_ID` | Push notifications |
| `EXPO_PUBLIC_POSTHOG_API_KEY` | Analytics (optional) |
| `EXPO_PUBLIC_SENTRY_DSN` | Crash reporting (optional) |

`npm run validate-env` (hooked via `eas-build-pre-install`) **fails production builds** when required vars are missing or placeholders.

---

## 4. Manual builds

### From WinklyApp_3 (development / preview only)

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

Preview submit (internal track) — typically from `WinklyApp_3` after a preview build:

```bash
eas submit --platform ios --latest --profile preview      # TestFlight internal
eas submit --platform android --latest --profile preview  # Play internal track
```

---

## 5. GitHub Actions — CI (`WinklyApp_3` only)

`.github/workflows/ci.yml` runs three jobs on every pull request and on pushes to `main` / `develop`:

- **Lint** — `npm run mobile:lint`
- **Typecheck** — `npm run mobile:typecheck` (TypeScript `strict` + `noImplicitAny`)
- **Unit tests** — `npm run mobile:test` (Jest)

### Block merge on failure

In **WinklyApp_3** **Settings → Branches**, require these status checks on `main` and `develop`:

- `Lint`
- `Typecheck`
- `Unit tests`

See `docs/BRANCHING.md` for the full protection checklist.

---

## 6. GitHub Actions — preview submit (`WinklyApp_3` only)

`.github/workflows/eas-submit.yml` triggers on every push to **`WinklyApp_3` `main`**:

1. Installs dependencies
2. Authenticates with EAS (`EXPO_TOKEN`)
3. Writes the Google Play service account JSON (if configured)
4. Runs `eas build --profile preview --platform all --non-interactive --auto-submit`

This uploads to **TestFlight** (iOS internal) and the **Google Play internal track** (Android) for **pre-promotion QA**. It does **not** replace the production store build from `winkly-production`.

### Required GitHub secrets (`WinklyApp_3`)

| Secret | How to obtain |
| ------ | ------------- |
| `EXPO_TOKEN` | [expo.dev](https://expo.dev) → Account → Access tokens → Create |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Full JSON from Google Cloud (Play Console release permissions). See `docs/GO_LIVE_AND_PLAY_STORE.md` §2.5 |

### iOS (TestFlight)

Apple credentials are managed in EAS (not GitHub). One-time setup:

```bash
cd apps/mobile
eas credentials -p ios
```

Ensure the App Store Connect app exists for bundle id `com.winkly.app`. EAS Submit uses stored credentials automatically.

### Disable auto-submit temporarily

Comment out the workflow trigger or add `if: false` on the build step while setting up credentials for the first time.

---

## 7. Quick reference

| Goal | Where | Command |
| ---- | ----- | ------- |
| Reproduce CI locally | `WinklyApp_3` | `npm run ci` |
| Dev client build | `WinklyApp_3` | `eas build --profile development --platform android` |
| Internal QA build | `WinklyApp_3` | `eas build --profile preview --platform all` |
| **Production AAB** | **`winkly-production/main`** | `eas build --profile production --platform android` |
| Submit last preview build | `WinklyApp_3` | `eas submit --platform all --latest --profile preview` |
| Submit store release | `winkly-production` | `eas submit --platform all --latest --profile production` |
