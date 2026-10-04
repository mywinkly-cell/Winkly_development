# npm audit – Mobile app (apps/mobile)

**Last run:** 2026-10-04 · **Stack:** Expo ~57, React Native 0.86.3 · **Result:** 52 findings (3 moderate, 49 high), **2 root advisories with no upstream fix** — both reviewed and allowlisted.

## Never run `npm audit fix --force`

On an Expo app it picks whatever major "fixes" one advisory and ignores the SDK. In one run it moved
`expo` 57 → **44** (2021) and `react-native` → 0.72, then a second run moved it back to 57 and RN 0.86 —
with a broken mix of native modules in between. If you already ran it, restore the lockfile and reinstall:

```bash
git checkout -- package.json package-lock.json apps/mobile/package.json
npm ci
```

Upgrade Expo only with `npx expo install expo@^<sdk> --fix` (see docs/MAINTENANCE.md).

## How to check

```bash
npm run audit          # full tree; fails only on unreviewed high/critical advisories
npm audit              # raw npm report (counts every dependent package, so the number looks huge)
```

CI (`.github/workflows/security.yml`) runs `node scripts/audit-check.mjs --omit=dev`.

The big number is misleading: npm lists every package that *depends on* a vulnerable one. The 52
findings come from just **4 root advisories**:

| Advisory | Package | Status |
|----------|---------|--------|
| [GHSA-w5hq-g745-h8pq](https://github.com/advisories/GHSA-w5hq-g745-h8pq) (moderate) | `uuid` <11.1.1 under `xcode` | **Fixed** — `overrides.xcode.uuid = 11.1.1` (root + apps/mobile). Remove once `xcode` depends on uuid ≥11.1.1. |
| [GHSA-vcc3-ghjq-m6fr](https://github.com/advisories/GHSA-vcc3-ghjq-m6fr) (moderate) | `decode-uri-component` 0.2.2 under `expo-router` → `query-string@7` | **Fixed by patch** — `apps/mobile/patches/decode-uri-component+0.2.2.patch` backports the linear-time decoder from 0.5.0 (0.5.0 itself is ESM-only and can't be required by query-string 7). npm still reports it because it checks versions only. Goes away with Expo SDK 58 (expo-router 58 drops query-string). |
| [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) (high) | `braces` ≤3.0.3 | **Accepted** — no patched release exists. Build tooling only (metro, @expo/cli, jest, patch-package) expanding our own glob patterns; not in the app bundle. |
| [GHSA-86w9-cpqp-85rv](https://github.com/advisories/GHSA-86w9-cpqp-85rv) (high) | `node-forge` ≤1.4.0 | **Accepted** — no patched release exists. Pulled in by `@expo/code-signing-certificates` (expo-updates); the app does not configure `updates.codeSigningCertificate`, so the vulnerable signature-verify path is never used. |

Accepted advisories live in `scripts/audit-check.mjs` (`ACCEPTED`). Each entry needs a reason and a
removal condition. Re-check them on every Expo SDK upgrade and when upstream ships a fix.
