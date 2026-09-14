# Winkly — Privacy & DSA drafting pack (LEG-2 / LEG-3)

**Status: DRAFT for your lawyer.** This is engineering-grade drafting to save the
lawyer time — it is not legal advice, and none of it should go live without a
qualified review. Everything in `{{curly braces}}` needs a real value from the
registered entity.

It exists because the audit found three concrete gaps:
- the live privacy policy names no AI subprocessors, yet the concierge sends
  profile data to Google and Anthropic;
- it doesn't address special-category data (religion, allergies) at all; and
- there is no DSA notice-and-action mechanism or statement-of-reasons process,
  though block/report already exist in the app.

---

## 1. Subprocessors (add to the privacy policy)

> ### Who we share data with (subprocessors)
>
> We use a small number of processors to run Winkly. Each is bound by a data
> processing agreement (GDPR Art. 28) and processes data only on our instructions.
>
> | Processor | Purpose | Data categories | Location / transfer basis |
> |-----------|---------|-----------------|---------------------------|
> | Supabase | Database, authentication, file storage, serverless functions | Account, profile, messages, usage | {{Supabase region — e.g. EU (Frankfurt)}}; EU where available, otherwise SCCs |
> | Google (Gemini API) | AI concierge — generating plan and activity suggestions | A minimal, allow-listed profile subset (age, city, interests, dietary needs, budget) — never your name, contacts, messages, or exact location | US; EU Standard Contractual Clauses |
> | Anthropic (Claude API) | AI concierge — fallback/secondary model for the same suggestions | Same allow-listed subset as above | US; EU Standard Contractual Clauses |
> | Google Places / Maps | Venue and place lookups for suggestions | Coarse city/area and search terms; not your identity | US; SCCs |
> | Ticketmaster | Real event listings shown in Events mode | Coarse city/area and search terms | {{confirm}}; SCCs |
> | Expo (push notifications) | Delivering notifications to your device | Device push token | US; SCCs |
> | PostHog | Product analytics — only after you consent | Pseudonymous usage events | {{PostHog region — EU Cloud if selected}} |
> | Sentry | Crash reporting | Diagnostic/crash data | {{region}}; SCCs |
> | Vercel | Hosting the public website | Website request logs | US; SCCs |
>
> We review this list before adding any new processor. The current version is
> always at {{https://mywinkly.de/privacy}}.

**Engineering notes for the lawyer (so the table is accurate):**
- The concierge is server-side (a Supabase Edge Function, "ai-gateway"). It sends
  only an **allow-listed** context — the code enforces this; free-text chat and
  contact fields are never forwarded.
- Location is **quantised before storage** (≈1.1 km or ≈110 m grid); exact GPS is
  never persisted, so exact location is not shared with anyone.
- PostHog is **off until the user consents** to analytics.

---

## 2. Special-category data (GDPR Art. 9)

**Decision taken (Sept 2026):**

- **Allergies — removed.** It was health data (Art. 9) powering only a
  nice-to-have. As of the September migration the field is dropped and any
  stored values are erased (column + mode-profile meta). The concierge keeps
  allergy-*unaware* dietary steering via the neutral `food` field. One whole
  Art. 9 category is gone.
- **Religion — kept, as a voluntary visible field.** It stays on the profile
  when the user chooses to fill it. Its lawful basis is the **explicit consent**
  captured by the new consent gate (below).

**Consent gate (implemented in code).** A data-use notice now blocks the app
before any personal data is entered; acceptance is recorded server-side
(`users.privacy_consent_at` / `_version`, via `record_privacy_consent`), and a
notice-version bump forces re-consent. This is the explicit-consent basis Art. 9
requires, captured before religion (or anything else) can be entered. The notice
copy lives in `components/consent/PrivacyConsentGate.tsx` — **have the lawyer
review that copy**; it's plain-language and covers what's collected, the optional
sensitive fields, AI processing, and rights.

**Still for the lawyer:** confirm the consent wording meets Art. 9(2)(a), and
confirm that showing religion to other users (a profile a user chose to complete)
is best treated as consent and/or "manifestly made public by the data subject"
(Art. 9(2)(e)).

---

## 3. DSA notice-and-action mechanism (LEG-3)

As an EU hosting service with user-generated content, the Digital Services Act
requires an accessible way to report illegal content, a decision with a
statement of reasons, and an internal complaint route. Winkly already has the
building blocks (block, report user, report message) — this is the governance
wrapper around them.

**Implemented in code (Sept 2026):**

- **Notice-and-action text is now shown in-app.** After any report (profile or
  message, from Discover, the swipe deck, a profile, or a chat) the user sees a
  short confirmation: we review every report, may remove content / limit or
  suspend an account / take no action, and anyone we act against is told what we
  did, why, and how to appeal. Copy + the one call site live in
  `apps/mobile/lib/safety/reportNotice.ts` (`showReportReceivedNotice`) — **have
  the lawyer review this copy** against the full text below.
- **Reports reach a real inbox.** Reports still persist to
  `public.user_reports` / `public.message_reports` (viewable in the Supabase
  dashboard). On top of that, `20260906130000_report_notify_triggers.sql` adds
  AFTER INSERT triggers → the `report-notify` Edge Function → a moderation
  webhook (`REPORT_WEBHOOK_URL`, e.g. a Slack/Discord/email-relay incoming
  webhook). The confirmation dialog also offers `customer-care@mywinkly.de` as a
  second channel. **Ops:** apply the migration to each env, deploy the function,
  set `REPORT_WEBHOOK_URL` (see the migration header).
- **Still to do:** the statement-of-reasons email is not yet automated (template
  below is manual), and there is no in-app appeal form yet (appeal is by email).

**Add to Community Guidelines / a new "Reporting & moderation" page:**

> ### Reporting content and our response
>
> You can report a profile, a message, or any content in Winkly using the report
> button, or by emailing {{report@mywinkly.de}}. Tell us what you're reporting and
> why. You don't need an account to report — {{report@mywinkly.de}} is open to anyone.
>
> **What happens next.** We review every report. We aim to make an initial
> decision within {{X}} hours for safety reports (threats, sexual content
> involving minors, non-consensual content) and within {{Y}} days for others.
> We may remove content, limit or suspend an account, or decide no action is
> needed.
>
> **Statement of reasons.** When we act against content or an account, we tell the
> affected person what we did, why, the rule it relied on, and how to appeal.
>
> **Appeal.** If you disagree with a decision, reply to the notice or email
> {{appeals@mywinkly.de}} within {{Z}} days. A different reviewer will look at it.
>
> **Contact point.** For authorities and for DSA matters: {{dsa@mywinkly.de}}.
> Our point of contact operates in {{English/German}}.

**Statement-of-reasons template (internal — send to the affected user):**

> Subject: Action taken on your Winkly {{account/content}}
>
> We {{removed / restricted / suspended}} {{describe}} on {{date}}.
>
> **Why:** {{plain-English reason}}.
> **Rule:** This relied on {{Community Guidelines section / Terms clause}}.
> **How we found it:** {{a user report / automated detection / our own review}}.
> **What it affects:** {{scope — one message, the profile, the whole account}}.
> **Appeal:** If you think this was wrong, reply within {{Z}} days and a different
> reviewer will re-check it. You can also complain to a supervisory authority or
> go to court.

**For the lawyer to set:** the {{X/Y/Z}} timeframes, whether a dedicated DSA
contact mailbox is needed, and whether Winkly stays under the thresholds that
exempt it from the heavier VLOP obligations (it does, but the base obligations
above still apply).

---

## 4. Not covered here (still needs the lawyer)

- The Impressum itself (§ 5 DDG) — needs the real registered entity.
- The EU AI Act transparency line: the concierge is a limited-risk AI system, so
  users should be told they're interacting with AI. One sentence in-app + in the
  privacy policy. Draft: *"Winkly's suggestions are generated by AI and may be
  imperfect — always use your own judgement, especially for safety."*
  **In-app: done (Sept 2026).** This exact line now renders at the top of the
  concierge's first screen — the request form (`apps/mobile/app/concierge.tsx`)
  and step 1 of the planning flow (`components/ai/ConciergePlanningFlow.tsx`),
  via `components/ai/AIDisclosureNote.tsx`. **Still to do:** add the same line to
  the published privacy policy.
- Data Processing Agreements with each processor in §1.
- The record of processing activities (GDPR Art. 30).
