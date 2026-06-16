# Winkly — Security & EU/GDPR Go-Live Checklist

**Last updated:** 2026-06-16
**Scope:** Operational hardening you complete in dashboards, DNS, and admin consoles — the things that can't be fixed in code. Pair this with the code-level audit in [`GO_LIVE_ISSUES_PLAN.md`](./GO_LIVE_ISSUES_PLAN.md) and the policy notes in [`../SECURITY.md`](../SECURITY.md).

Severity: **[High]** = do before launch · **[Med]** = strongly recommended · **[Low]** = hygiene/ongoing.

---

## 0. Already hardened in code (done — verify after deploy)

These were implemented in the repo and just need to ship:

- [x] **Cron endpoint fails closed** — `weather-pivot-cron` now rejects when `CRON_SECRET` is unset (`supabase/functions/weather-pivot-cron/index.ts`). → Still set `CRON_SECRET` in prod (see §1).
- [x] **Auth session encrypted at rest** — the Supabase session (access + refresh tokens) is stored in the iOS Keychain / Android Keystore via `apps/mobile/lib/auth/secureSessionStorage.ts` instead of plaintext AsyncStorage.
- [x] **Verification selfies moved to a private bucket** — `verification-selfies` (private, owner-only RLS). Migration `supabase/migrations/20260627120000_verification_selfies_private_bucket.sql`. → Run `supabase db push` to prod so the bucket exists.
- [x] **Web security headers** added to `website/vercel.json` and `auth-redirect/vercel.json` (HSTS, X-Frame-Options, Referrer-Policy, Permissions-Policy). → Redeploy both Vercel sites.

> ⚠️ **Still open in code (scoped follow-up):** chat images are stored in the **public** `user-photos` bucket and rendered via `getPublicUrl()` across many screens. Moving them to a private/signed-URL bucket is a coordinated change to `apps/mobile/lib/uploadMedia.ts` (upload) + every render site + a signed-URL helper. Tracked, not yet done.

---

## 1. Supabase production dashboard

> The values in `supabase/config.toml` govern **local dev only**. Production is controlled by the hosted dashboard — verify each item there.

- [ ] **[High] Data region is in the EU** (Frankfurt / `eu-central`). Settings → General. **Cannot be changed after creation** — if it's US, plan a migration before you have real users. *Core GDPR data-residency requirement.*
- [ ] **[High] Email confirmations ON.** Authentication → Providers → Email → "Confirm email". Without it, anyone can register fake/unverified emails and the whole verification flow is bypassed.
- [ ] **[High] Password policy:** minimum length ≥ 8 (10 better) + require letters & digits. Authentication → Policies.
- [ ] **[High] Leaked-password protection ON** (checks new passwords against HaveIBeenPwned). Authentication → Policies.
- [ ] **[High] Rate limits enabled** for sign-in, sign-up, OTP/magic-link, password reset. Authentication → Rate Limits.
- [ ] **[Med] CAPTCHA enabled** (hCaptcha or Cloudflare Turnstile) on auth. Authentication → Settings. Best single defense against bot signups on a dating app.
- [ ] **[Med] Point-in-Time Recovery (PITR) backups ON** (Pro). Database → Backups. Protects against accidental/malicious data loss.
- [ ] **[Med] Production SMTP configured** (Resend / Postmark / SendGrid) with a verified sending domain. Authentication → Emails → SMTP. The built-in mailer has tiny limits and poor deliverability — and password-reset mail is security-critical.
- [ ] **[Med] Edge Function secrets set:** `CRON_SECRET`, `WEBHOOK_SECRET`, `AUTH_REDIRECT_STATE_SECRET` (≥16 chars), `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` / `GEMINI_API_KEY`, `GOOGLE_PLACES_API_KEY`, `UPSTASH_REDIS_REST_URL` + `…TOKEN`, AWS Rekognition keys (if used). `npx supabase secrets list`.
- [ ] **[Med] CORS allowlist set** — `CORS_ALLOWED_ORIGINS` to your real web origins (not the dev localhost default).
- [ ] **[Low] Offer MFA/TOTP**, at least for business accounts. Authentication → Settings (Pro).
- [ ] **[Low] Sign the Supabase DPA** (Data Processing Agreement). Organization → Legal/Compliance.
- [ ] **[Low] After `db push`, run the RLS audit:** `SELECT * FROM public.rls_audit_report() WHERE status != 'OK';` — expect **zero rows**. Then test with the anon key and no session: queries must not return other users' rows.

---

## 2. Domain & email — mywinkly.de

- [ ] **[High] SPF, DKIM, DMARC** on the mail-sending domain. Prevents anyone spoofing `@mywinkly.de` for phishing and keeps password-reset mail out of spam. Your SMTP provider gives you the exact DNS records; start DMARC at `p=none` (monitor), then move to `p=quarantine`/`p=reject`.
- [ ] **[High] 2FA on the domain registrar account** + enable **registrar/transfer lock**. Registrar takeover = total brand/email compromise.
- [ ] **[Med] HSTS preload** — after the `Strict-Transport-Security` header is live (added in code), submit mywinkly.de at https://hstspreload.org.
- [ ] **[Med] CAA DNS record** restricting which CAs may issue certs (e.g. `0 issue "letsencrypt.org"` + your Vercel CA). Blocks rogue certificate issuance.
- [ ] **[Low] DNSSEC** enabled at the registrar/DNS host.
- [ ] **[Low] Reconcile the canonical domain & support email** — code uses `mywinkly.de` and both `customer-care@` and `info@` appear. Pick one support address, make sure the mailbox exists and is monitored, and align Supabase Auth redirect URLs + OAuth redirect URIs to the chosen domain (see `GO_LIVE_ISSUES_PLAN.md` P0-3).
- [ ] **[Low] Add a CSP** to the website once you know its external dependencies (fonts/analytics). Skipped in code to avoid breaking the live site — start in report-only mode.

---

## 3. Accounts & supply chain (the real-world attack surface)

For a startup, admin-account takeover is a far likelier breach path than an app exploit.

- [ ] **[High] 2FA on every admin console:** GitHub, Supabase, Vercel, domain registrar, Google Play Console, Apple Developer, Expo/EAS, your AI vendor dashboards. One phished password without 2FA can expose the whole backend.
- [ ] **[High] Make the GitHub repo private** (Settings → General → Danger Zone) unless you intend to run a public OSS program. Removes a reconnaissance advantage (schema, auth patterns).
- [ ] **[Med] GitHub: enable secret scanning + push protection + Dependabot security updates**, and branch-protect `main` (require PR review). Settings → Code security and analysis.
- [ ] **[Med] Run `npm audit fix`** and keep Dependabot PRs merging. Current advisories are dev/build tooling only (not shipped to users), but keep them closing.
- [ ] **[Low] Rotate any credential ever exposed.** `git log --all --full-history -- "**/.env"` came back clean in the last audit — re-run after any incident and rotate Supabase keys + OAuth secrets if anything shows up.

---

## 4. EU / GDPR compliance

- [ ] **[High] EU data region + Supabase DPA** — see §1.
- [ ] **[High] Disclose all sub-processors** in the privacy policy: Supabase, Expo, Vercel, Sentry, OpenAI/Anthropic, Google (Places/Maps), AWS (Rekognition, if used). Each that processes personal data needs a DPA in place.
- [ ] **[High] Special-category data (Art. 9).** A dating app can reveal **sexual orientation**; verification selfies are face data. You need **explicit consent** and a documented lawful basis for these, called out in the policy and captured at signup.
- [ ] **[High] International transfer safeguards.** OpenAI/Anthropic/AWS are US-based → reference **Standard Contractual Clauses (SCCs)** for those transfers and confirm API data is **not used for model training** (state it in the policy).
- [ ] **[High] 18+ age gate** at signup — mandatory for a dating app; also a Play/App Store requirement.
- [ ] **[Med] Privacy policy completeness** — `docs/PRIVACY_POLICY.md` still has `{{placeholders}}`. Fill: data retention periods, lawful basis per purpose, the sub-processor list, a data-request contact, and how to exercise rights. Deploy it to a live, reachable URL (`mywinkly.de/privacy`) — required for Play Data Safety and OAuth providers.
- [ ] **[Med] Verify erasure & export end-to-end** on a real device — `delete-account` (now also wipes the `verification-selfies` bucket) and `export-account` are implemented; confirm they run from the in-app buttons.
- [ ] **[Med] Consent for analytics/crash reporting.** Sentry + any analytics need consent (and iOS App Tracking Transparency if applicable). Your `terms-cookies` screen is the place to wire this.
- [ ] **[Low] Breach-response plan.** GDPR requires notifying the supervisory authority within **72 hours**. Write down who does what; know your lead authority (likely the relevant German state DPA).
- [ ] **[Low] Imprint (Impressumspflicht).** German law requires a real Impressum (address, managing director, Handelsregister no., VAT ID). Fill `website/legal-entity.json` and publish `/imprint` (see `GO_LIVE_ISSUES_PLAN.md` P0-1).

---

## 5. Post-deploy verification

- [ ] `SELECT * FROM public.rls_audit_report() WHERE status != 'OK';` → zero rows.
- [ ] Anonymous-key probe (no session) returns no other users' rows.
- [ ] `verification-selfies` bucket exists and is **not** public; storage policies match `{userId}/...` upload paths.
- [ ] `curl -I https://mywinkly.de` shows the new security headers; auth-redirect page shows `X-Frame-Options: DENY`.
- [ ] Password reset & email verification round-trip on a real device (Keychain/Keystore session persists across app restart).
- [ ] Mail-tester.com / MXToolbox confirm SPF, DKIM, DMARC pass.
