# Winkly — SQL organization and cleanup guide

How to keep Supabase SQL clean, well structured, and organized when you have many queries (e.g. 100+ in the Dashboard or across migrations).

**Last updated:** 2026-06-02

---

## 1. Where your SQL lives

| Location | Purpose | Versioned? |
|----------|---------|------------|
| **Supabase Dashboard → SQL Editor** | Ad‑hoc runs, saved snippets, one-off fixes | No (lives only in Supabase) |
| **Repo: `supabase/migrations/`** | Schema, RLS, triggers, functions — **source of truth** | Yes (git) |
| **Repo: `supabase/scripts/`** | Verification, seeds, one-off runnable scripts | Yes (git) |

**Goal:** Anything that defines or changes your database shape should end up in **migrations**. Queries that are only for inspection or one-off fixes can stay in scripts or be run from the Dashboard.

---

## 2. If you have 100+ queries in the Supabase Dashboard

Queries saved in the SQL Editor are **not** in your repo. To clean and organize:

### Step 1: Export from Dashboard

1. Open **Supabase Dashboard** → your project → **SQL Editor**.
2. Use **Saved queries** (if you have them) or open each query you care about.
3. Copy each query into a single folder on your machine, e.g. `supabase/_exported_queries/`, one file per logical query (e.g. `01_create_xyz.sql`, `02_fix_abc.sql`).

There is no bulk export; you copy manually or use the History tab to re-run and copy.

### Step 2: Classify each file

For each exported file, label it:

- **Schema** — `CREATE TABLE`, `ALTER TABLE`, `CREATE TYPE`, indexes, constraints.
- **RLS** — `ENABLE ROW LEVEL SECURITY`, `CREATE POLICY`.
- **Triggers / functions** — `CREATE TRIGGER`, `CREATE OR REPLACE FUNCTION`, RPCs.
- **Data** — `INSERT`, `UPDATE`, `DELETE` (seeds or one-off fixes).
- **Read-only** — `SELECT` only (reports, checks). These don’t need to be migrations.

### Step 3: Merge into migrations (schema / RLS / triggers)

- **Don’t** add 100 separate migration files. Group by theme and order by dependency:
  - Schema (tables, enums, indexes) first.
  - Then RLS.
  - Then triggers and functions.
- Create **new migrations** only for changes you still need that aren’t already in the repo. Name them:

  `YYYYMMDDHHMMSS_short_description.sql`

  Example: `20260213120000_add_xyz_index.sql`

- If a Dashboard query **duplicates** what’s already in a migration, **delete** the Dashboard copy and rely on the migration.

### Step 4: Put read-only and one-off scripts in `supabase/scripts/`

- Verification (e.g. “list tables”, “check RLS”) → `scripts/`.
- One-off data fixes → run once from Dashboard or a script, then document in a comment; only add a migration if you need the same fix for new environments.

---

## 3. Repo structure (what you have now)

```
supabase/
├── config.toml
├── migrations/                    # 48 SQL files — see README.md in this folder
│   ├── README.md                  # Audit name mapping + core object index
│   ├── 20250130000001_winkly_schema.sql
│   └── … (through 20260614120000_location_privacy_precision.sql)
├── seed.sql                       # Loaded on db reset
├── scripts/                       # Run manually when needed
│   ├── verify-setup.sql           # Tables, views, RPCs after migrate
│   └── …
└── functions/
```

---

## 4. Migration inventory (what each file does)

**48 files** on `main`. Full list and audit-name mapping: **`supabase/migrations/README.md`**.

Grouped summary (apply in timestamp order):

| Group | Migrations (prefix range) | Purpose |
|-------|---------------------------|---------|
| **Core schema + RLS** | `20250130000001` … `20250130000003` | Enums, `users`, `profiles_core`, `profiles_mode`, `profiles_business`, events, planner, conversations, messages, `ai_requests`, `handle_new_user`; core RLS |
| **Profiles** | `20250130100000`, `20250130100001` | `user_profiles`; `sub_profiles` create + align |
| **Chat** | `20250130200000` … `20250130200004` | Full chat stack, RLS, triggers, unread counts, `romance_likes`, `romance_new_matches` |
| **Subscriptions & audit** | `20250216000001` … `20250216110000` | Tiers, event chat rules, `sub_profiles` / views (`business_profiles`, `friend_profiles`, `public_profile_view`), companies |
| **Planner & romance** | `20250217000000` … `20250223000000` | Planner invitations, super-like, `romance_discover_feed` |
| **Friends & auth** | `20250305000000` … `20250306100000` | Direct chat alias, friend_profiles views, auth trigger |
| **Groups & compatibility** | `20250315100000`, `20250315110000` | Group invitations, embeddings |
| **Concierge & behavior** | `20260405140000` … `20260408120000` | `profile_photo_verifications`, behavior signals, concierge RPCs, AI match proposals |
| **Plans & events** | `20260422120000` … `20260426121000` | Pending plans, confirmed events, night_owl views |
| **Security & feeds** | `20260505220000` … `20260605121000` | Feed hardening, push tokens, friends feed fixes, swipes/requests, `match_contacts`, mode discover RPCs |
| **Onboarding & geo** | `20260606140000` … `20260610120000` | Friends accept/decline, onboarding fields, dates view, PostGIS |
| **Messaging & push** | `20260611120000` … `20260612130000` | Match-gated messaging, `messages.client_id`, push triggers |
| **Storage & privacy** | `20260613120000`, `20260614120000` | Storage buckets/policies; location privacy |

Key single files (detail):

| Migration | Purpose |
|-----------|---------|
| `20250130000001_winkly_schema.sql` | Core tables: `users`, `profiles_core`, `profiles_mode`, `profiles_business`, `events`, `planner_items`, `conversations`, `messages`, `ai_requests`, … |
| `20250130100001_align_sub_profiles.sql` | Creates + aligns `sub_profiles` (must run before later profile migrations) |
| `20250216110000_remaining_tables_and_views.sql` | `sub_profiles`, `business_profiles` / `friend_profiles` views, notifications scaffolding |
| `20260605121000_mode_discover_feeds_rpc.sql` | `friends_discover_feed`, `business_discover_feed` |
| `20260605120000_swipes_friends_requests_contacts_match.sql` | `match_contacts` |
| `20260613120000_storage_buckets_policies.sql` | `user-photos`, `user-videos`, `business-logos` buckets |

---

## 5. Naming and ordering rules

- **One logical change per migration** (e.g. “add chat RLS” rather than “misc fixes”).
- **Timestamp prefix** — `YYYYMMDDHHMMSS` so order is clear and Supabase applies them in order.
- **Snake_case description** — e.g. `_conversation_unread_counts.sql`.
- **Idempotent where possible** — use `IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`, or `DO $$ ... EXCEPTION WHEN duplicate_object THEN NULL` for enums so re-running doesn’t fail.

---

## 6. Checklist: “Do I have everything?”

- [ ] **Schema** — All tables and enums from `docs/PRODUCT_DOCUMENTATION.md` §4 (Data model) exist and match (or are documented if intentionally different).
- [ ] **RLS** — Every `public` table has RLS enabled and policies that match the product rules (§4.3).
- [ ] **Triggers** — `handle_new_user`, chat creation (e.g. direct chat on mutual follow), and any other triggers described in §4.4 exist and are correct.
- [ ] **RPCs** — e.g. `create_direct_chat`, `create_event_chat` exist if the app or docs rely on them.
- [ ] **No duplicate definitions** — Same table/policy/function isn’t created in two migrations (merge or remove the duplicate).
- [ ] **Scripts** — `verify-setup.sql` / `verify-setup-report.sql` check the **current** table names (`profiles_core`, `profiles_mode`, `conversation_members`, etc.) so they’re useful for the live DB.

---

## 7. Quick cleanup workflow

1. **List** — Export or list every SQL you care about (Dashboard + repo migrations + scripts).
2. **Classify** — Schema vs RLS vs triggers vs data vs read-only.
3. **Dedupe** — Compare with the migration inventory above; drop or merge duplicates.
4. **Gap-fill** — For anything in the product doc (§4) that’s missing, add one focused migration.
5. **Scripts** — Keep verification and seeds in `supabase/scripts/`; ensure they target current schema.
6. **Dashboard** — Delete or archive saved queries that are now in migrations so the “source of truth” is the repo.

After that, any new change should go into a **new timestamped migration** (or a script if it’s truly one-off), and `docs/PRODUCT_DOCUMENTATION.md` should be updated when schema or RLS behavior changes.
