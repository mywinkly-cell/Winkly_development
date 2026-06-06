# Winkly — Launch readiness audit

**Date:** 2026-06-04  
**Scope:** Pre-launch checklist (auth, media, i18n, API, analytics, navigation, RLS, accessibility).

---

## Summary

| Area | Status | Blocking? |
|------|--------|-----------|
| Auth + auth-redirect | Implemented; manual E2E required | Yes — verify on device |
| Image crop/upload | Implemented; overrides pinned | Yes — device QA both platforms |
| i18n | 2 keys missing in 25 locales (fixed in repo) | Important |
| API layer (axios) | Client added; Supabase uses custom fetch | Important |
| PostHog taxonomy | Canonical events in `lib/analytics/events.ts` | Important |
| PostHog GDPR | Gated on cookie consent | Important |
| Navigation / deep links | `winkly://callback` + `(auth)/callback.tsx` | Yes — cold-start QA |
| Supabase RLS | Migrations + `rls_audit_report()` | Security |
| Accessibility | Partial `accessibilityLabel` coverage | Important |

---

## 1. Auth flow end-to-end

**Implemented**

- Email sign-up / verify / reset use `getEmailRedirectTo()` → HTTPS **auth-redirect** Edge Function or `winkly://callback`.
- Deep link handler: `lib/authDeepLink.ts` + `app/(auth)/callback.tsx` (`Linking.getInitialURL` + URL listener).
- Session: `AuthProvider` with `persistSession`, `autoRefreshToken`, recoverable-error handling (`lib/auth/session.ts`).
- CSRF: `winkly_state` mint/validate when using HTTPS redirect.

**Gaps / manual tests**

| Path | Code | Test |
|------|------|------|
| Email verification | `signup.tsx` → email → auth-redirect → `winkly://callback#…` | Open link in Gmail on iOS + Android |
| Password reset | `reset-password.tsx` → recovery → `reset-confirm` | Same |
| Magic link | Supported in `createSessionFromUrl` (fragment tokens) | If enabled in Supabase |
| OAuth | `signin.tsx` — **stubs only** (“coming soon”) | Configure Google/Apple/Facebook + implement |
| Session refresh | `autoRefreshToken: true` | Kill network → reconnect; stale token → sign-in |
| Cold start deep link | Expo Router → `/(auth)/callback` when URL is `winkly://callback` | Cold start from email link (not via splash only) |

**Config checklist**

- Supabase Redirect URLs: `winkly://callback`, `winkly://**`, auth-redirect function URL.
- `EXPO_PUBLIC_AUTH_REDIRECT_URL` in `.env` / EAS secrets.
- `AUTH_REDIRECT_STATE_SECRET` on Edge Function (production).

---

## 2. Image handling (`expo-image-manipulator`)

**Implemented**

- Pinned override: `expo-image-manipulator@14.0.8` in root + `apps/mobile` `package.json`.
- Crop UI: `components/media/ImageCropModal.tsx` (`expo-dynamic-image-crop` + manipulator normalize).
- Upload: `lib/uploadMedia.ts`, `PhotoConfirmModal.tsx`.

**Manual QA**

- [ ] Pick photo → crop modal → save → upload (iOS + Android).
- [ ] `content://` URI on Android (crop normalize path).
- [ ] Large image resize (1920px width cap in normalize).

---

## 3. i18n coverage

**Stack:** i18next + react-i18next; 26 locales; lazy load at startup.

**Audit:** `npm run mobile:audit-i18n` (script: `apps/mobile/scripts/audit-i18n.mjs`).

**Finding (2026-06-04):** All non-`en` locales were missing 2 keys: `settings.photoVerification`, `settings.photoVerificationSub` — patched to match `en.json`.

**Ongoing:** Many screens still use hardcoded English (auth splash, terms-cookies, large planner/chat surfaces). Migrate incrementally with `useTranslation()` + keys in `en.json`.

---

## 4. API layer (axios)

**Supabase:** `lib/supabase.ts` — custom `fetch` with `assertOnline()`, Android localhost → `10.0.2.2`, 30s implicit OS timeout.

**Axios:** `lib/http/client.ts` — 30s timeout, offline request interceptor, `classifyHttpError()`, `httpGet` / `httpPost`. Used for auth-redirect state mint.

**Other HTTP:** AI concierge (`conciergeClient.ts`), weather (Open-Meteo `fetch`), uploads (Supabase storage) — not all migrated to axios; acceptable if documented.

**Loading / offline:** `NetworkProvider` + `OfflineBanner`; `useAsyncData` treats `OfflineError`; hooks should set loading/error UI per screen.

---

## 5. PostHog event taxonomy

**Canonical events** (`lib/analytics/events.ts`):

| Event | When |
|-------|------|
| `mode_selected` | Mode switch |
| `match_created` | New match |
| `chat_started` | Chat opened |
| `event_rsvp` | Planner RSVP |
| `subscription_upgraded` | Tier change |
| `account_created` | Email sign-up success (`signup.tsx`) |
| `onboarding_completed` | Profile save → mode selection or Winkly World “Enter” (`profile-core`, `profile-business`, `winkly-world`) |

**Discover-specific** (`lib/discover/analytics.ts`): `discover_open`, `recommendation_*`, etc. — consider moving into `events.ts` for one taxonomy.

**GDPR:** PostHog `PostHogProvider` mounts only after **cookie consent** (`lib/analyticsConsent.ts` ← `legalFlags`). No PII in identify (user id + account_type only).

---

## 6. Navigation & deep-link QA

**Scheme:** `winkly` (`app.config.js`).

**Routes:** `constants/routes.ts`; `RouteGuard` in `lib/routing/guards.ts` (unit tested).

**Auth deep link route:** `/(auth)/callback`.

**Maestro flows:** `apps/mobile/.maestro/` (signup, onboarding, mode-selection, discover).

**Manual matrix**

- [ ] Cold start: `winkly://callback#access_token=…`
- [ ] HTTPS auth-redirect page → auto-redirect to app
- [ ] Push notification deep links (`NotificationDeepLinkHandler`)
- [ ] Signed-in tab routes: mode-selection, chats, planner

---

## 7. Supabase RLS hardening

**Repo**

- Baseline: `20250130000002_winkly_rls.sql`
- Audit helper: `20260601120000_security_rls_audit.sql` — `SELECT * FROM public.rls_audit_report();` (service_role)
- Catalog writes: anon removed from `companies` / `business_services` insert/update
- Messaging: `20260611120000_messaging_match_rls_and_immutability.sql`

**Run on production (service_role)**

```sql
SELECT * FROM public.rls_audit_report() WHERE status != 'OK';
```

**Review:** `GRANT EXECUTE … TO anon` on `match_events_for_concierge` — intentional for pre-auth browse; confirm no sensitive rows exposed.

**Storage:** `20260613120000_storage_buckets_policies.sql` — verify bucket policies match app upload paths.

---

## 8. Accessibility baseline

**Partial:** ~80 files use `accessibilityLabel`; many `TouchableOpacity` / `Pressable` without labels.

**Contrast:** Brand violet `#5A189A` on white — verify WCAG AA for body text (`#555555` on `#F9F7FB` is generally OK).

**Priority fixes:** Tab bar, mode switch, sign-in CTAs, chat composer, discover action buttons.

**Manual:** VoiceOver (iOS) + TalkBack (Android) on sign-in → mode selection → one discover action.

---

## CI / tests

- `npm run ci` — lint, typecheck, test.
- **Note:** Local Jest may fail with `clearMocksOnScope` if root `jest` version mismatches workspace; align `jest` with `jest-expo@54` or run tests from CI.

**Unit tests present:** auth session, route guards, mode permissions, connectivity, analytics events, env.

**Add:** Device E2E (Maestro) in CI optional; auth deep link integration test on simulator.

---

## Recommended next actions

1. Device-test auth-redirect + `winkly://callback` on iOS and Android (blocking).
2. Complete OAuth implementation or hide buttons until ready.
3. Run `rls_audit_report()` on production Supabase.
4. ~~Wire `trackAccountCreated` / `trackOnboardingCompleted` at completion points.~~ Done.
5. Accessibility pass on auth + tab shell + discover.
