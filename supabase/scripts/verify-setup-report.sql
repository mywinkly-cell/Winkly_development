-- ────────────────────────────────────────────────
-- Winkly Supabase Setup Verification Report
-- Run in Supabase SQL Editor → copy all result tabs and share
-- Aligned with current schema (docs/PRODUCT_DOCUMENTATION.md §4)
-- ────────────────────────────────────────────────

-- QUERY 1: Required tables (missing = problem)
SELECT 'MISSING_TABLES' AS report_section, unnest(ARRAY[
  'users', 'user_profiles', 'profiles_core', 'profiles_mode', 'profiles_business', 'sub_profiles',
  'follows', 'events', 'event_participants', 'event_invitations', 'event_chat_settings',
  'planner_items', 'planner_participants', 'planner_invitations',
  'conversations', 'conversation_members', 'conversation_member_settings',
  'messages', 'groups', 'group_members',
  'wishlist_items', 'user_preferences', 'ai_requests', 'user_blocks', 'romance_likes'
]) AS required_table
EXCEPT
SELECT 'MISSING_TABLES', table_name::text
FROM information_schema.tables
WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
  AND table_name IN (
    'users', 'user_profiles', 'profiles_core', 'profiles_mode', 'profiles_business', 'sub_profiles',
    'follows', 'events', 'event_participants', 'event_invitations', 'event_chat_settings',
    'planner_items', 'planner_participants', 'planner_invitations',
    'conversations', 'conversation_members', 'conversation_member_settings',
    'messages', 'groups', 'group_members',
    'wishlist_items', 'user_preferences', 'ai_requests', 'user_blocks', 'romance_likes'
  );

-- QUERY 2: public_profile_view (optional)
SELECT 'VIEW_CHECK' AS report_section,
  COALESCE((SELECT 'exists' FROM information_schema.views
    WHERE table_schema = 'public' AND table_name = 'public_profile_view' LIMIT 1), 'optional_or_missing') AS public_profile_view;

-- QUERY 3: RLS status for critical tables
SELECT 'RLS_STATUS' AS report_section, c.relname AS table_name,
  CASE WHEN c.relrowsecurity THEN 'OK' ELSE 'DISABLED' END AS status
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r'
  AND c.relname IN ('users', 'user_profiles', 'profiles_core', 'profiles_mode', 'profiles_business', 'sub_profiles', 'conversations', 'conversation_members', 'messages', 'events', 'romance_likes');

-- QUERY 4: Policy counts (0 = problem)
SELECT 'POLICY_COUNT' AS report_section, p.tablename AS table_name,
  COALESCE(COUNT(*), 0)::text AS policies
FROM (SELECT unnest(ARRAY['users', 'user_profiles', 'profiles_core', 'profiles_mode', 'profiles_business', 'sub_profiles', 'conversations', 'conversation_members', 'messages', 'events', 'romance_likes']) AS tablename) t
LEFT JOIN pg_policies p ON p.schemaname = 'public' AND p.tablename = t.tablename
GROUP BY t.tablename
ORDER BY t.tablename;

-- QUERY 5: profiles_mode — interests & meta columns (required for app)
SELECT 'PROFILES_MODE_COLUMNS' AS report_section, column_name,
  CASE WHEN column_name IN ('interests', 'meta') THEN 'required' ELSE 'ok' END AS note
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'profiles_mode'
  AND column_name IN ('user_id', 'mode', 'bio', 'photos', 'interests', 'meta')
ORDER BY column_name;

-- QUERY 6: profiles_mode unique constraint
SELECT 'PROFILES_MODE_CONSTRAINT' AS report_section,
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.profiles_mode'::regclass AND contype = 'u'
  ) THEN 'OK: unique constraint exists' ELSE 'MISSING: need unique(user_id, mode)' END AS status;
