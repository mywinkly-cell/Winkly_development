# Winkly — Tables needed vs in Supabase

**Purpose:** Which tables the app uses, which exist in repo migrations, and which you still need to add (or alias) in Supabase.

**Last updated:** 2026-02-16

---

## 1. Tables/views the app uses (from codebase)

| Table or view           | Used in (examples) | In repo migrations? |
|-------------------------|-------------------|----------------------|
| **user_profiles**       | Chats, planner, profile, onboarding, splash, signin, discover, matches | ✅ Yes (`user_profiles_with_instagram`) |
| **sub_profiles**        | ModeContext, mode-selection, profile-core, preview | ⚠️ Only **ALTER** (align); table not **created** in repo |
| **users**               | ModeContext, welcome-personal, romance matches | ✅ Yes (`winkly_schema`) |
| **business_profiles**   | Business discover, profile-view, onboarding-business, splash, signin, ModeHeader, uploadLogo | ❌ No (repo has **profiles_business**) |
| **profiles_business**   | lib/access/profiles.ts | ✅ Yes (`winkly_schema`) |
| **profiles_mode**       | lib/access/profiles, friends index/discover | ✅ Yes (`winkly_schema`) |
| **profiles_core**       | lib/access/profiles | ✅ Yes (`winkly_schema`) |
| **friend_profiles**     | Friends index, discover, profile-view | ❌ No |
| **public_profile_view** | Romance liked, profile-view, matches, discover | ❌ No (view) |
| **conversations**       | Chats index, chat-view, hooks, access | ✅ Yes |
| **conversation_members**| lib/chats/api.ts | ✅ Yes |
| **conversation_participants** | Chats index, ChatsInboxContent, chat-view, hooks | ✅ Yes (view in chat_system_full) |
| **conversation_member_settings** | Chats, api | ✅ Yes |
| **messages**            | Chats, api, hooks, access | ✅ Yes |
| **message_reactions**    | Chats api, hooks | ✅ Yes |
| **message_read_receipts**| Chats api | ✅ Yes |
| **typing_indicators**   | Chats hooks | ✅ Yes |
| **follows**             | ChatsInboxContent, connections, api | ✅ Yes |
| **events**              | Events discover, create-event, event-details, access | ✅ Yes |
| **event_participants**  | Event-details | ✅ Yes |
| **event_chat_settings**  | Create-event | ✅ Yes |
| **events_planner_items** | Event-details (upsert) | ❌ No (repo has **planner_items** with `source_mode`) |
| **planner_items**       | Friends index, lib/access/planner | ✅ Yes |
| **user_blocks**         | Chats api | ✅ Yes |
| **romance_likes**       | Chats api (unmatch) | ✅ Yes |
| **user_reports**        | Chats api | ✅ Yes |
| **message_reports**     | Chats api | ✅ Yes |
| **user_preferences**    | Chats api | ✅ Yes |
| **companies**           | Business discover, companies index | ❌ No |
| **business_services**    | Business discover | ❌ No |
| **notifications**       | app/(shared-ui)/notifications | ❌ No |

---

## 2. Still need in Supabase (app uses but not in repo, or only altered)

These are **required by the app** but either not created by migrations or created under a different name. Add them in Supabase (via migration or Dashboard) or map the app to existing tables.

| Name                   | Situation | What to do |
|------------------------|-----------|------------|
| **sub_profiles**       | Repo only has ALTER (adds columns); table never CREATE in repo | If missing in DB: **create table** in a new migration (same shape as `profiles_mode`: user_id, mode, bio, photos, interests, meta, unique(user_id, mode)). If it already exists (e.g. from Dashboard): ensure RLS + policies. |
| **business_profiles**  | App uses this name; repo has **profiles_business** | Either **create view** `business_profiles` that SELECTs from `profiles_business`, or **rename/alias** in app to `profiles_business`. Easiest: add migration `CREATE VIEW business_profiles AS SELECT * FROM profiles_business`. |
| **friend_profiles**    | Not in repo | Either **create table** (e.g. mode-scoped profile for Friends) or **create view** over `profiles_mode` WHERE mode = 'friends'. Depends on product: if Friends use same sub-profile as repo, view; if separate table in your design, add table + migration. |
| **public_profile_view**| Romance discover/liked/matches; not in repo | **Create view** in a migration: e.g. join user_profiles + profiles_mode (romance) and expose only discovery-safe columns; add RLS or security_invoker so it’s not globally open. |
| **events_planner_items**| App upserts into this; repo has **planner_items** | Either **create view** that maps to planner_items (source_mode = 'events'), or **create table** events_planner_items and sync, or **change app** to use `planner_items` with filter source_mode = 'events'. Cleanest: app uses `planner_items` with source_mode. |
| **companies**          | Business discover, companies index | **Create table** in migration (e.g. id, name, industry, …) + RLS if you need it for product. |
| **business_services**  | Business discover | **Create table** in migration (e.g. business_id, service type, …) + RLS. |
| **notifications**      | Notifications screen | **Create table** in migration (e.g. user_id, type, read_at, …) + RLS. |

---

## 3. In repo but app doesn’t reference directly

Still part of the product (or RPCs); keep in Supabase.

| Table                    | Why keep |
|--------------------------|----------|
| event_invitations        | Event invites flow (product doc §4). |
| planner_participants     | Planner items have participants. |
| groups, group_members    | Group chats (product doc §8.6). |
| wishlist_items           | Product doc §8.7 (DB exists; app may use later). |
| calendar_connections     | Future calendar sync. |
| ai_requests              | AI telemetry. |
| pinned_messages          | Chat feature. |
| starred_messages         | Chat feature. |

---

## 4. Quick checklist for “what to add in Supabase”

Run your audit script; then:

- **Missing and needed by app**
  - **sub_profiles** — Create table (or confirm it exists and has RLS).
  - **business_profiles** — Create view over `profiles_business` (or switch app to `profiles_business`).
  - **friend_profiles** — Create table or view (see above).
  - **public_profile_view** — Create view (romance discovery).
  - **events_planner_items** — Use `planner_items` in app, or add view/table.
  - **companies** — Create table if Business mode uses it.
  - **business_services** — Create table if Business mode uses it.
  - **notifications** — Create table for notifications screen.

- **Already in repo (ensure applied)**
  - If you run migrations from repo: users, user_profiles, profiles_core, profiles_mode, profiles_business, follows, events, event_participants, event_chat_settings, planner_items, conversations, conversation_members, conversation_participants (view), conversation_member_settings, messages, message_reactions, message_read_receipts, typing_indicators, user_blocks, romance_likes, user_reports, message_reports, user_preferences, etc. Apply any missing migrations so these exist.

---

## 5. Suggested order

1. **Apply all repo migrations** (via Dashboard SQL Editor or Supabase CLI) so every table from §1 that is “in repo” exists.
2. **Add missing objects** from §2: at least `sub_profiles` (if missing), `business_profiles` (view), `public_profile_view` (view), then `companies`, `business_services`, `notifications` if you use those features.
3. **Align planner:** Either point event-details at `planner_items` (source_mode = 'events') or add `events_planner_items` (table or view) and keep app as-is.
4. **friend_profiles:** Decide if it’s a view over `profiles_mode` or its own table, then add migration.

I can draft migrations for any of the “still need” items (e.g. `sub_profiles` table, `business_profiles` view, `public_profile_view`, `notifications` table) if you tell me which you want next.
