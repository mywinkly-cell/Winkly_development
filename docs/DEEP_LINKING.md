# Deep Linking — Universal Links (iOS) & App Links (Android)

**Last updated:** 2026-06-23

This covers HTTPS deep links so that `https://mywinkly.de/app/*` opens the Winkly app directly.
It is **separate** from the existing `winkly://` custom scheme (which already handles the auth
callback — see [`website/scripts/build.mjs`](../website/scripts/build.mjs) `/auth` bridge). HTTPS
deep linking is **not a launch blocker**; it enables marketing/share/email links to open the app.

## Scope: why only `/app/*`

Links are intentionally scoped to the `/app/` path prefix, **not** the whole domain. Capturing all
of `mywinkly.de` would hijack the legal pages (`/terms`, `/privacy`, `/imprint`, `/community`) and the
`/auth` email-verification bridge — those must keep opening in the **browser**. Everything under
`https://mywinkly.de/app/...` opens the app; everything else stays on the website.

To broaden or change the prefix later, update **all** of:
- iOS `associatedDomains` is domain-level, but the matched paths live in the AASA `components`.
- [`apps/mobile/app.config.js`](../apps/mobile/app.config.js) → `android.intentFilters[].data.pathPrefix`.
- [`website/public/.well-known/apple-app-site-association`](../website/public/.well-known/apple-app-site-association) → `components` `"/"`.

## What's already wired (code)

| Piece | Location |
|---|---|
| iOS `associatedDomains: ["applinks:mywinkly.de"]` | `apps/mobile/app.config.js` → `ios` |
| Android App Links `intentFilters` (`autoVerify: true`, `https` / `mywinkly.de` / `/app`) | `apps/mobile/app.config.js` → `android` |
| `apple-app-site-association` (hosted at `/.well-known/`) | `website/public/.well-known/apple-app-site-association` |
| `assetlinks.json` (hosted at `/.well-known/`) | `website/public/.well-known/assetlinks.json` |
| Build copies `website/public/**` → `dist/` | `website/scripts/build.mjs` (`copyStaticAssets`) |
| Vercel serves the (extensionless) AASA as `application/json` | `website/vercel.json` |
| CI verifies both files exist + warns on placeholders | `website/scripts/verify-dist.mjs` |

## ⚠️ Two values you must fill before this works

Both hosted files ship with **placeholders** that `npm run website:verify` will warn about until replaced.

### 1. Apple Team ID → `apple-app-site-association`

Replace `REPLACE_WITH_APPLE_TEAM_ID` with your 10-character Apple Team ID, e.g. `A1B2C3D4E5`,
so `appIDs` reads `A1B2C3D4E5.com.winkly.app`.

- Find it: [Apple Developer](https://developer.apple.com/account) → **Membership** → Team ID,
  or run `eas credentials` (iOS) and read the Apple Team shown.

### 2. Android signing SHA-256 → `assetlinks.json`

Replace `REPLACE_WITH_ANDROID_SHA256_FINGERPRINT` with the SHA-256 fingerprint of the cert that
signs your **production** app (colon-separated upper-case hex, e.g. `AB:CD:…:EF`).

- With EAS-managed credentials (Play App Signing): get it from
  **Play Console → your app → Test and release → App integrity → App signing → App signing key certificate**
  (use the **SHA-256** there — that's the cert Google re-signs with), and also add the **upload key**
  SHA-256 from the same page if you want internal-track APKs to verify.
- Or run `eas credentials` (Android) → keystore → it prints the SHA-256.
- You can list multiple fingerprints in the `sha256_cert_fingerprints` array (upload key + Play
  signing key) — recommended so both store builds and internal APKs verify.

## Deploy & verify

1. Fill the two values above.
2. `npm run website:verify` — should show `✓ /.well-known/...` with no placeholder warnings.
3. Deploy the website to `mywinkly.de` (Vercel). Confirm in a browser:
   - `https://mywinkly.de/.well-known/apple-app-site-association` returns JSON with `Content-Type: application/json` (no redirect, no `.json` extension).
   - `https://mywinkly.de/.well-known/assetlinks.json` returns the JSON array.
4. Build the app with the updated `app.config.js` (`eas build`). Universal Links / App Links are
   baked in at build time — a new build is required; OTA updates can't change them.

## Test on a real device (the checklist item)

Type a `https://mywinkly.de/app/test` link somewhere tappable (a note, an email to yourself — **not**
the address bar; some browsers bypass app links from the bar).

- **iOS:** tap → the app opens (cold-start too). If it opens Safari instead, check the AASA is reachable
  and the build's `associatedDomains` matches. iOS caches AASA — reinstalling the app forces a refresh.
- **Android:** tap → the app opens. Verify App Links status:
  `adb shell pm get-app-links com.winkly.app` should show `mywinkly.de: verified`.
  If `none`/`legacy_failure`, re-check `assetlinks.json` reachability + the SHA-256 matches the installed build.

> A handler route exists at `apps/mobile/app/app/[...rest].tsx`: `https://mywinkly.de/app/event/:id`
> opens the event-details screen, and any other `/app/*` link falls back to the app entry (`/`, which
> RouteGuard then resolves). Extend the segment mapping in that file as you add shareable links
> (profiles, groups, invites, …). It's a normal expo-router screen, so it does not affect the
> `winkly://` auth callback.
