# Supabase audit script

Run **audit-supabase.sql** in the Supabase SQL Editor to get a check-up report of your database: tables, views, RLS status, policy counts, and expected vs extra tables.

## How to run

1. Open **Supabase Dashboard** → your project → **SQL Editor**.
2. Open or paste the contents of **audit-supabase.sql**.
3. Click **Run** (or run the whole script). You will get several result tabs.
4. Review each tab:
   - **Query 1:** All tables with RLS and approx row count.
   - **Query 2:** All views.
   - **Query 3:** RLS status (flag any `DISABLED`).
   - **Query 4:** Policy count per table (0 = add policies).
   - **Query 5:** Expected tables that are **missing** in the DB.
   - **Query 6:** **Extra** tables (in DB but not in the expected list — possible legacy).
   - **Query 7:** `user_profiles` SELECT policy (security: “viewable by all” is broad).
   - **Query 8:** Policies on critical tables.

## What to do with the results

- Use **docs/SUPABASE_AUDIT.md** for full findings and recommendations.
- Fix missing tables or policies with **new migrations** in `supabase/migrations/`.
- Move schema/RLS from Dashboard saved queries into migrations; see **docs/SQL_ORGANIZATION.md**.

The script is **read-only**; it does not change any data or schema.
