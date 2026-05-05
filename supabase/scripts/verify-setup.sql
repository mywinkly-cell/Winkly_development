-- ────────────────────────────────────────────────
-- Winkly Supabase Setup Verification Script
-- Run in Supabase SQL Editor to check tables & policies
-- Aligned with current schema (docs/PRODUCT_DOCUMENTATION.md §4)
-- ────────────────────────────────────────────────

-- 1) CORE TABLES (current schema; includes user_profiles/sub_profiles used by app)
SELECT 'TABLES' AS check_type, table_name AS name,
  CASE WHEN table_name IN (
    'users', 'user_profiles', 'profiles_core', 'profiles_mode', 'profiles_business', 'sub_profiles',
    'follows', 'events', 'event_participants', 'event_invitations', 'event_chat_settings',
    'planner_items', 'planner_participants', 'planner_invitations',
    'conversations', 'conversation_members', 'conversation_member_settings',
    'messages', 'message_reactions', 'message_read_receipts',
    'groups', 'group_members',
    'wishlist_items', 'user_preferences', 'calendar_connections',
    'ai_requests', 'user_blocks', 'romance_likes'
  ) THEN 'required' ELSE 'optional' END AS status
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_type = 'BASE TABLE'
  AND table_name IN (
    'users', 'user_profiles', 'profiles_core', 'profiles_mode', 'profiles_business', 'sub_profiles',
    'follows', 'events', 'event_participants', 'event_invitations', 'event_chat_settings',
    'planner_items', 'planner_participants', 'planner_invitations',
    'conversations', 'conversation_members', 'conversation_member_settings',
    'messages', 'message_reactions', 'message_read_receipts',
    'groups', 'group_members',
    'wishlist_items', 'user_preferences', 'calendar_connections',
    'ai_requests', 'user_blocks', 'romance_likes'
  )
ORDER BY status DESC, table_name;

-- 2) VIEWS (optional: public_profile_view for romance if used)
SELECT 'VIEWS' AS check_type, table_name AS name, 'optional' AS status
FROM information_schema.views
WHERE table_schema = 'public'
  AND table_name IN ('public_profile_view');

-- 3) RLS STATUS (all core tables should have RLS enabled)
SELECT 'RLS' AS check_type, relname AS table_name,
  CASE WHEN relrowsecurity THEN 'enabled' ELSE 'DISABLED' END AS rls_status
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND relname IN (
    'users', 'user_profiles', 'profiles_core', 'profiles_mode', 'profiles_business', 'sub_profiles',
    'follows', 'events', 'event_participants', 'planner_items',
    'conversations', 'conversation_members', 'messages',
    'groups', 'group_members', 'romance_likes'
  )
ORDER BY relrowsecurity, relname;

-- 4) POLICIES COUNT per table (0 = missing policies)
SELECT 'POLICIES' AS check_type, tablename AS table_name,
  COUNT(*)::text AS policy_count
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'users', 'user_profiles', 'profiles_core', 'profiles_mode', 'profiles_business', 'sub_profiles',
    'follows', 'events', 'conversations', 'conversation_members',
    'messages', 'planner_items', 'groups', 'romance_likes'
  )
GROUP BY tablename
ORDER BY tablename;

-- 5) profiles_core — required columns
SELECT 'profiles_core COLUMNS' AS check_type, column_name,
  data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'profiles_core'
  AND column_name IN ('id', 'first_name', 'last_name', 'gender', 'birthday', 'city', 'education', 'languages', 'occupation', 'bio', 'instagram', 'core_photos', 'created_at', 'updated_at')
ORDER BY column_name;

-- 6) profiles_mode — required columns (app uses this for sub-profiles)
SELECT 'profiles_mode COLUMNS' AS check_type, column_name,
  data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'profiles_mode'
  AND column_name IN ('id', 'user_id', 'mode', 'bio', 'photos', 'interests', 'meta', 'created_at', 'updated_at')
ORDER BY column_name;

-- 7) profiles_business — required columns
SELECT 'profiles_business COLUMNS' AS check_type, column_name,
  data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'profiles_business'
  AND column_name IN ('id', 'business_name', 'location', 'area', 'bio', 'tags', 'website', 'instagram', 'facebook', 'linkedin', 'logo_uri', 'created_at', 'updated_at')
ORDER BY column_name;

-- 8) profiles_mode UNIQUE (user_id, mode)
SELECT 'profiles_mode CONSTRAINT' AS check_type,
  conname AS constraint_name,
  pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid = 'public.profiles_mode'::regclass
  AND contype = 'u';
