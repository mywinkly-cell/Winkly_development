# Winkly — Data protection and privacy assessment

**Purpose:** Internal assessment of how user private information is used and treated, aligned with European (GDPR, ePrivacy) and international data protection rules, so we can ensure users that their data is secured.

**Last updated:** 2026-02-22

---

## 1. Applicable laws and standards

| Region / framework | Relevance |
|--------------------|-----------|
| **GDPR (EU Regulation 2016/679)** | Primary if we offer services to users in the EEA or target them. Covers lawful basis, rights (access, rectification, erasure, portability, object, restrict), processor agreements, breach notification, international transfers. |
| **UK GDPR + DPA 2018** | Same principles for UK users post-Brexit. |
| **ePrivacy Directive / national implementations** | Consent for non-essential cookies/storage and electronic communications; align with national rules (e.g. Germany TDDG, UK PECR). |
| **CCPA / CPRA (California)** | If we have California users: notice, right to know, delete, opt-out of sale (we do not sell personal data). |
| **International transfers** | GDPR Chapter V: transfers outside EEA only with adequacy decision or appropriate safeguards (e.g. EU SCCs). Supabase/PostHog/OpenAI may process in US; we must document and use SCCs where required. |

---

## 2. Personal data we process (inventory)

### 2.1 Account and identity

| Data | Source | Stored | Lawful basis (GDPR) |
|------|--------|--------|---------------------|
| User ID (UUID) | Auth | Supabase `auth.users`, `public.users` | Contract / legitimate interest |
| Email | Sign-up / OAuth | `users.email`, `auth.users` | Contract (account creation) |
| Account type (personal/business) | Sign-up | `users.account_type` | Contract |
| Subscription / premium status | Backend | `users.is_premium`, `subscription_tier` | Contract |

### 2.2 Profile (personal)

| Data | Source | Stored | Lawful basis |
|------|--------|--------|--------------|
| First name, last name | Onboarding / profile | `profiles_core` / `user_profiles` | Contract, consent (profile visible to others) |
| Gender, birthday, city | Profile | Same | Contract, consent |
| Education, occupation, languages, bio | Profile | Same | Consent |
| Photos (core_photos, profile photos) | User upload | Supabase Storage + URLs in profile tables | Consent |
| Instagram handle | Profile | profiles_core / profiles_business | Consent |
| Interests, mode-specific meta (e.g. relationship goals, dealbreakers) | Profile | `profiles_mode` | Consent |

### 2.3 Profile (business)

| Data | Source | Stored | Lawful basis |
|------|--------|--------|--------------|
| Business name, location, area, bio, tags | Business onboarding | `profiles_business` | Contract |
| Website, Instagram, Facebook, LinkedIn, logo | Profile | Same | Consent |

### 2.4 Communications and content

| Data | Source | Stored | Lawful basis |
|------|--------|--------|--------------|
| Chat messages (text, attachments) | User | `messages` | Contract (service delivery) |
| Planner items (title, description, location, participants) | User | `planner_items`, `planner_participants` | Contract |
| Events (title, description, location, participants) | User | `events`, `event_participants` | Contract |

### 2.5 Behaviour and technical

| Data | Source | Stored | Lawful basis |
|------|--------|--------|--------------|
| AI usage telemetry (user_id, mode, task only) | Edge Function | `ai_requests` | Legitimate interest (security, product improvement) |
| Analytics (user ID, account_type, screen path, event names, no PII) | PostHog | PostHog (EU or US) | Legitimate interest; consent where required by ePrivacy |
| Session / auth tokens | Supabase Auth | Supabase + device (AsyncStorage) | Contract, security |

### 2.6 Special categories (GDPR Art. 9)

- **Not deliberately collected as “special category”:** We do not ask for health, ethnic origin, political opinions, etc. Profile fields (e.g. lifestyle, values) could indirectly reveal such data; we treat profile data as general personal data and minimise scope. If we later collect data that clearly falls under Art. 9, we will obtain explicit consent or rely on another narrow exception.

### 2.7 Contacts (planned)

- Invite/contact matching is designed to use **hashed identifiers only**; no raw contact data stored. When implemented, we will obtain explicit consent before accessing device contacts and document in Privacy Policy.

---

## 3. How we use data (purposes)

| Purpose | Data used | Legal basis |
|---------|-----------|-------------|
| Provide account, auth, and session | Identity, email | Contract |
| Provide profiles, discover, match, chat, planner, events | Profiles, messages, planner, events | Contract |
| AI concierge / recommendations | Allowlisted context only. Profile data sent to the AI is minimal and used solely for personalization: age, gender, city (location), interests, bio (truncated), lifestyle/dietary/allergies, values, goals (relationship/meetup/networking), transport. We do **not** send first name, last name, or email to the AI. No raw chat content. Data minimization and purpose limitation (GDPR Art. 5(1)(b),(c)). | Contract, legitimate interest |
| Subscription and billing | Account type, subscription tier | Contract |
| Security, abuse prevention, block/report | user_blocks, report data, messages (as needed) | Legitimate interest, legal obligation |
| Product analytics (aggregate behaviour) | PostHog: ID, account_type, screens, events (no PII) | Legitimate interest; consent where required |
| Compliance, legal claims | As necessary | Legal obligation, legitimate interest |

We do **not** sell personal data. We do not use profile or message content for advertising profiling in a way that would require separate consent under ePrivacy where applicable.

---

## 4. Data security measures (current)

| Measure | Implementation |
|---------|----------------|
| **Access control** | Row Level Security (RLS) on all Supabase tables; anon key only; no global read/write. |
| **Identity firewall** | Mode-scoped access; no cross-mode leakage of Romance/Friends/Business data. |
| **Auth** | Supabase Auth; session persistence in app (AsyncStorage); optional Secure Store for sensitive tokens. |
| **API keys / secrets** | Only in Supabase Edge Functions or server-side; never in client. |
| **AI** | Allowlisted context only. Profile summary (age, gender, city, interests, lifestyle, dietary, goals) is sent to the AI for personalization; first name, last name, and email are never sent (data minimization). `ai_requests` stores only user_id, mode, task, prompt_variant (no prompt or response content). On account deletion, ai_requests are removed (CASCADE); third-party AI providers may retain requests per their policy. |
| **Analytics** | No PII in PostHog identify or events; use EU host (`eu.i.posthog.com`) for EEA users when possible. |
| **Sensitive tokens** | `calendar_connections.token_encrypted` for future OAuth; encrypt at rest in DB. |

---

## 5. Data subject rights (GDPR)

| Right | Our commitment |
|-------|-----------------|
| **Access (Art. 15)** | Provide a way (e.g. in-app or support) to obtain a copy of personal data we hold. |
| **Rectification (Art. 16)** | Users can edit profile in-app; support can assist for other data. |
| **Erasure (Art. 17)** | Provide “Delete account” that removes or anonymises data (auth, profiles, messages, planner, etc.) subject to legal retention. |
| **Portability (Art. 20)** | Provide data in a machine-readable format (e.g. JSON) for data provided by the user or generated by their use. |
| **Object / restrict (Art. 21, 18)** | Process requests via support; honour where legally required. |
| **Withdraw consent** | Where processing is based on consent, allow withdrawal (e.g. disable analytics, delete account). |

**Implementation:** Account deletion is implemented: General settings → Account & Identity → Delete or deactivate account → Delete my account. This calls the `delete-account` Edge Function, which removes the user’s Storage files (user-photos, user-videos, business-logos), then deletes `auth.users(id)` so that all public data (profiles, messages, planner, **ai_requests**, etc.) is removed by CASCADE. Data export is not yet implemented.

**AI memory erasure (partial, without account deletion):** Users can also delete their AI “memory” without deleting their account. This calls the `delete-ai-memory` Edge Function, which deletes `profile_embeddings` (vector profile) and AI-generated caches/telemetry (`ai_plan_cache`, `ai_requests`, `ai_match_agent_proposals`) for one mode or all modes, and optionally deletes `user_concierge_signals` (explicit preference signals) when the user chooses to.

---

## 6. International transfers

- **Supabase:** Hosting region selectable (EU or US). For EEA users, prefer EU region; document in Privacy Policy.
- **PostHog:** Can use EU host (`EXPO_PUBLIC_POSTHOG_HOST=https://eu.i.posthog.com`); document choice.
- **OpenAI (AI gateway):** May process allowlisted context in US; ensure Standard Contractual Clauses (SCCs) or equivalent where required by GDPR.
- **Other processors (e.g. Meetup, Eventbrite, Open-Meteo):** Document in Privacy Policy; ensure DPAs/SCCs where they process personal data on our behalf.

---

## 7. Retention and deletion

- **Active accounts:** Retained while the account exists and as needed for the contract.
- **After account deletion:** Delete or anonymise personal data within a defined period (e.g. 30 days), except where retention is required by law (e.g. invoices, abuse reports).
- **Messages / content:** Deletion should cascade where possible (e.g. ON DELETE CASCADE); soft-delete or retention for disputes if needed by policy.
- **Logs / backups:** Define retention (e.g. 30–90 days) and ensure deletion/anonymisation in line with erasure requests.

---

## 8. Breach notification

- Internal process: Identify, contain, assess risk to rights and freedoms.
- GDPR Art. 33: Notify supervisory authority within 72 hours where there is a risk.
- GDPR Art. 34: Notify affected individuals where high risk to their rights, unless exceptions apply.
- Document procedure and update Privacy Policy to state that we will notify in accordance with applicable law.

---

## 9. Terms and Privacy Policy

- **Terms of Service:** See `docs/TERMS_OF_SERVICE.md`. Covers acceptance, use rules, account, subscription, IP, AI use, liability, governing law (e.g. Germany/EEA), and reference to Privacy Policy.
- **Privacy Policy:** See `docs/PRIVACY_POLICY.md`. Covers controller identity, data we collect, purposes, legal basis, retention, rights, international transfers, security, and contact. Both should be hosted at `https://winkly.app/terms` and `https://winkly.app/privacy` and linked from the app (General settings → Support & legal → Legal).
- **First-use acceptance:** On first app use, users must accept Terms of Service and Cookie use on a dedicated screen before sign-up or sign-in; acceptance is stored locally. Users can always access Terms, Privacy, Cookies, Data protection, and Imprint via General settings → Support & legal → Legal.

---

## 10. Recommendations (action items)

1. ~~**Implement account deletion**~~ **Done:** Edge Function `delete-account` (storage + auth delete); in-app flow under Account & Identity → Delete / Deactivate. AI usage records (`ai_requests`) are deleted via CASCADE; we do not log full prompts/responses (see ai-gateway header comment).
2. **Implement data export:** Provide a way (e.g. request via support or in-app) to receive a portable copy of the user’s data.
3. **Document processors:** Maintain a list of sub-processors (Supabase, PostHog, OpenAI, etc.) and ensure DPAs/SCCs where required.
4. **Choose and document regions:** Supabase and PostHog in EU for EEA users; state in Privacy Policy.
5. **Consent for analytics:** Where ePrivacy requires consent for analytics, obtain it before initialising PostHog (e.g. consent screen or settings toggle).
6. **Review and update:** Re-run this assessment when adding new data types, new processors, or new regions.

---

*This assessment is the internal reference for data protection. Public-facing commitments are in the Privacy Policy and Terms of Service.*
