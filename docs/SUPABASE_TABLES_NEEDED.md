# Winkly — Tables needed vs in Supabase

**Purpose:** Which tables the app uses, which exist in repo migrations, and what to run for a reproducible database.

**Last updated:** 2026-06-02

---

## Source of truth

All schema is version-controlled in **`supabase/migrations/`** (48 SQL files on `main`). See **`supabase/migrations/README.md`** for the audit-name mapping (e.g. `chats` → `conversations`, `likes` → `romance_likes`).

```bash
supabase db reset    # local: migrations + seed
supabase db push     # linked remote
```

Then run **`supabase/scripts/verify-setup.sql`** in the SQL Editor.

---

## 1. Tables/views the app uses

| Table or view | Used in (examples) | In repo migrations? |
|---------------|-------------------|---------------------|
| **user_profiles** | Chats, planner, profile, onboarding, splash, signin, discover | Yes — `20250130100000_user_profiles_with_instagram.sql` |
| **sub_profiles** | ModeContext, mode-selection, profile-core, preview | Yes — `20250130100001_align_sub_profiles.sql`, `20250216110000_remaining_tables_and_views.sql` |
| **users** | ModeContext, welcome-personal, romance matches | Yes — `20250130000001_winkly_schema.sql` |
| **business_profiles** | Business discover, onboarding-business, uploadLogo | Yes — **view** in `20250216110000_remaining_tables_and_views.sql` |
| **profiles_business** | lib/access/profiles.ts | Yes — `20250130000001_winkly_schema.sql` |
| **profiles_mode** | lib/access/profiles, friends index/discover | Yes — `20250130000001_winkly_schema.sql` |
| **profiles_core** | lib/access/profiles | Yes — `20250130000001_winkly_schema.sql` |
| **friend_profiles** | Friends index, discover, profile-view | Yes — view; `20250305100000` … `20260426121000` |
| **public_profile_view** | Romance liked, profile-view, discover | Yes — `20250216110000_remaining_tables_and_views.sql` |
| **conversations** | Chats index, chat-view, hooks | Yes — chat migrations |
| **messages** | Chats, api, hooks | Yes — chat migrations |
| **romance_likes** | Chats api (unmatch), discover | Yes — `20250130200003_direct_chat_triggers.sql` |
| **profile_photo_verifications** | verify-profile-photo edge function | Yes — `20260405140000_behavior_matching_safety_rich_comms.sql` |
| **events**, **planner_items**, **ai_requests**, … | Mode screens, concierge | Yes — core + feature migrations |

---

## 2. RPCs the app calls (discover / matches / contacts)

| RPC | Migration(s) |
|-----|----------------|
| `romance_discover_feed` | `20250218100000`, security in `20260505220000`; geo variant in `20260610120000` |
| `friends_discover_feed` | `20260605121000`, fixes in `20260505232000` |
| `business_discover_feed` | `20260605121000` |
| `match_contacts` | `20260605120000_swipes_friends_requests_contacts_match.sql` |
| `romance_new_matches` | `20250130200003_direct_chat_triggers.sql` |

---

## 3. Optional / product-specific (may still be missing)

| Name | Situation | What to do |
|------|-----------|------------|
| **companies** | Business discover references | Add migration if product needs a dedicated table |
| **business_services** | Business discover | Add migration if needed |
| **notifications** | `app/(shared-ui)/notifications` | Add migration if not using push-only flow |
| **events_planner_items** | Legacy name in some screens | Prefer `planner_items` with `source_mode = 'events'` or add a view |

---

## 4. Checklist for new contributors

1. Clone repo and confirm migrations: `(git ls-files supabase/migrations/*.sql).Count` → **48**.
2. `supabase db reset` (or `db push` on staging).
3. Run `supabase/scripts/verify-setup.sql`.
4. Regenerate types: `npx supabase gen types typescript --linked --schema public` → `apps/mobile/types/database.ts`.

---

## 5. Historical note

Audits that reported “only `20260613120000_storage_buckets_policies.sql` in git” were **incorrect for current `main`**: the full chain from `20250130000001_winkly_schema.sql` through `20260614120000_location_privacy_precision.sql` is committed. If your clone shows one file, run `git pull` and verify you are on `main`.
