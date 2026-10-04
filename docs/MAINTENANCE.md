# Keeping Winkly running with little attention

A released build does not break when Expo ships a new SDK. Installed apps keep running the code they
were built with. What forces work is a short list of outside deadlines, plus finding out quickly when
something does break. This doc covers both.

## What is automated

| Mechanism | Where | What it does |
|-----------|-------|--------------|
| Dependabot (patch/minor only) | `.github/dependabot.yml` | Weekly PRs for safe updates inside the current Expo SDK, monthly for GitHub Actions. Expo SDK jumps and the React Native / React / native-library versions they pin are **ignored**, so they never arrive as surprise PRs. |
| CI | `.github/workflows/ci.yml` | Lint (0 errors), typecheck, Jest and i18n audit on every PR. Merge a Dependabot PR only when it is green. |
| Background OTA check | `lib/release/otaUpdates.ts` | On launch and when the app returns to the foreground (at most every 6 h), downloads a newer EAS Update in the background. It applies on the next cold start. Launch is never blocked (`checkAutomatically: ON_ERROR_RECOVERY` stays, see RUNBOOK §6). |
| Fingerprint runtime version | `app.config.js` → `runtimeVersion.policy: "fingerprint"` | An OTA update only reaches binaries with identical native code. A JS bundle built on one SDK can't reach, and crash, a build from another. No manual version bumps needed. |
| Force-update gate | `components/ForceUpdateGate.tsx`, table `public.app_release_policy` | Blocks builds below a minimum build number with an "Update required" screen and a store link. |
| Crash reporting | Sentry (`lib/monitoring/sentry.ts`) | Set up alerts once (below) so crashes reach you instead of waiting to be looked at. |

## Shipping a fix

- **JS-only fix** (no new native module or config plugin change): `cd apps/mobile && eas update --channel production --environment production --message "…"`. Users get it on their next launch after the background download.
- **Native change or SDK upgrade**: new store build (`eas build --profile production`).

Use `--environment production` so the fingerprint is computed with the same config as the build. A
mismatched fingerprint means the update reaches nobody. It never means a crash.

## Forcing old versions to update

Do this when a backend change (database, edge function) would break older app builds:

1. Ship the new build to the stores and wait until it is live.
2. In Supabase (Table editor → `app_release_policy`, or SQL):
   ```sql
   UPDATE public.app_release_policy SET min_build = <new build number>, updated_at = now() WHERE platform = 'android';
   ```
   The build number is the Android versionCode / iOS build number shown in EAS for that build.
3. For iOS, set `store_url` once to the App Store link (`https://apps.apple.com/app/id<APP_ID>`) after the first App Store release.

`min_build = 0` (the default) blocks nobody. If the check fails (offline, Supabase down), the app opens normally.

Apply the migration first: `npm run supabase:push:development`, then `npm run supabase:push:production`.

## One-time setup (outside the repo)

- [ ] **Sentry alerts:** Alerts → create an issue alert ("a new issue is created") and a metric alert on crash-free session rate (e.g. below 99 %), sent by email or to your phone.
- [ ] **Uptime check** on the Supabase edge functions / auth-redirect URL (e.g. a free monitor such as UptimeRobot or Better Stack).
- [ ] **Supabase:** confirm the production project is on a paid plan (free projects pause when inactive) and backups are enabled.
- [ ] **Calendar reminders** for the yearly items below.

## Calendar

| When | Task | Why |
|------|------|-----|
| Weekly (2 min) | Merge green Dependabot PRs | Security and bug fixes |
| Quarterly (~1 h) | Look at Sentry trends, Supabase usage, deprecation emails from Expo / Supabase / Google / Apple | Catch problems early |
| **Spring (before ~April)** | Check Apple's minimum Xcode/iOS SDK for App Store submissions; upgrade the Expo SDK if needed | Otherwise new iOS builds are rejected |
| **Summer (before ~31 August)** | Check Google Play's target API level requirement; upgrade the Expo SDK if needed | Otherwise Play blocks app updates |
| Yearly | Apple Developer membership, domain (mywinkly.de), push / service-account keys | Expired accounts stop releases and notifications |

## Planned Expo SDK upgrade (1–2× per year)

Do it once a year in time for the store deadlines, and don't fall more than one SDK behind:

1. Branch, then `cd apps/mobile && npx expo install expo@^<next> --fix`.
2. `npx expo-doctor` and `npx expo install --check` both clean.
3. `npm run ci` from the repo root.
4. `eas build --profile preview` on a real device, then run the Maestro critical path (`npm run mobile:test:e2e:android`).
5. Release to the internal/beta track first, then to production with a staged rollout.

`docs/SDK57_STABILITY_REPORT.md` is a worked example of this checklist.
