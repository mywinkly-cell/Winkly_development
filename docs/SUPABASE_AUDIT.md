# Winkly — Supabase check-up and clean-up audit

**Purpose:** Align your Supabase project with Winkly’s requirements, fix security gaps, and reduce chaos from duplicate or legacy objects.

**Last updated:** 2026-02-16

---

## 1. Executive summary

- **Two profile systems:** The repo has both `profiles_core` / `profiles_mode` / `profiles_business` (product doc) and `user_profiles` (used by the app and by RPCs). The app also uses `sub_profiles` and `business_profiles`. This creates overlap and confusion.
- **Tables only in Dashboard:** Your screenshots show tables not created by repo migrations (e.g. `chats`, `chat_messages`, `business_profiles`, `friend_profiles`, `companies`, `events_planner_items`, `romance_swipes`, `romance_matches`). Those likely come from saved SQL in the Dashboard or another source. The app uses **both** repo-backed tables (`conversations`, `messages`, `user_profiles`, `sub_profiles`, `follows`, `romance_likes`) and names that match the Dashboard (`business_profiles`, `friend_profiles`, `public_profile_view`, `events_planner_items`). So the live DB is a mix.
- **Security:** `user_profiles` has a policy **“Profiles are viewable by all”** (`USING (true)`). For a premium app you may want discovery to be mode-scoped or connection-scoped instead of global.
- **107 SQL queries:** If most are in the Dashboard, they are not versioned. Follow `docs/SQL_ORGANIZATION.md`: export → classify → merge into migrations or move to `supabase/scripts/`, then trim Dashboard saved queries.

**Recommendation:** Run the audit script (below), then (1) consolidate profile tables and views, (2) add RLS to any table that has none, (3) move all schema/RLS/triggers into repo migrations and prune Dashboard duplicates.

---

## 2. Tables: expected vs app usage vs Dashboard

### 2.1 Created by repo migrations (source of truth)

| Table / view | Purpose |
|--------------|---------|
| `users` | Extends auth; account_type, subscription_tier, is_premium |
| `profiles_core` | Personal core (name, city, bio, core_photos, instagram) |
| `profiles_mode` | Personal sub-profiles per mode (bio, photos, interests, meta) |
| `profiles_business` | Business account profile |
| `user_profiles` | **Separate** core-like table (created by user_profiles_with_instagram); app uses this for display |
| `follows` | Follow relationship (Friends/Business connections) |
| `events` | Events (title, starts_at, visibility, mode) |
| `event_participants` | event_id, user_id, rsvp_status |
| `event_invitations` | event_id, inviter_id, invitee_id, status |
| `event_chat_settings` | event_id, chat_enabled (event group chat opt-in) |
| `planner_items` | Unified planner (source_mode: romance/friends/business/events) |
| `planner_participants` | planner_item_id, user_id |
| `conversations` | Chats (type: dm/group/event, mode, dm_source) |
| `conversation_members` | conversation_id, user_id, role, left_at |
| `conversation_participants` | **View** over conversation_members |
| `conversation_member_settings` | pinned, muted, last_read_at per user/conversation |
| `messages` | conversation_id, sender_id, content, message_type, attachments, delete_type |
| `message_reactions` | message_id, user_id, emoji |
| `message_read_receipts` | message_id, user_id, read_at |
| `typing_indicators` | conversation_id, user_id |
| `user_blocks` | blocker_id, blocked_id |
| `user_reports` | reporter_id, reported_id, reason |
| `message_reports` | message_id, reporter_id, reason |
| `pinned_messages` | conversation_id, message_id, pinned_by |
| `starred_messages` | message_id, user_id (saved messages) |
| `groups` | created_by, name, mode |
| `group_members` | group_id, user_id, role |
| `wishlist_items` | user_id, title, description, mode |
| `user_preferences` | user_id, key, value (JSONB) |
| `calendar_connections` | user_id, provider, token (future sync) |
| `ai_requests` | user_id, mode, task (telemetry only) |
| `romance_likes` | liker_id, liked_id (mutual like = match) |

**Note:** `sub_profiles` is **altered** in `align_sub_profiles` but **not created** in the repo; it must exist in the DB already (e.g. from Dashboard or an older migration).

### 2.2 Referenced by the app (from codebase grep)

| Object | Used in |
|--------|--------|
| `user_profiles` | Chats, planner, profile, onboarding, mode-selection, splash, signin, discover, matches |
| `sub_profiles` | ModeContext, mode-selection, profile-core, preview |
| `business_profiles` | Business discover, profile-view, onboarding-business, splash, signin, ModeHeader |
| `profiles_core` | lib/access/profiles.ts |
| `profiles_mode` | lib/access/profiles.ts, friends index/discover |
| `profiles_business` | lib/access/profiles.ts |
| `friend_profiles` | Friends index, discover, profile-view |
| `public_profile_view` | Romance liked, profile-view, matches, discover |
| `conversations` | Chats, hooks, access |
| `conversation_members` | Chats api |
| `conversation_participants` | Chats index, ChatsInboxContent, chat-view |
| `conversation_member_settings` | Chats, api |
| `messages` | Chats, access, api, hooks |
| `message_reactions` | Chats api, hooks |
| `message_read_receipts` | Chats api |
| `typing_indicators` | Chats hooks |
| `follows` | ChatsInboxContent, connections, api |
| `events` | Events discover, create-event, event-details, access |
| `event_participants` | Event-details |
| `event_chat_settings` | Create-event |
| `events_planner_items` | Event-details (upsert) |
| `planner_items` | Friends index, lib/access/planner |
| `user_blocks` | Chats api |
| `romance_likes` | Chats api (unmatch) |
| `user_reports` | Chats api |
| `message_reports` | Chats api |
| `user_preferences` | Chats api |
| `companies` | Business discover, companies index |
| `business_services` | Business discover |
| `notifications` | Notifications screen |
| `users` | ModeContext, welcome-personal |

So the app expects at least: `user_profiles`, `sub_profiles`, `business_profiles`, `friend_profiles`, `public_profile_view`, `conversations`, `messages`, `events`, `event_participants`, `event_chat_settings`, `events_planner_items` or `planner_items`, `follows`, `romance_likes`, `companies`, `business_services`, `notifications`, `users`, plus chat-related and report tables.

### 2.3 Tables on Dashboard not (or not fully) in repo

From your screenshots, these exist in the project but are **not** created by current migrations:

- `app_roles`
- `business_planner_items`, `business_profiles`, `business_profiles_discover`, `business_services`
- `chat_members`, `chat_message_attachments`, `chat_message_reactions`, `chat_messages`, `chats`
- `companies`, `companies_discover`
- `events_discover`
- `events_planner_items`
- `friend_connections`, `friend_planner_items`, `friend_profiles`, `friend_profiles_discover`, `friend_requests`
- `notifications`
- `public_profile_view`
- `reports`
- `romance_matches`, `romance_planner_items`, `romance_swipes`
- `sub_profiles`, `user_blocks`, `user_profiles`, `users`

So the live DB has **legacy or alternate** names: e.g. `chats`/`chat_messages` vs `conversations`/`messages`, and mode-specific tables (`business_profiles`, `friend_profiles`, `romance_swipes`, `romance_matches`, `events_planner_items`, etc.). The app uses a mix: it talks to `conversations`/`messages` (repo) and also to `user_profiles`, `sub_profiles`, `business_profiles`, `friend_profiles`, `public_profile_view`, `events_planner_items`, `companies`, `business_services`. So either:

- Those Dashboard tables are created by SQL run only in the Dashboard (not in repo), or  
- There are views/aliases (e.g. `business_profiles` might be a view over `profiles_business`), or  
- The app was written against an older schema and the repo represents a partial migration.

**Action:** Run the audit script to list **all** tables and views in `public` and compare with this doc. Then decide per table: keep and add to migrations, or replace with a single source of truth (e.g. one profile model) and migrate the app.

---

## 3. Security findings and recommendations

### 3.1 user_profiles — “Profiles are viewable by all”

In `20250130100000_user_profiles_with_instagram.sql`:

```sql
CREATE POLICY "Profiles are viewable by all"
  ON public.user_profiles FOR SELECT USING (true);
```

- **Risk:** Any authenticated (or even anon, if anon can hit the table) user can read every row in `user_profiles`. For a premium app this may be stricter than you want.
- **Options:**  
  - **Discovery only:** Keep global SELECT only for fields needed for discovery (e.g. id, first_name, city, main_photo_url) and restrict sensitive fields (e.g. full bio, languages) to own row or to connections/matches.  
  - **Mode-scoped:** Use a secure view (e.g. `public_profile_view`) that only exposes profiles to users in the same mode and applies RLS.  
  - **Explicit:** If “viewable by all” is intentional for discovery, document it and ensure no PII beyond what’s needed for discovery is in this table.

### 3.2 RLS on every table

- **Rule:** Every table in `public` that holds user or app data should have RLS enabled and policies that match product rules (see product doc §4.3).
- **Action:** Run the audit script; it lists RLS status per table. For any table with RLS disabled, add a migration that enables RLS and adds minimal safe policies (e.g. “own row only” until you define finer rules).

### 3.3 Policies for reports and receipts

- `user_reports` and `message_reports`: Repo only defines INSERT (reporter_id = auth.uid()). If moderators need to SELECT, add a separate SELECT policy (e.g. service role or a dedicated “moderator” role), not open SELECT for all.
- `message_read_receipts`: Ensure SELECT is limited to conversation members (already implied by RLS on messages/conversations if you use a single role; confirm no policy grants broader read).

### 3.4 RPCs and SECURITY DEFINER

- `create_direct_chat`, `create_event_chat`, `romance_like_profile`, `romance_new_matches`, `romance_likes_received`, `romance_liked_profiles`, `get_conversation_unread_counts`, `maybe_create_event_chat`, `ensure_event_chat_settings` run as `SECURITY DEFINER`. They must enforce checks internally (e.g. block checks, event visibility). Current migrations do that; when adding or changing RPCs, keep the same discipline.

---

## 4. Duplicate and legacy objects

- **Two “core profile” tables:** `profiles_core` (doc) and `user_profiles` (app + RPCs). Unify in the long term: either make the app use `profiles_core` only and deprecate `user_profiles`, or make `profiles_core` a view over `user_profiles` and use `user_profiles` as the single table. Same for `profiles_mode` vs `sub_profiles`.
- **profiles_business vs business_profiles:** App uses `business_profiles`. If the repo only has `profiles_business`, either add a view `business_profiles` → `profiles_business` or migrate the app to `profiles_business`.
- **chats / chat_messages vs conversations / messages:** Repo and product doc use `conversations` and `messages`. If the Dashboard also has `chats` and `chat_messages`, they are legacy; migrate data and app to `conversations`/`messages` and drop the old tables, or document why both exist.
- **Planner:** Repo has unified `planner_items` (with `source_mode`). App also references `events_planner_items` and `planner_items`. If `events_planner_items` is a separate table, either make it a view over `planner_items` (where source_mode = 'events') or add it to migrations and document.

---

## 5. Script: organise and check Supabase

Use the script below to get a single report you can run in the **Supabase SQL Editor**. It does not change data; it only lists and checks.

1. **Run** `supabase/scripts/audit-supabase.sql` in the SQL Editor (run all statements; multiple result sets are normal).
2. **Review** the result tabs: tables/views list, RLS status, policy counts, and “expected vs actual” for critical tables.
3. **Fix** using migrations: add missing tables/views/policies, tighten `user_profiles` if needed, enable RLS where it’s off, and add table/object comments (descriptions) so the Dashboard no longer shows “No description” everywhere.

There is no single “script that organises everything” automatically: schema and policy changes must be done in **migrations** (and optionally backfilled in the Dashboard once). The audit script only **reports** so you can decide what to change.

---

## 6. Suggested next steps

1. **Run the audit script** (see `supabase/scripts/audit-supabase.sql`) and save the output.
2. **Export Dashboard SQL:** For each of the 107 saved queries, export to `supabase/_exported_queries/` and classify (schema / RLS / triggers / data / read-only) per `docs/SQL_ORGANIZATION.md`.
3. **Consolidate profiles:** Choose one core profile table (`user_profiles` or `profiles_core`) and one sub-profile table (`sub_profiles` or `profiles_mode`); add migrations so the DB matches, then update the app to use only those. Add views (e.g. `business_profiles` → `profiles_business`) if the app expects different names.
4. **Security:** Restrict `user_profiles` SELECT if “viewable by all” is too broad; ensure every table has RLS and correct policies.
5. **Single source of truth:** Put all schema, RLS, triggers, and RPCs into repo migrations; remove or archive duplicate definitions from the Dashboard so the “source of truth” is the repo.
6. **Descriptions:** Add `COMMENT ON TABLE ...` (and key columns) in a migration so the Dashboard shows meaningful descriptions and the schema is self-explanatory.

After that, Supabase will match Winkly’s requirements and be in a good state for a secure premium app. If you want, we can add a follow-up migration that adds table comments and a small “expected tables” check to your CI or deploy process.
