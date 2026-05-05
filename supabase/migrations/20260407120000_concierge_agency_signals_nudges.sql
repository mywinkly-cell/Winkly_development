-- Concierge agency: structured preference signals, stale-DM nudges (icebreaker logic), calendar_connections metadata
-- v1 — March 2026

-- 1. User-level signals (avoid loud bars, prefer quiet garden, vegan, professional topics) — merged by AI gateway + client
CREATE TABLE IF NOT EXISTS public.user_concierge_signals (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  signals JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.user_concierge_signals IS 'Structured preference signals for concierge (avoid/prefer venues, noise, dietary, professional_topics). Merged with profiles_mode.meta in ai-gateway.';

ALTER TABLE public.user_concierge_signals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_concierge_signals_own ON public.user_concierge_signals;
CREATE POLICY user_concierge_signals_own ON public.user_concierge_signals
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_concierge_signals TO authenticated;

-- 2. Dismissals for proactive "icebreaker" nudge card (per user per conversation)
CREATE TABLE IF NOT EXISTS public.concierge_nudge_dismissals (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  dismissed_until TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '7 days'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, conversation_id)
);

COMMENT ON TABLE public.concierge_nudge_dismissals IS 'User snoozed the stale-DM concierge nudge for this conversation until dismissed_until.';

ALTER TABLE public.concierge_nudge_dismissals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS concierge_nudge_dismissals_own ON public.concierge_nudge_dismissals;
CREATE POLICY concierge_nudge_dismissals_own ON public.concierge_nudge_dismissals
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.concierge_nudge_dismissals TO authenticated;

-- 3. Optional: sync state for Google Calendar (tokens remain in token_encrypted)
ALTER TABLE public.calendar_connections
  ADD COLUMN IF NOT EXISTS scopes TEXT,
  ADD COLUMN IF NOT EXISTS token_expires_at TIMESTAMPTZ;

COMMENT ON COLUMN public.calendar_connections.scopes IS 'OAuth scopes granted (e.g. https://www.googleapis.com/auth/calendar.readonly)';
COMMENT ON COLUMN public.calendar_connections.token_expires_at IS 'Access token expiry (refresh earlier)';

-- 4. RPC: is this DM stale for a proactive networking nudge? (Friends/Business, last activity > N hours)
CREATE OR REPLACE FUNCTION public.conversation_eligible_for_concierge_nudge(
  p_conversation_id UUID,
  p_stale_hours INT DEFAULT 48
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.conversations c
    INNER JOIN public.conversation_members cm
      ON cm.conversation_id = c.id AND cm.user_id = auth.uid() AND cm.left_at IS NULL
    WHERE c.id = p_conversation_id
      AND c.type::text IN ('dm', 'direct')
      AND c.mode IN ('friends', 'business')
      AND c.last_message_at IS NOT NULL
      AND c.last_message_at < now() - (p_stale_hours * interval '1 hour')
      AND NOT EXISTS (
        SELECT 1 FROM public.concierge_nudge_dismissals d
        WHERE d.user_id = auth.uid()
          AND d.conversation_id = c.id
          AND d.dismissed_until > now()
      )
  );
$$;

GRANT EXECUTE ON FUNCTION public.conversation_eligible_for_concierge_nudge(UUID, INT) TO authenticated;

-- 5. RPC: snooze nudge
CREATE OR REPLACE FUNCTION public.dismiss_concierge_nudge(
  p_conversation_id UUID,
  p_snooze_days INT DEFAULT 7
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.concierge_nudge_dismissals (user_id, conversation_id, dismissed_until)
  VALUES (
    auth.uid(),
    p_conversation_id,
    now() + (GREATEST(1, LEAST(p_snooze_days, 90)) || ' days')::interval
  )
  ON CONFLICT (user_id, conversation_id) DO UPDATE SET
    dismissed_until = now() + (GREATEST(1, LEAST(p_snooze_days, 90)) || ' days')::interval;
END;
$$;

GRANT EXECUTE ON FUNCTION public.dismiss_concierge_nudge(UUID, INT) TO authenticated;
