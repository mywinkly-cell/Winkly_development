# Expo SDK 54 → 57 stability report (closed beta)

- **Date:** 2026-09-21
- **Upgrade commit under test:** `8276f08` (Expo SDK 57.0.x, React Native 0.86.3, React 19.2.3)
- **Checked from:** Windows 11, Node 20.19.4, npm 11.8. **Not available on this machine:** JDK / Android SDK, Xcode / macOS, Maestro, adb, a device or emulator. Everything below that needs those is listed as *not run* and handed to you in section 7.

Headline: the JS and dependency side of the upgrade is verified. The native compile and on-device behaviour are **not** verified and cannot be from this machine. The recommendation is at the end.

---

## 1. What was checked and what happened

| # | Check | Result | Notes |
|---|-------|--------|-------|
| 1 | `npx expo-doctor` | **Was 2 errors → now 21/21 pass** | Errors were 10 patch-level version mismatches and a duplicate `react-native-screens`. Both fixed (section 2). |
| 2 | `npx expo install --check` | **Pass** ("Dependencies are up to date") | |
| 3 | Fresh `npm ci` from the committed lockfile + my changes, in a clean copy of `HEAD` | **Pass** | Same path EAS takes. Postinstall (patch-package + prune) ran; doctor is 21/21 on that fresh install too. The stale root `overrides` did not break the install. |
| 4 | `npx expo prebuild --clean` (Android) in the temp copy | **Pass** | Generated project has `newArchEnabled=true`, `edgeToEdgeEnabled=true`, Maps key, notification icon/colour, updates URL, universal-link filter. `android/` and `ios/` are not gitignored at the repo root, so the run was done **only in the temp copy**; nothing was added to the repo. |
| 5 | `npx expo prebuild --clean` (iOS) | **Not run** | Expo skips iOS generation on Windows. Substitutes: `expo config --type introspect` ran every iOS + Android config plugin with exit 0 (iOS 17 `NSCalendarsFullAccess…` / `NSRemindersFullAccess…` keys present, Google Maps key present, associated domains present); the SDK 57 template Podfile and all podspecs were read for the deployment target (section 4). CocoaPods resolution / Xcode compile is unproven. |
| 6 | `npx expo export --platform ios --platform android` (Metro + Hermes compile) | **Pass** | Both bundles compiled to Hermes bytecode (~11 MB each). Proves every import resolves and compiles under SDK 57. |
| 7 | `npm run typecheck` | **Pass** | |
| 8 | `npm test` | **Pass** | 32 suites, 253 tests. |
| 9 | `npm run lint` | **FAIL: 297 errors, 95 warnings** | See section 5, risk M5. Caused by the upgrade, not by the fixes here. Not runtime bugs. |
| 10 | Maestro critical path | **Not run** | Tool not installed here; commands in section 7. |

The working tree contained another session's uncommitted Business-mode work while I ran 7–9, so those results include it.

---

## 2. Changes made (dependency fixes only)

`apps/mobile/package.json` (patch bumps to the SDK 57 expected versions via `npx expo install`):

| Package | Was | Now |
|---|---|---|
| expo | ^57.0.22 | ~57.0.24 |
| expo-calendar | ~57.0.3 | ~57.0.4 |
| expo-constants | ^57.0.18 | ~57.0.19 |
| expo-contacts | ~57.0.5 | ~57.0.6 |
| expo-image-manipulator | ~57.0.17 | ~57.0.19 |
| expo-image-picker | ~57.0.17 | ~57.0.19 |
| expo-location | ~57.0.17 | ~57.0.19 |
| expo-notifications | ^57.0.18 | ~57.0.20 |
| expo-router | ^57.0.21 | ~57.0.22 |
| expo-updates | ^57.0.22 | ~57.0.23 |

`package-lock.json`: same bumps, plus removal of the stale nested `node_modules/expo-router/node_modules/react-native-screens@4.28.0`. `expo-router` accepts `^4.26.0`, so the app's hoisted 4.26.2 satisfies it and the duplicate native module is gone. (A full `npm dedupe` was rejected: it rewrote ~60 unrelated packages.)

Not changed on purpose: no app source, no `app.config.js`, no `babel.config.js`, no lint rules.

---

## 3. Native dependency audit

Every dependency in `apps/mobile/package.json` was compared to SDK 57's own `expo/bundledNativeModules.json`. **All installed versions match their SDK 57 expected version** (patch differences such as `expo-contacts` 57.0.6 vs `~57.0.5` fall inside the range). JS-only packages (fonts, supabase, axios, i18next, posthog, zustand-style libs) are omitted.

| Package | Installed | SDK 57 expected | Known SDK 57 / New Architecture note | Risk |
|---|---|---|---|---|
| react-native | 0.86.3 | 0.86.3 | New Arch is mandatory (cannot be disabled). RN 0.86 has no breaking changes per Expo. 0.86.2/0.86.3 fix the Hermes V1 memory + startup regressions, so we are on the fixed patch. | Low |
| react-native-reanimated | 4.5.1 | 4.5.1 | Expo bumped 4.5.0 → 4.5.1 (expo/expo#47518). Used in **one** file (`MatchCelebration.tsx`). Redundant `react-native-reanimated/plugin` in `babel.config.js` is applied twice: **tested harmless** (byte-identical output with and without it). | Low |
| react-native-worklets | 0.10.1 | 0.10.1 | expo-modules-core C++ compiles against ≤ 0.10, so this is the ceiling. Do not bump past it. | Low |
| react-native-maps | 1.27.2 | 1.27.2 | Fabric-compatible (needs RN ≥ 0.81.1). **iOS + Google provider: `Marker`/`Circle` use the legacy (non-Fabric) path** (see M1). Google iOS Fabric views shipped in 1.27.2 are `MapView` and `Polygon` only. | **Medium** |
| expo-notifications | 57.0.20 | ~57.0.20 | Loaded lazily (`lib/notifications.ts`). 57.x changelog has no user-facing changes. Plugin is present; `aps-environment` is `development` in the config and must be confirmed on a real store/TestFlight build. Android push needs `google-services.json` (M4). | Low–Med |
| expo-calendar | 57.0.4 | ~57.0.4 | 57.0.3 fixed Android **release-build** failure "Event could not be saved" (ProGuard stripped fields). We include it. 57.0.4 fixes iOS write-only access. Config has the iOS 17 full-access keys. | Low (needs device test) |
| expo-router | 57.0.22 | ~57.0.22 | Upgrade commit already adapted imports (`ImperativeRouter`, `expo-router/tabs`, `expo-router/native-stack`). `expo-router` config plugin is **not** in `app.config.js` (it wasn't in SDK 54 either): it only adds an optional iOS activity type and a react-native-screens "gamma" flag. Not added, to avoid changing native build settings. | Low |
| react-native-screens | 4.26.2 | ~4.26.0 | Duplicate fixed. | Low |
| expo-updates | 57.0.23 | ~57.0.23 | 57.0.23 fixes bundle-diff application against the embedded bundle. **OTA runtime-version hazard, see H1.** | **High (config)** |
| expo-image-manipulator + expo-dynamic-image-crop | 57.0.19 / 1.4.51 | ~57.0.19 / n/a | The crop lib is patched (`patches/…`) to accept manipulator ^14 and its nested copies are pruned so it uses the hoisted 57 module. Its only manipulator call is `manipulateAsync`, which SDK 57 still exports (the app calls the same function). API-compatible; on-device crop must be tested (M3). | Medium |
| expo-contacts | 57.0.6 | ~57.0.5 | App uses `expo-contacts/legacy` (adapted in the upgrade commit). | Low |
| expo-audio | 57.0.5 | ~57.0.5 | Background playback enabled → adds a media-playback foreground service (L4). | Low |
| expo-web-browser (video link-out) | 57.0.3 | ~57.0.3 | The "Daily" link-out is `WebBrowser.openBrowserAsync(room_url)` with a URL from the `video-call-session` edge function. **There is no native Daily SDK**, so no New Arch native risk. | Low |
| Google Places | n/a | n/a | Places calls are server-side only (edge functions). No Places native/JS library on the client. Only the Maps SDK via react-native-maps. | n/a |
| @gorhom/bottom-sheet | 5.2.14 (JS) | n/a | Supports Reanimated 4. | Low |
| Sentry, async-storage, netinfo, datetimepicker, slider, svg, gesture-handler, safe-area-context, secure-store, location, image-picker, splash-screen, apple-authentication, blur, crypto, haptics, device, application, font, localization, linking, status-bar, constants, file-system, dev-client, auth-session | all match | all match | No known SDK 57 issues found. | Low |

---

## 4. Platform targets

- **Android `targetSdkVersion`: 36 ✔.** Not set in `app.config.js`; it resolves from React Native 0.86.3's Gradle version catalog via Expo's root project plugin (`targetSdk = 36`, `compileSdk = 36`, `minSdk = 24`, build-tools 36.0.0). The generated `android/app/build.gradle` uses `rootProject.ext.targetSdkVersion`. This was read from source and the generated project; Gradle itself was not executed here. Optional hardening: pin it explicitly with `expo-build-properties` (not installed) so it can't drift with a future RN bump.
- **iOS deployment target: 16.4 ✔.** The SDK 57 prebuild template sets `platform :ios, '16.4'` and the app does not override it. All 42 Expo podspecs require exactly 16.4 (`ExpoSplashScreen` included), so 16.4 is the SDK 57 floor. Consequence: **iPhones that cannot run iOS 16.4 are no longer supported** (SDK 54 supported iOS 15.1).
- New Architecture on, edge-to-edge on (mandatory on Android 15+/target 36).

---

## 5. Risks, ranked

### High
**H1. OTA runtime version collides across SDK 54 and SDK 57.** `version` is `"1.0.0"` before and after the upgrade and `runtimeVersion.policy` is `"appVersion"`, so an SDK 54 binary and an SDK 57 binary both report runtime `1.0.0`. An `eas update` published from SDK 57 code to a channel where any SDK 54 build is installed would be delivered to that build and crash it (mismatched native modules). The same is true in reverse after a rollback. **Before publishing any OTA:** bump `version` (e.g. 1.1.0) or switch to `runtimeVersion: { policy: "fingerprint" }`, and make sure no SDK 54 testers exist on the channel. Not changed here (config/policy decision).

### Medium
**M1. iOS + Google Maps provider under New Architecture (react-native-maps 1.27.2).** `MapPinPickerModal` uses Google on Android always, and on iOS whenever a Maps key is configured. On iOS+Google, `Marker` takes the legacy path (`fabricMarker = false`) and `Circle` likewise, relying on React Native's interop layer. Source review shows only `MapView` and `Polygon` have Google iOS Fabric views in 1.27.2; upstream added iOS Google Marker Fabric support in 1.29.0 (release notes; not verified on a device). Unverified without a device: pins may not render or may crash. **Cheapest mitigation:** for the first iOS beta, don't set the iOS Maps key (provider falls back to Apple Maps, whose Marker/Circle are Fabric-native), or test the pin picker on an iPhone first. Bumping to 1.29.x is possible but leaves the SDK-expected version and needs `expo.install.exclude`.

**M2. Native compile is unverified.** Android Gradle and iOS CocoaPods/Xcode builds could not run here. The first EAS build is the real test; Android prebuild, iOS config-plugin evaluation and Metro/Hermes bundling all passed.

**M3. Image crop stack.** `expo-dynamic-image-crop` runs on a patched dependency range plus a postinstall prune (`scripts/prune-expo-dynamic-image-crop-nested.mjs`). API check passes, but this path can only be proven by cropping a profile photo on both platforms. `npm ls` will report it as "invalid" by design; expo-doctor does not.

**M4. Android push needs `google-services.json`.** `app.config.js` only wires it up if the file exists locally (git-ignored); it does not exist on this machine, so an EAS build from a clean checkout will have no FCM config unless it is provided to EAS. Without it Android push tokens fail. Pre-existing, not caused by SDK 57, but it gates the beta.

**M5. Lint is red (297 errors / 95 warnings, 80 files).** `eslint-plugin-react-hooks` went 5.2.0 → 7.1.1 with `eslint-config-expo` 10 → 57, which switched on React Compiler rules: `react-hooks/refs` 146, `set-state-in-effect` 96, `static-components` 23, `preserve-manual-memoization` 13, `purity` 3, `immutability` 2, `use-memo` 1, plus `react/no-unescaped-entities` 13. These are guidance about patterns, not runtime crashes. Fixing 80 files is out of scope; the decision is yours: either fix them over time, or set those seven rules to `"warn"` in `apps/mobile/eslint.config.js` to get CI green. I did not change lint policy.

### Low
- **L1.** Duplicate reanimated Babel plugin: verified harmless; can be deleted later (`babel-preset-expo` already adds the worklets plugin). `babel.config.js` still has an "SDK 54" header comment.
- **L2.** `userInterfaceStyle: "light"` has no effect on Android without `expo-system-ui` (prebuild warns). Android users in system dark mode may see inconsistent status/nav bar styling.
- **L3.** `expo-router` plugin absent (see section 3): optional.
- **L4. Store-review surface (not verified whether new in SDK 57).** iOS Info.plist gets generic default strings from auto-applied plugins ("Allow $(PRODUCT_NAME) to access your camera / photos / Face ID / motion", and *Location Always* strings although the app only asks When-In-Use). TestFlight external beta goes through App Review, so vague purpose strings and unused "Always" location are worth cleaning up. Android manifest includes `WRITE_CONTACTS`, `SYSTEM_ALERT_WINDOW`, `VIBRATE`, legacy storage (≤ API 32) and `FOREGROUND_SERVICE_MEDIA_PLAYBACK`; Play Console will ask about foreground-service types and contacts use.
- **L5.** Root `package.json` `overrides` still pin SDK 54 versions (`expo-file-system` 19.0.23, `expo-image-manipulator` 14.0.8, …). npm does not apply them to the workspace's own SDK 57 deps (installed versions are 57.x; `npm ci` succeeds), but they are stale and confusing. Leave until after beta, then clean up.
- **L6.** After the Business-mode "coming soon" commit, `.maestro/flows/mode-selection.yaml` still asserts the text `Business` and taps `Events`; re-check it against the new tile.

---

## 6. Device test checklist (must pass before wider distribution)

Run on one iPhone (iOS ≥ 16.4) and one Android phone (Android 14/15), from a `preview` EAS build:

1. Cold start, sign-up, onboarding, mode selection, first discover screen (this is `critical-path.yaml`).
2. Photo pick → crop → upload (M3), profile photo shows correctly.
3. Concierge → confirm → **Add to planner** creates a device calendar event; on Android this must be a **release/minified** build (expo-calendar fix); grant and deny calendar permission on iOS 17+.
4. Map pin picker: pin renders, moves, radius circle draws (M1); do iOS with and without a Maps key.
5. Push: permission prompt, token registers, a test push arrives foreground and background on both platforms (M4, `aps-environment`).
6. Match celebration animation (only Reanimated screen).
7. Video call link-out opens the in-app browser and the room loads.
8. Deep links: `winkly://` and `https://mywinkly.de/app/...` on both platforms.
9. Background/foreground the app, rotate, low-memory kill and relaunch (Hermes V1 fixes are in 0.86.3, worth a soak).

---

## 7. Commands for what could not run here

Maestro needs a booted emulator/simulator with an installed `com.winkly.app` build and a confirmed test account on a **test** Supabase project (see `.maestro/README.md`).

```bash
# one-time: install Maestro (macOS/Linux; Windows: see maestro docs, Android only)
curl -Ls "https://get.maestro.mobile.dev" | bash

# Android: build an installable APK on EAS, install, run
cd apps/mobile
eas build --profile preview --platform android
adb install path/to/downloaded.apk
npm run test:e2e:android          # maestro test --device emulator-5554 ... .maestro/critical-path.yaml

# iOS (macOS only): simulator build, install, run
eas build --profile development --platform ios --local   # or: npx expo run:ios
npm run test:e2e:ios              # maestro test --device "iPhone 16" ...
```

iOS prebuild check (macOS/Linux only; do it in a temp copy or add `ios/` and `android/` to ignore before running):

```bash
cd apps/mobile && npx expo prebuild --clean --platform ios
```

---

## 8. Rollback recipe (only if device testing fails)

**Do not blindly run `git revert 8276f08`.** That commit mixes three things: the SDK bump (4 dependency/config files), **29 source files** of D0 design-system work on the planning flow, and 9 small SDK-coupled import edits inside those. A plain revert would also undo the D0 planning-flow work and conflict with later commits (`57eddac`, `726b3f9`, `5afdfb0`). No commit after `8276f08` touched `package.json`, the lockfile, `app.config.js` or `tsconfig.json`.

### A. Surgical rollback to SDK 54 (recommended)
Parent of the upgrade is `9bd4c48` (last SDK 54 state).

```bash
git switch -c rollback/sdk54
git checkout 9bd4c48 -- apps/mobile/package.json package-lock.json apps/mobile/tsconfig.json apps/mobile/app.config.js
```

Then undo the nine SDK-57-only imports (nothing else in those files needs to change):

| File | Change back to |
|---|---|
| `app/account/invite.tsx`, `app/groups/invite-to-group.tsx` | `import * as Contacts from "expo-contacts";` |
| `lib/contacts/matching.ts` | `import type * as Contacts from "expo-contacts";` |
| `components/layout/MainTabBar.tsx` | `import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";` |
| `lib/navigation/screenOptions.ts` | `import type { NativeStackNavigationOptions } from "@react-navigation/native-stack";` |
| `lib/account/accountTypeSwitch.ts`, `lib/auth/postAuthRouting.ts`, `lib/chats/peerProfileNavigation.ts`, `lib/social/planTogether.ts` | `ImperativeRouter` → `Router` (type import from `expo-router`, and every use in the file) |

Then:

```bash
npm ci
cd apps/mobile
npx expo install --check     # must report SDK 54 versions as correct
npm run typecheck && npm test
```

`patches/expo-dynamic-image-crop+1.4.51.patch` was written for SDK 54 (manipulator ^14.0.8) and works unchanged.

### B. Same pins via `npx expo install`
If you prefer to regenerate instead of restoring the lockfile:

```bash
cd apps/mobile
npx expo install expo@~54.0.35
npx expo install --fix
```

Reference pins (from `9bd4c48`, 46 packages changed by the upgrade): `expo@~54.0.35`, `react-native@0.81.5`, `react@19.1.0`, `react-dom@19.1.0`, `expo-router@~6.0.24`, `expo-notifications@~0.32.17`, `expo-calendar@~15.0.8`, `expo-contacts@~15.0.8`, `expo-location@~19.0.8`, `expo-image-picker@~17.0.11`, `expo-image-manipulator@~14.0.8`, `expo-file-system@~19.0.23`, `expo-updates@~29.0.18`, `expo-audio@~1.1.1`, `expo-splash-screen@~31.0.13`, `react-native-maps@1.20.1`, `react-native-reanimated@~4.1.1`, `react-native-worklets@0.5.1`, `react-native-screens@~4.16.0`, `react-native-gesture-handler@~2.28.0`, `react-native-safe-area-context@~5.6.0`, `react-native-svg@15.12.1`, `@sentry/react-native@~7.2.0`, `@react-native-community/datetimepicker@8.4.4`, `@react-native-community/netinfo@11.4.1`, `@react-native-community/slider@5.0.1`, `babel-preset-expo@~54.0.10`, `eslint-config-expo@~10.0.0`, `jest-expo@^54.0.17`, `typescript@~5.9.2`, `@types/react@~19.1.10`, and the remaining `expo-*` packages at their `~x.0.y` SDK 54 versions. `git show 9bd4c48:apps/mobile/package.json` is the authoritative list. Approach A avoids retyping it.

### C. Things that bite after a rollback
- Every tester must **reinstall** a new SDK 54 build; native modules differ.
- Bump `version` first (see H1), or an SDK 57 binary will accept an SDK 54 OTA on runtime `1.0.0` and vice versa.
- The eslint React Compiler errors disappear (`eslint-plugin-react-hooks` back to 5.2.0).
- iOS deployment target goes back to 15.1 and the Android RN catalog to its SDK 54 values.

---

## 9. Manual to-do list

1. Decide H1 (bump `version` or fingerprint policy) **before** any `eas update`.
2. Provide `google-services.json` to EAS for Android push (M4) and confirm FCM credentials.
3. Decide the iOS Google Maps key for the first beta (M1).
4. Run the EAS preview builds and the section 6 device checklist; run Maestro (section 7).
5. Decide the lint policy (M5).
6. Optional clean-up: L1 (Babel plugin), L2 (`expo-system-ui`), L4 (permission strings / Play declarations), L5 (stale `overrides`).

---

## 10. Recommendation

**GO for an EAS `preview` build** (Android APK + iOS TestFlight/internal) so the native compile and the device checklist can actually run. Everything that can be proven without a device passes: doctor 21/21, versions match SDK 57, `npm ci` from the lockfile, Android prebuild, iOS plugin evaluation, both Metro/Hermes bundles, typecheck, 253 tests, `targetSdk 36`, iOS 16.4.

**NO-GO, until the conditions below are met, for** the `production` profile, store submission, or any `eas update`:

1. H1 resolved (runtime version), otherwise an OTA can brick installed SDK 54 builds.
2. Section 6 checks 1-5 pass on real iOS and Android devices, in particular the calendar (Android release build), image crop, map pin (iOS with a Maps key) and push.
3. First EAS build succeeds for both platforms (M2).

If any of those fail and cannot be fixed quickly, use rollback A.
