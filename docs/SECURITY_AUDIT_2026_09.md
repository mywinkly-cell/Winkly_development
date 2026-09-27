# Security audit — September 2026: what changed and how to deploy it

Companion to [`SECURITY_AUDIT_2026_08.md`](SECURITY_AUDIT_2026_08.md). Every database
fix below was first reproduced as a working attack on a local stack with all
migrations applied, then shown closed by the regression test.

---

## What changed

| ID | Hole | Fix | Files |
|----|------|-----|-------|
| SEC-7 | Anyone could add themselves to any chat, group or planner item and read it; a removed member could clear `left_at` and rejoin; anyone could invite themselves to any group | Clients never insert chat membership (DEFINER RPCs only); leaving is one-way; groups need a pending invitation; only members can invite | `20260927120000_…` |
| SEC-8 | Any user could create a plan naming arbitrary people and host-confirm it — pushing it into their planners, phones and Google/Outlook calendars | Clients can only cancel their own plan; confirm RPCs refuse to run without a user identity; `pending-plan-confirm` calls them with the caller's JWT; ai-gateway no longer links plans to chats the requester isn't in | `20260927120000_…`, `pending-plan-confirm`, `ai-gateway` |
| SEC-9 | A chat image could be overwritten after passing moderation (verdict is keyed by path) | `chat-media` objects can't be updated or deleted by clients | `20260927120000_…` |
| SEC-10 | Calendar OAuth: a victim approving an attacker's consent link attached the victim's calendar to the attacker's account | Callback parks tokens under a one-time code; the app redeems it with the same user's session | `20260927130000_…`, `calendar-oauth-*`, `_shared/calendarOAuthCompletion.ts`, `lib/integrations/cloudCalendarAuth.ts` |
| SEC-11 | Public `business-logos` writable by anyone (the app never uploads there); strangers could inflate matching affinity | Client writes removed; behaviour signals need a shared chat | `20260927130000_…` |
| OPS-4 | `recompute-compatibility` ran as service role for anyone holding the public anon key (DB DoS); `get-nearby-external-events` spent API quotas for anyone | Cron secret / service key required; signed-in user required | both functions |
| — | `verify-profile-photo` accepted another user's selfie path; `video-call-session` let ex-members start calls | Path must be the caller's own; `left_at IS NULL` | both functions |
| SEC-12 | Every user's last name was readable by any logged-in user, whatever "show my full name" said; the new-chat search matched hidden last names | Others read `last_name_public` (the last name only if the user opted in, has a Business profile, or hosts an event); the owner reads `my_profile`; the raw column becomes owner-only in **phase 2** | `20260927140000_…`, `scripts/last_name_lockdown_phase2.sql`, 20 app queries |

Bugs found and fixed along the way (not security, but they block real flows):

- On a database built from the migrations, **every authenticated read of `messages` /
  `conversations` failed** with `infinite recursion detected in policy` (the two tables'
  policies referenced each other). Production evidently has different, hand-made
  policies — see *Drift* below.
- `confirm_pending_plan` / `confirm_pending_plan_host` **always errored**
  (`column reference "pending_plan_id" is ambiguous`), and via the service-role client
  `auth.uid()` was NULL anyway — so a normal participant could never confirm.
- `join_event` never added anyone to an **existing** event chat (it ran as the caller,
  who can't see a chat they aren't in yet).
- **Saving a Romance / Friends / Business profile always failed** since
  `20260922120000_media_moderation.sql` (`record "new" has no field "main_photo_url"`
  from the photo-moderation trigger) — fixed in `20260927135000_…`.
- **Onboarding's final save and the profile autosave were refused** on any database with
  the birthday lockdown (`20260906120000`): a PostgREST upsert needs read access to every
  column it writes, and `birthday` isn't readable. The app now writes its own profile with
  update-then-insert (`lib/profile/writeOwnUserProfile.ts`).
- **Viewing another user's profile failed** (`loadPublicCoreProfile` selected `birthday`),
  **`friend_profiles` failed for every client** (it derived age from `birthday`), the
  **Dates screen query failed** (`public_profile_view` had lost `show_full_name`), and the
  Business-profile fallback used a join PostgREST can't make (no foreign key).

---

## ⚠️ Drift: read this before applying to production

Production's policies on the chat tables differ from the migrations (the app works in
production; a database built from the repo can't read messages). So
`20260927120000_…` **drops every policy** on `conversation_members`, `group_members`,
`planner_participants` and `pending_plans` and recreates a complete known set — a
leftover hand-made permissive policy would otherwise keep the hole open. Each drop is
logged (`NOTICE security-audit-2026-09: dropping …`).

Snapshot production first, and keep the output:

```sql
SELECT tablename, policyname, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('conversation_members','group_members','planner_participants',
                    'pending_plans','conversations','messages','group_invitations')
ORDER BY 1, 2;
```

If production has a policy there that the app relies on and the new set doesn't cover,
the symptom is an empty list or a permission error on that screen — compare against
the snapshot.

---

## Deploy order

1. **Dev first.** `npm run supabase:push:development:dry-run`, then push.
2. Run the tests against dev (each runs in a transaction and rolls back):
   ```bash
   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/security_hardening_test.sql
   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/security_audit_2026_09_test.sql
   ```
3. Deploy functions (push to `main` → dev). Changed: `ai-gateway`, `pending-plan-confirm`,
   `recompute-compatibility`, `get-nearby-external-events`, `calendar-oauth-start`,
   `calendar-oauth-callback`, `verify-profile-photo`, `video-call-session`.
4. **Device QA on dev** — the flows these changes touch:
   - Chats inbox, open a DM, open a group chat (member list shows), send a message, leave a chat
   - Create a group with invites; accept an invite on the second account; join by code; remove a member
   - Invite someone to a date from chat; accept it
   - Concierge group plan: each participant confirms; host "lock it in"
   - Join / leave an event with a chat
   - Connect Google Calendar in Settings (needs the new app build — see below)
   - Photo verification
   - Onboarding a brand-new account end to end; editing your profile (autosave)
   - Open someone else's profile in Romance, Friends and Business; the Dates screen
   - Names: first name only by default; full name after turning the option on, for
     Business profiles, and for someone who hosts an event
5. Then production: snapshot policies (above) → push → tests → functions → app release.

**Last names roll out in two phases** (older app builds read and upsert `last_name`
directly, so locking it first would break their chat lists and onboarding):

1. Push the migrations (phase 1 is additive — old and new app builds both work; verified).
2. Ship the app update (JS only, so an `expo-updates` OTA update can deliver it).
3. Once most users run it, apply `supabase/scripts/last_name_lockdown_phase2.sql` to
   production, then move it into `supabase/migrations/` with a new timestamp.

Check whether the **birthday lockdown** is already live in production — if it is, new
users on the current app can't finish onboarding today, and the app update fixes it:
`SELECT has_column_privilege('authenticated', 'public.user_profiles', 'birthday', 'SELECT');`
(`false` = lockdown live).

**App release needed for calendar connect.** Until users update, the old app opens the
consent screen and reports success, but the connection is never activated (it now
waits for the app to redeem the code). Apart from that and the last-name phases above,
everything is server-side and works with the app versions already installed. `recompute-compatibility` has no callers today;
if you schedule it, send `x-cron-secret`.

---

## Still open — decisions for you

- **Profile videos and voice prompts are not moderated** (public `user-videos` bucket).
  Photos are moderated for the same reasons — see the chat reply for options.
- **Free Premium via throwaway accounts.** Every signup gets a 3-day Premium trial and
  the AI spend ceilings are off. Dashboard actions: email confirmation ON, CAPTCHA, and
  set `AI_MONTHLY_GLOBAL_COST_MICROS` as a hard ceiling on the bill.
- **Push notifications show message text** on the lock screen (`notify-fanout`).
  Consider a "hide message previews" setting, common in dating apps.
- **Event screens** (`create-event.tsx`, `event-details.tsx`) still hold ~100 hard-coded
  developer strings. The server already shows hosts' full names; showing "Hosted by …"
  on the event page and a notice at creation belongs with those screens' real design
  (the i18n rule makes any edit translate the whole file).
- **New-chat search** lists every user by first name and city (hidden last names can no
  longer be searched). Consider limiting it to connections.
