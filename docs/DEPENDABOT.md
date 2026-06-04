# Dependabot merge status

**Last updated:** 2026-06-04  
**Integration branch:** `chore/merge-dependabot-updates` (merge into `develop` or `main` via PR)

## Merged (SDK 54–compatible)

| Package | From → To | Notes |
|---------|-----------|--------|
| `uuid` | 13.x → **14.0.0** | Patch bump |
| `@supabase/supabase-js` | 2.105.x → **2.106.2** | Patch |
| `axios` | 1.13.x → **1.16.1** | Minor |
| `i18next` | 25.x → **26.3.0** | Major; smoke-tested via existing `lib/i18n` usage |
| `react-i18next` | 16.x → **17.0.8** | Major; paired with i18next 26 |
| `posthog-react-native` | 4.34 → **4.46.7** | Minor |

Local CI: lint + typecheck pass; **12/12** tracked test suites pass on `main` (with CI env placeholders). `jest.setup.js` adds AsyncStorage mock for future tests.

## Deferred (do not merge yet)

| Dependabot branch | Reason |
|-------------------|--------|
| `dependabot/npm_and_yarn/babel-preset-expo-56.0.14` | **babel-preset-expo 56** targets **Expo SDK 56**; app is on **Expo 54** (`babel-preset-expo` must stay **~54.x**). |
| `dependabot/npm_and_yarn/expo-and-react-native-fc220d15fd` | **Expo 56 / RN 0.85** — full SDK upgrade; schedule dedicated migration (expo upgrade, native rebuild, EAS profiles). |
| `dependabot/npm_and_yarn/multi-cbfe5253e3` (jest 30) | **jest 30** breaks **jest-expo@54** (`clearMocksOnScope`). Stay on **jest ~29.7** until jest-expo supports Jest 30. |

Close or snooze the deferred PRs on GitHub with a comment linking to this doc.

## After merging the integration branch

1. Push branch and open PR (or merge on GitHub if `gh` is installed).
2. Close merged Dependabot PRs (# for uuid, supabase-js, axios, i18next, react-i18next, posthog).
3. Comment + close deferred PRs (babel 56, expo group, jest 30).
