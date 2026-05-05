# npm audit – Mobile app (apps/mobile)

**Last run:** 2026-02-21 · **Vulnerabilities:** 45 high (all minimatch) — **Expo SDK 54 upgrade completed**

## Current state (post–SDK 54 upgrade)

- **Stack:** Expo ~54.0.33, React Native 0.81.5, babel-preset-expo ~54.0.10, Jest ~29.7.0.
- **Audit:** 45 high severity, all from **minimatch** (ReDoS). Used by @expo/cli, @expo/metro-config, eslint, @typescript-eslint, jest, react-native (glob → minimatch).
- **Do not run `npm audit fix --force`** — it would install react-native@0.84.0 (breaking change). The remaining issues have no safe fix in the current tree.

## Why the 45 remaining can’t be fixed safely

`npm audit fix` does nothing (no non‑breaking fix). `npm audit fix --force` would upgrade React Native to 0.84 and can break the app. The **minimatch** vulnerability will only be resolved when upstream (@expo/cli, eslint, typescript-eslint, jest) depend on minimatch ≥10.2.1. Until then, these are dev/build-time only (not in the shipped app runtime).

## If you use native `ios` / `android` folders

After the SDK 54 upgrade, either delete `ios` and `android` and let prebuild regenerate them, or run `npx pod-install` in `ios` and apply any [Native upgrade helper](https://docs.expo.dev/bare/upgrade) changes. Then run the app and tests.

## Quick reference

- **Audit:** `cd apps/mobile` then `npm audit`
- **Safe fix:** `npm audit fix` (currently fixes 0; leaves 45 minimatch).
- **Do not use:** `npm audit fix --force`
