-- ─────────────────────────────────────────────────────────────────────────────
-- Winkly Supabase audit script
-- Run in Supabase SQL Editor (run all; multiple result sets are normal).
-- Does not modify data; only reports tables, views, RLS, and policies.
-- See docs/SUPABASE_AUDIT.md for how to use this and fix issues.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1) All tables in public (name, RLS enabled, approx rows from stats)
SELECT
  c.relname AS name,
  CASE WHEN c.relrowsecurity THEN 'yes' ELSE 'NO' END AS rls_enabled,
  COALESCE(s.n_live_tup::bigint, 0) AS approx_rows
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
LEFT JOIN pg_stat_user_tables s ON s.relid = c.oid AND s.schemaname = 'public'
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND NOT c.relispartition
ORDER BY c.relname;

-- 2) All views in public
SELECT
  'VIEW' AS kind,
  table_name AS name
FROM information_schema.views
WHERE table_schema = 'public'
ORDER BY table_name;

-- 3) RLS status: every public table (DISABLED = needs fix)
SELECT
  c.relname AS table_name,
  CASE WHEN c.relrowsecurity THEN 'OK' ELSE 'DISABLED' END AS rls_status
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND NOT c.relispartition
ORDER BY c.relrowsecurity NULLS FIRST, c.relname;

-- 4) Policy count per table (0 = missing policies)
SELECT
  COALESCE(p.tablename, t.tablename) AS table_name,
  COALESCE(COUNT(p.policyname), 0)::int AS policy_count
FROM (
  SELECT relname AS tablename
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relispartition
) t
LEFT JOIN pg_policies p ON p.schemaname = 'public' AND p.tablename = t.tablename
GROUP BY COALESCE(p.tablename, t.tablename)
ORDER BY policy_count ASC, table_name;

-- 5) Expected tables (from repo + app) — MISSING = not found in DB
WITH expected AS (
  SELECT unnest(ARRAY[
    'users', 'user_profiles', 'profiles_core', 'profiles_mode', 'profiles_business',
    'sub_profiles', 'follows', 'events', 'event_participants', 'event_invitations',
    'event_chat_settings', 'planner_items', 'planner_participants', 'planner_invitations',
    'conversations', 'conversation_members', 'conversation_member_settings',
    'messages', 'message_reactions', 'message_read_receipts', 'typing_indicators',
    'user_blocks', 'user_reports', 'message_reports', 'pinned_messages', 'starred_messages',
    'groups', 'group_members', 'wishlist_items', 'user_preferences',
    'calendar_connections', 'ai_requests', 'romance_likes'
  ]) AS name
),
actual AS (
  SELECT relname AS name
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relispartition
)
SELECT 'MISSING' AS status, e.name
FROM expected e
LEFT JOIN actual a ON a.name = e.name
WHERE a.name IS NULL
ORDER BY e.name;

-- 6) Extra tables (in DB but not in expected list) — possible legacy
WITH expected AS (
  SELECT unnest(ARRAY[
    'users', 'user_profiles', 'profiles_core', 'profiles_mode', 'profiles_business',
    'sub_profiles', 'follows', 'events', 'event_participants', 'event_invitations',
    'event_chat_settings', 'planner_items', 'planner_participants', 'planner_invitations',
    'conversations', 'conversation_members', 'conversation_member_settings',
    'messages', 'message_reactions', 'message_read_receipts', 'typing_indicators',
    'user_blocks', 'user_reports', 'message_reports', 'pinned_messages', 'starred_messages',
    'groups', 'group_members', 'wishlist_items', 'user_preferences',
    'calendar_connections', 'ai_requests', 'romance_likes'
  ]) AS name
),
actual AS (
  SELECT relname AS name
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relispartition
)
SELECT 'EXTRA' AS status, a.name
FROM actual a
LEFT JOIN expected e ON e.name = a.name
WHERE e.name IS NULL
ORDER BY a.name;

-- 7) user_profiles SELECT policy (security: "viewable by all" = broad)
SELECT
  schemaname,
  tablename,
  policyname,
  cmd,
  qual::text AS using_expression
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'user_profiles'
  AND cmd = 'SELECT';

-- 8) List all policies (summary) for critical tables
SELECT
  tablename,
  policyname,
  cmd AS operation,
  permissive
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'users', 'user_profiles', 'profiles_core', 'profiles_mode', 'profiles_business',
    'conversations', 'conversation_members', 'messages', 'user_blocks', 'romance_likes'
  )
ORDER BY tablename, cmd, policyname;
