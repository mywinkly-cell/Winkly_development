# EAS Build, Submit & GitHub Actions

**Last updated:** 2026-06-06

This doc covers Expo Application Services (EAS) profiles, credential storage, and the automated submit pipeline that runs when code merges to `main`.

---

## 1. Build profiles (`apps/mobile/eas.json`)

| Profile | `APP_ENV` | Distribution | Use case |
| ------- | --------- | ------------ | -------- |
| **development** | `development` | Internal dev client | Local dev builds with `expo-dev-client` |
| **preview** | `staging` | Internal (TestFlight + Play internal) | Pre-prod QA on real devices |
| **staging** | `staging` | Same as `preview` (`extends`) | Backward-compatible alias |
| **production** | `production` | Store (AAB for Play) | Public release builds |

Signing credentials (iOS distribution cert + provisioning profile, Android keystore) are stored **remotely in EAS** — not in git. Configure once per machine:

```bash
cd apps/mobile
eas login
eas credentials   # iOS + Android — EAS generates or uploads certs/keystores
```

`cli.appVersionSource: "remote"` lets EAS manage build numbers on the server (`autoIncrement` on production).

---

## 2. EAS environment variables

Set in [Expo dashboard](https://expo.dev) → Project → **Environment variables**, scoped per environment (`development`, `preview`, `production`):

| Variable | Required for |
| -------- | ------------ |
| `EXPO_PUBLIC_SUPABASE_URL` | All non-dev builds |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | All non-dev builds |
| `EXPO_PUBLIC_AUTH_REDIRECT_URL` | Email auth (HTTPS redirect) |
| `EXPO_PUBLIC_EAS_PROJECT_ID` | Push notifications |
| `EXPO_PUBLIC_POSTHOG_API_KEY` | Analytics (optional) |
| `EXPO_PUBLIC_SENTRY_DSN` | Crash reporting (optional) |

`npm run validate-env` (hooked via `eas-build-pre-install`) **fails staging/production builds** when required vars are missing or placeholders.

---

## 3. Manual builds

```bash
cd apps/mobile

eas build --profile development --platform android
eas build --profile preview --platform all
eas build --profile production --platform android
```

Submit the latest build manually:

```bash
eas submit --platform ios --latest --profile preview      # TestFlight internal
eas submit --platform android --latest --profile preview  # Play internal track
```

---

## 4. GitHub Actions — CI (every PR)

`.github/workflows/ci.yml` runs three jobs on every pull request and on pushes to `main` / `develop`:

- **Lint** — `npm run mobile:lint`
- **Typecheck** — `npm run mobile:typecheck` (TypeScript `strict` + `noImplicitAny`)
- **Unit tests** — `npm run mobile:test` (Jest)

### Block merge on failure

In GitHub **Settings → Branches → Branch protection rules** for `main` and `develop`, require these status checks:

- `Lint`
- `Typecheck`
- `Unit tests`

See `docs/BRANCHING.md` for the full protection checklist.

---

## 5. GitHub Actions — EAS submit (merge to `main`)

`.github/workflows/eas-submit.yml` triggers on every push to `main`:

1. Installs dependencies
2. Authenticates with EAS (`EXPO_TOKEN`)
3. Writes the Google Play service account JSON (if configured)
4. Runs `eas build --profile preview --platform all --non-interactive --auto-submit`

This uploads to **TestFlight** (iOS internal) and the **Google Play internal track** (Android).

### Required GitHub secrets

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

## 6. Quick reference

| Goal | Command |
| ---- | ------- |
| Reproduce CI locally | `npm run ci` |
| Dev client build | `eas build --profile development --platform android` |
| Internal QA build | `eas build --profile preview --platform all` |
| Production AAB | `eas build --profile production --platform android` |
| Submit last preview build | `eas submit --platform all --latest --profile preview` |
