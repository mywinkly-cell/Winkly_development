# Winkly — Go-Live Issues Plan (code-grounded)

**Date:** 2026-06-16
**Author:** Engineering audit (full code review of `apps/mobile`, `supabase/`, `website/`)
**Scope:** Concrete, verifiable issues to resolve before production launch on Google Play.

This plan supersedes the status notes in [`PROJECT_PLAN_LAUNCH.md`](./PROJECT_PLAN_LAUNCH.md) and [`LAUNCH_READINESS_AUDIT.md`](./LAUNCH_READINESS_AUDIT.md), several of which are **stale** (see §0). Each issue below cites the file/line evidence found in the current tree.

---

## 0. Current state — verified green (don't re-do these)

Confirmed working in this audit, so they are **not** blockers (and contradict older docs that still list them as gaps):

| Area | Evidence | Note |
|------|----------|------|
| Typecheck | `npm run mobile:typecheck` → **now 0 errors** | was failing with 16 errors in 5 files — **fixed in this pass** (see closed list) |
| Lint | `npm run mobile:lint` → 0 errors (102 warnings) | passes; warnings pre-existing |
| Unit tests | `npm run mobile:test` → **132 passed / 25 suites** | good logic coverage |
| i18n key parity | `audit-i18n` → "All locales match" (**416 keys × 26 locales**) | parity only — see #10 |
| No hardcoded secrets | secret scan of `apps/`, `supabase/`, `scripts/`, `website/` | clean |
| AI gateway auth | `ai-gateway/index.ts:3803-3817` verifies Bearer JWT via `auth.getUser(token)` | userId from verified token, not body |
| OAuth (Google/Apple) | `components/auth/OAuthButtons.tsx`, `lib/auth/oauth.ts` | implemented — *docs said "stubs"* |
| Block / report | `lib/chats/api.ts`, `lib/matching/actions.ts`; enforced in discover RPC (`...mode_discover_feeds_rpc.sql:22`) | works + filtered from feeds |
| GDPR delete + export | `delete-account` (91 ln), `export-account` (268 ln); wired via `lib/account/exportAccount.ts` | implemented — *docs said "not implemented"* |
| Photo verification | `verify-profile-photo` (169 ln); wired via `lib/safety/photoVerification.ts` | implemented — *docs said "placeholder"* |
| Crash reporting | `lib/monitoring/sentry.ts` (`Sentry.init`, DSN-gated) | wired |
| EAS / build identity | `app.config.js`: v1.0.0, real `projectId` (`5a6f6f9d-…`), `com.winkly.app`; `eas.json` has dev/preview/production + submit | ready |

---

## 1. Severity legend

- **P0 — Launch blocker.** App will fail store review, be legally non-compliant, or ships an exploitable vulnerability.
- **P1 — Fix before launch.** Functional gap, safety UX, or monetization correctness a user/reviewer will hit.
- **P2 — Verify & clean up.** Manual QA, ops, hygiene, doc drift — needed for confidence, not code-correctness.

### ✅ New-user Premium trial (2026-06-20)
- 3-day Premium trial for every new signup → then paid (Super/Premium, both promoted) or Free with limited AI. Trial-aware effective tier enforced on **both** client and ai-gateway; subscription screen shows the countdown. See **P1-4**. Migration `20260628130000_premium_trial.sql` must be pushed. Actual charging still needs a billing provider.

### ✅ Closed in the 2026-06-16 code pass

- **Typecheck restored** — fixed 16 pre-existing TS errors across 5 files so `npm run ci` typecheck passes again. Included a **real runtime bug**: `ConciergePlanningFlow.tsx:137` read `modeContext.subscription_tier` (always `undefined`) instead of `modeContext.context.subscription_tier`, so premium users were silently treated as **free** in that concierge flow. Also fixed null→undefined assignments in `romance/liked.tsx`, an `unknown` cast in `groups/invite-to-group.tsx`, a boolean coercion in `chats/chat-view.tsx`, and a duplicate-key object in `GroupPlanConsensusCard.tsx`.
- **P0-4** — `weather-pivot-cron` now fails closed (code fixed; still set `CRON_SECRET` in prod).
- **P0-3** — domain decided (`mywinkly.de`); all `winkly.app` doc references renamed (operational reconciliation remains).
- **P1-1** — blocked-users screen wired to `user_blocks` with real unblock.
- **P1-2** — `blockUser`/`reportUser`/`reportMessage` in `lib/chats/api.ts` made idempotent (`upsert`).
- **P1-3** — planner Filters now persist to a synced Supabase `user_settings` row (offline mirror in AsyncStorage); the planner index applies them (`onlyUpcoming`, `showCompleted`, `aiSuggestions`). New migration `20260628120000_user_settings.sql` (owner-only RLS). Defaults match prior behavior. **Apply the migration to each env** (`supabase db push`).
- **P1-5** — deleted orphaned mock-data screens `planner/events.tsx` + `planner/business-meetings.tsx` and their two unused `constants/routes.ts` entries.
- **P2-2** — verified all concierge `console.log`s are already `__DEV__`-gated; no action needed.

---

## 2. P0 — Launch blockers

### P0-1 · Legal entity is all placeholders (Impressum / Play contact)
- **Evidence:** `website/legal-entity.json` → `streetAddress: "[Registered street address — update … before launch]"`, `postalCode: "[PLZ]"`, `managingDirector`, `registerCourt`, `registerNumber`, `vatId` all bracketed. `docs/IMPRINT.md` & `docs/PRIVACY_POLICY.md` still use `{{company.*}}` tokens.
- **Why blocking:** German **Impressumspflicht (§5 DDG/TMG)** legally requires a real address, managing director, Handelsregister number, and VAT ID. Google Play requires valid developer/contact details. Shipping with placeholders is a legal exposure and a likely Play rejection.
- **Fix:** Fill `legal-entity.json` with real registered data → rebuild website (templates render from it) → redeploy → re-verify the rendered `/imprint`, `/privacy`, `/terms`.

### P0-2 · Legal site must be deployed and in-app legal URLs must resolve
- **Evidence:** App links to `https://mywinkly.de/{terms,privacy,community,imprint}` and `mailto:customer-care@mywinkly.de` (`app/account/legal.tsx:13-18`, `app/(auth)/terms-cookies.tsx:23-25`). Site source is `website/` (Vercel, `vercel.json`); `website/dist/` contains `terms/ privacy/ community/ imprint/`.
- **Why blocking:** A live, reachable Privacy Policy URL is **mandatory** for Play Data Safety and several auth providers. If `mywinkly.de` isn't serving this build, every in-app legal link 404s.
- **Fix:** Deploy `website/` to `mywinkly.de`; confirm the support mailbox (`customer-care@mywinkly.de`) exists and is monitored; run `npm run website:verify:live`.

### P0-3 · Canonical domain = `mywinkly.de` — ✅ docs fixed, operational items remain
- **Decision (owner, 2026-06-16):** `mywinkly.de` is the canonical production domain. The app code already uses it.
- **Fixed in this pass:** every `winkly.app` reference in `docs/` renamed to `mywinkly.de` (`GO_LIVE_AND_PLAY_STORE`, `PROJECT_PLAN_LAUNCH`, `PRODUCT_DOCUMENTATION`, `PLAY_STORE_DATA_SAFETY`, `DATA_PROTECTION_AND_PRIVACY_ASSESSMENT`, `EAS_CI`, `SUPABASE_CALENDAR_MAPS_INTEGRATION`).
- **Still to do (operational):** deploy the website to `mywinkly.de`; set Supabase Auth → Redirect URLs and OAuth redirect URIs to `mywinkly.de`; **reconcile the support email** — code uses `customer-care@mywinkly.de` (`legal.tsx:18`) but `legal-entity.json` and `lib/location/citySearch.ts:9` use `info@mywinkly.de` — pick one mailbox and ensure it exists.

### P0-4 · `weather-pivot-cron` fails open (unauthenticated service-role endpoint)
- **Evidence:** `supabase/functions/weather-pivot-cron/index.ts:79` → `if (secret && got !== secret) { 401 }`. When `CRON_SECRET` is unset/empty the guard is skipped and the request proceeds with `SUPABASE_SERVICE_ROLE_KEY`. `verify_jwt = false` for this function (`config.toml:343`). Contrast the correct fail-**closed** pattern in `notify-fanout/index.ts:113` (`if (!expected || provided !== expected)`).
- **Why blocking:** If the secret is ever missing in prod, anyone can invoke a service-role function that reads `pending_plans` and triggers notifications.
- **Fix:** Change to fail-closed: `if (!secret || got !== secret) return 401;` **and** set `CRON_SECRET` as a production function secret. (Two-line change + secret.)

### P0-5 · Auth hardening: email confirmation off, weak password floor
- **Evidence:** `config.toml`: `enable_confirmations = false` (`:189`), `minimum_password_length = 6` (`:154`), `[auth.captcha]` commented out (`:177-178`).
- **Why blocking:** With confirmations off, anyone can register unverified/fake emails — and the entire `auth-redirect` verification flow the team built is bypassed. Material abuse risk for a dating app. (Note: these are the **local** `config.toml` values; the hosted project is governed by the Dashboard — this is a *verify-and-set* item.)
- **Fix:** In the **production** Supabase Dashboard (Authentication): enable email confirmations, raise minimum password length to ≥ 8, enable rate limits, and consider CAPTCHA. Mirror in `config.toml` for parity.

---

## 3. P1 — Fix before launch

### P1-1 · Blocked-users management screen is a non-functional stub
- **Evidence:** `app/account/blocked-users.tsx:31` → `// Placeholder: no blocked_users table yet; show empty state`; list is hardcoded `[]` and "Unblock" only mutates local state. Meanwhile the `user_blocks` table exists and `blockUser`/`unblockUser` work (`lib/chats/api.ts:84-135`).
- **Impact:** Users can block but can never see or undo their blocks. Play's UGC safety expectations include manageable blocking.
- **Fix:** Query `user_blocks` for `blocker_id = me`, join profile names, and call `unblockUser()` on action.

### P1-2 · Two divergent `blockUser`/`reportUser` implementations
- **Evidence:** `lib/chats/api.ts:84` `blockUser(blockedId)` uses `.insert()` (throws on duplicate); `lib/matching/actions.ts:34` `blockUser({targetUserId,reason})` uses `.upsert(onConflict)`. `reportUser` similarly has two different signatures across the two files.
- **Impact:** Blocking an already-blocked user via the chats path throws a PK-conflict error; inconsistent APIs invite bugs.
- **Fix:** Consolidate to one idempotent (`upsert`) implementation and import it everywhere.

### P1-3 · Planner `filters.tsx` doesn't persist (live in all 4 modes) — ✅ done
- **Evidence (was):** `app/(tabs)/planner/filters.tsx` → `save = () => Alert.alert("Saved", "Placeholder…")`; re-exported by all four `app/(modes)/*/planner/filters.tsx`, so the no-op "Save" was visible everywhere.
- **Resolution (2026-06-16):** new `public.user_settings` table — one JSONB row per user, owner-only RLS — via `supabase/migrations/20260628120000_user_settings.sql`. `lib/planner/preferences.ts` reads/writes `user_settings.settings -> 'planner'` (synced across the user's devices) with an AsyncStorage mirror for offline reads; reads never throw (fall back to cache → defaults). `filters.tsx` loads on mount and persists on Save; the planner index reads prefs on focus and applies them: `onlyUpcoming` gates the past-item hide, `showCompleted` includes archived items inline, `aiSuggestions` gates the concierge promo + proactive/weekly cards. Defaults (`true/false/true`) reproduce today's behavior exactly.
- **Deploy step:** run the migration on each environment (`supabase db push`). Until applied, prefs degrade gracefully (defaults on read; a "couldn't save" on the Filters screen).

### P1-4 · Subscriptions — trial + model built; payment provider still to integrate
- **Monetization model (decided 2026-06-20):** every new user gets a **3-day Premium trial**; afterward they either **subscribe** (Super or Premium — both promoted) or **stay Free with limited AI** (3 AI plans/day + planning ideas).
- **Built in this pass:** trial grant in `handle_new_user` (migration `20260628130000_premium_trial.sql`); a trial-aware **effective tier** computed identically on client (`computeEffectiveTier` → `ModeContextProvider`) and server (`effectiveTierFromRow` in ai-gateway, so AI gating honors the trial and reverts to Free after); trial state via `getSubscriptionStatus`; subscription screen shows a trial countdown and keeps both paid plans actionable. Unit tests added.
- **Still to do (needs your store setup):** actual charging. `purchase()` still returns `not_configured` and `isBillingConfigured` is false. Integrate **Play Billing / RevenueCat** (Play Console products + keys), wire `purchase()` and `isBillingConfigured`, and on success set `users.subscription_tier` (+ `premium_until`). Until then the upgrade buttons show the existing "coming soon — no charges yet" state.
- **Deploy step:** `supabase db push` on each env (grants the trial to new signups).

### P1-5 · Orphaned mock-data planner routes — ✅ done
- **Evidence:** `app/(tabs)/planner/events.tsx` and `…/business-meetings.tsx` rendered hardcoded fake items (`e1/e2/e3`, `b1/b2/b3`) with `Alert.alert("…","Placeholder…")` actions. The real planner (`app/(tabs)/planner/index.tsx`) did **not** link to them.
- **Resolution (2026-06-16):** both files deleted; their unused `plannerEvents` / `plannerBusinessMeetings` constants removed from `constants/routes.ts`. Typecheck/lint/tests still green.

### P1-6 · Audit "coming soon" / disabled surfaces
- **Evidence:** `business/discover.tsx:317` ("Professional communities are coming soon"), `chats/filters.tsx:33` ("More options coming soon"), `account/invite.tsx:23` ("(Invite link placeholder)").
- **Impact:** Acceptable *if intentional*, but each is a visible incomplete feature.
- **Fix:** Product decision per surface — keep as clearly-disabled, or hide for v1. The invite-link placeholder should produce a real link or be hidden.

---

## 4. P2 — Verify & clean up

### P2-1 · npm dependency advisories
- **Evidence:** `npm audit --omit=dev` → 30 advisories (1 critical, 3 high). Named: **CRITICAL** `shell-quote`; **HIGH** `form-data`, `tar`, `ws`. All four trace to **build/dev tooling** (metro, `@react-native/dev-middleware`, react-devtools, prebuild-config) — not the shipped RN bundle.
- **Fix:** Run `npm audit fix`; confirm none reach the production bundle; keep Dependabot (`.github/dependabot.yml`) merging. Track in `docs/NPM_AUDIT_MOBILE.md`.

### P2-2 · Stray `console.log` in AI concierge
- **Evidence:** 8 `console.log` in `lib/ai/conciergeClient.ts` (669, 682, 694, 728, 819, 829, 886) and `components/ai/ConciergePlanningFlow.tsx:452`; ~77 console statements total (mostly `console.warn`).
- **Fix:** Confirm these are `__DEV__`-gated; strip/guard the `console.log`s so context summaries aren't logged in release.

### P2-3 · Manual device QA matrix (cannot be verified from code)
- Auth-redirect + `winkly://callback` **cold-start** on iOS **and** Android; email verify / password reset; OAuth (Google/Apple) round-trip; image pick→crop→upload incl. Android `content://`; push-notification deep links; **delete** and **export** account end-to-end.
- **Fix:** Run on 2–3 physical devices; the launch audit marks deep-link cold-start as blocking.

### P2-4 · Production RLS + storage policy audit
- **Fix:** After `supabase db push` to prod, run `SELECT * FROM public.rls_audit_report() WHERE status != 'OK';` (expect zero rows) and verify storage bucket policies match app upload paths (`…storage_buckets_policies.sql`).

### P2-5 · Production Edge Function secrets set
- **Fix:** Set/verify: `OPENAI_API_KEY` / `GEMINI_API_KEY` / `ANTHROPIC_API_KEY`, `UPSTASH_REDIS_REST_URL` + `…TOKEN`, `GOOGLE_PLACES_API_KEY` (or `GOOGLE_MAPS_API_KEY`), `WEBHOOK_SECRET`, `CRON_SECRET` (see P0-4), `AUTH_REDIRECT_STATE_SECRET` (≥16 chars). Check with `npm run supabase:secrets:production`.

### P2-6 · i18n: hardcoded English on some surfaces
- **Evidence:** Key parity passes, but stub/secondary screens use raw English (the planner stubs, parts of business/groups/events forms per `LAUNCH_READINESS_AUDIT §3`).
- **Fix:** Move remaining user-visible strings to i18n (lower priority if those screens are removed/hidden per P1-3/P1-5).

### P2-7 · Accessibility pass
- **Evidence:** Partial `accessibilityLabel` coverage; many `Pressable`/`TouchableOpacity` unlabeled (`LAUNCH_READINESS_AUDIT §8`).
- **Fix:** Label core flows (tab bar, mode switch, auth CTAs, discover actions, chat composer); TalkBack/VoiceOver smoke test.

### P2-8 · Refresh stale launch docs
- **Evidence:** `README.md` says "52 migrations" (actual **65**) and lists 4 edge functions (actual **19**). `PROJECT_PLAN_LAUNCH.md` / `LAUNCH_READINESS_AUDIT.md` mark OAuth/export/verification as not-done though shipped.
- **Fix:** Update so the team plans against reality (or point them to this file).

---

## 5. Suggested sequencing

1. **Legal & domain (P0-1, P0-2, P0-3):** unblock store submission + lawfulness. Owner: founder + web.
2. **Security config (P0-4, P0-5):** cron fail-closed + secret; Dashboard auth hardening. Owner: backend.
3. **Safety/functional UX (P1-1, P1-2, P1-3):** blocked-users wiring, block API consolidation, planner filters. Owner: mobile.
4. **Monetization decision (P1-4) + dead code (P1-5, P1-6).** Owner: product + mobile.
5. **Verification gauntlet (P2-3, P2-4, P2-5)** on a release build, then **internal testing track** before Production.
6. **Hygiene (P2-1, P2-2, P2-6, P2-7, P2-8)** in parallel.

---

*Generated from a full read of the repository. Re-run the green checks (§0) and `npm audit` before each release; update this file as items close.*
