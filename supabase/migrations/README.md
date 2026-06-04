# Winkly — Supabase migrations (source of truth)

**Last updated:** 2026-06-03

All database schema, RLS, triggers, and RPCs live in this folder. There are **52** timestamped SQL files (run `(git ls-files supabase/migrations/*.sql).Count` — expect 52 on `main`).

Fresh environments:

```bash
supabase start          # optional: local stack
supabase db reset       # applies all migrations in order + seed.sql
```

Linked remote:

```bash
supabase link --project-ref <ref>
supabase db push
```

After apply, run `supabase/scripts/verify-setup.sql` in the SQL Editor.

---

## Audit name → repo object

Some checklists use legacy Dashboard names. The app and migrations use these equivalents:

| Audit / app name | In migrations |
|------------------|---------------|
| **chats** | `conversations` (+ `conversation_members`, `messages`) — `20250130200000_chat_system_full.sql` |
| **likes** | `romance_likes` — `20250130200003_direct_chat_triggers.sql`, romance feed migrations |
| **matches** (romance) | `romance_likes` + RPCs `romance_new_matches`, `romance_liked_profiles`, etc. — no separate `matches` table |
| **business_profiles** | **VIEW** over `profiles_business` — `20250216110000_remaining_tables_and_views.sql` |
| **friend_profiles** | **VIEW** over `user_profiles` + `profiles_mode` — `20250305100000` … `20260426121000` |
| **sub_profiles** | **TABLE** — created here in `20250130100001`, expanded in `20250216110000` |

---

## Core objects (where defined)

| Object | Primary migration(s) |
|--------|----------------------|
| `users`, `profiles_core`, `profiles_mode`, `profiles_business`, `events`, `planner_items`, `ai_requests`, … | `20250130000001_winkly_schema.sql` |
| RLS (core tables) | `20250130000002_winkly_rls.sql` |
| `user_profiles` | `20250130100000_user_profiles_with_instagram.sql` |
| `sub_profiles` | `20250130100001_align_sub_profiles.sql`, `20250216110000_remaining_tables_and_views.sql` |
| Chat stack (`conversations`, `messages`, …) | `20250130200000` … `20250130200004` |
| `romance_discover_feed` | `20250218100000`, hardened in `20260505220000` |
| `friends_discover_feed`, `business_discover_feed` | `20260605121000_mode_discover_feeds_rpc.sql` |
| `match_contacts` | `20260605120000_swipes_friends_requests_contacts_match.sql` |
| `profile_photo_verifications` | `20260405140000_behavior_matching_safety_rich_comms.sql` |
| Storage buckets | `20260613120000_storage_buckets_policies.sql` |

Full inventory: `docs/SQL_ORGANIZATION.md` §4.

---

## Do not

- Apply one-off schema only in the Supabase Dashboard without adding a migration here.
- Reuse the same `YYYYMMDDHHMMSS` prefix for two files (Supabase orders by filename).
- Edit migration files that are already applied on production — add a new timestamped file instead.
