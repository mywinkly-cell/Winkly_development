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
5. Then production: snapshot policies (above) → push → tests → functions → app release.

**App release needed for calendar connect.** Until users update, the old app opens the
consent screen and reports success, but the connection is never activated (it now
waits for the app to redeem the code). Everything else is server-side and works with
the app versions already installed. `recompute-compatibility` has no callers today;
if you schedule it, send `x-cron-secret`.

---

## Still open — decisions for you

- **Last names are readable by any logged-in user** regardless of "show full name", and
  the "new chat" search (`app/(tabs)/chats/new-chat.tsx`) lets anyone search *all*
  users by first name, last name or city. Fixing this properly needs the birthday
  approach (revoke the column, serve a masked name via views/RPCs) across ~15 client
  queries plus the discover feeds, and a device QA pass — deliberately not done blind.
  The search should also be limited to your connections.
- **Profile videos and voice prompts are not moderated** (public `user-videos` bucket).
  Options: async video moderation (e.g. Sightengine video, paid), hold videos private
  until manually reviewed, or hide video bios from others until one of those exists.
- **Free Premium via throwaway accounts.** Every signup gets a 3-day Premium trial and
  the AI spend ceilings are off. Dashboard actions: email confirmation ON, CAPTCHA,
  and set `AI_MONTHLY_GLOBAL_COST_MICROS` as a hard ceiling on the bill.
- **Push notifications show message text** on the lock screen (`notify-fanout`).
  Consider a "hide message previews" setting, common in dating apps.
- `data_minimization_test.sql` and `birthday_lockdown_test.sql` fail their "age is
  derivable" check on a fresh local database — before these changes too. Worth a look.
