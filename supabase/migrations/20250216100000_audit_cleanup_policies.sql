-- ─────────────────────────────────────────────────────────────────────────────
-- Audit cleanup: remove duplicate policies, ensure critical tables have RLS
-- Run after audit-supabase.sql; fixes duplicate user_blocks policies and
-- adds missing policies for conversation_members and romance_likes if absent.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Remove duplicate user_blocks policies (keep snake_case set)
DROP POLICY IF EXISTS "user_blocks: delete own" ON public.user_blocks;
DROP POLICY IF EXISTS "user_blocks: insert own" ON public.user_blocks;
DROP POLICY IF EXISTS "user_blocks: read own" ON public.user_blocks;

-- 2. conversation_members: ensure one policy for all operations (if table exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'conversation_members') THEN
    ALTER TABLE public.conversation_members ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS conversation_members_all ON public.conversation_members;
    CREATE POLICY conversation_members_all ON public.conversation_members FOR ALL USING (
      auth.uid() = user_id OR
      EXISTS (SELECT 1 FROM public.conversations c WHERE c.id = conversation_id AND c.created_by = auth.uid())
    );
  END IF;
END $$;

-- 3. romance_likes: ensure select/insert/delete policies (if table exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'romance_likes') THEN
    ALTER TABLE public.romance_likes ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS rl_select ON public.romance_likes;
    DROP POLICY IF EXISTS rl_insert ON public.romance_likes;
    DROP POLICY IF EXISTS rl_delete ON public.romance_likes;
    CREATE POLICY rl_select ON public.romance_likes FOR SELECT USING (
      auth.uid() = liker_id OR auth.uid() = liked_id
    );
    CREATE POLICY rl_insert ON public.romance_likes FOR INSERT WITH CHECK (auth.uid() = liker_id);
    CREATE POLICY rl_delete ON public.romance_likes FOR DELETE USING (auth.uid() = liker_id);
  END IF;
END $$;
