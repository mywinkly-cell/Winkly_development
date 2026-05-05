-- Expo push tokens per device (multiple rows per user allowed).

CREATE TABLE IF NOT EXISTS public.user_push_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  expo_push_token TEXT NOT NULL,
  platform TEXT NOT NULL DEFAULT 'unknown',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, expo_push_token)
);

CREATE INDEX IF NOT EXISTS user_push_tokens_user_id_idx ON public.user_push_tokens (user_id);

ALTER TABLE public.user_push_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS upt_select_own ON public.user_push_tokens;
DROP POLICY IF EXISTS upt_insert_own ON public.user_push_tokens;
DROP POLICY IF EXISTS upt_update_own ON public.user_push_tokens;
DROP POLICY IF EXISTS upt_delete_own ON public.user_push_tokens;

CREATE POLICY upt_select_own ON public.user_push_tokens FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY upt_insert_own ON public.user_push_tokens FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY upt_update_own ON public.user_push_tokens FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY upt_delete_own ON public.user_push_tokens FOR DELETE USING (auth.uid() = user_id);
