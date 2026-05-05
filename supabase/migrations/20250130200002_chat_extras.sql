-- ─────────────────────────────────────────────────────────────────────────────
-- Winkly Chat System — Extras (starred, event triggers, edge cases)
-- v1.0 – January 2026
-- ─────────────────────────────────────────────────────────────────────────────

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. STARRED_MESSAGES (per-user saved messages)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.starred_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (message_id, user_id)
);

ALTER TABLE public.starred_messages ENABLE ROW LEVEL SECURITY;

-- RLS: own stars only (idempotent)
DROP POLICY IF EXISTS sm_select ON public.starred_messages;
DROP POLICY IF EXISTS sm_insert ON public.starred_messages;
DROP POLICY IF EXISTS sm_delete ON public.starred_messages;
CREATE POLICY sm_select ON public.starred_messages FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY sm_insert ON public.starred_messages FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY sm_delete ON public.starred_messages FOR DELETE USING (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. TRIGGER: Auto-create event chat when first participant RSVPs
-- ─────────────────────────────────────────────────────────────────────────────
-- Ensure rsvp_status exists (some DBs have event_participants without it)
ALTER TABLE public.event_participants ADD COLUMN IF NOT EXISTS rsvp_status TEXT NOT NULL DEFAULT 'pending';

CREATE OR REPLACE FUNCTION public.maybe_create_event_chat()
RETURNS TRIGGER AS $$
DECLARE
  v_settings RECORD;
  v_exists UUID;
BEGIN
  IF NEW.rsvp_status NOT IN ('accepted', 'going') THEN
    RETURN NEW;
  END IF;

  -- Check if chat is enabled for this event
  SELECT chat_enabled INTO v_settings
  FROM public.event_chat_settings
  WHERE event_id = NEW.event_id;
  
  IF v_settings.chat_enabled = false THEN
    RETURN NEW;
  END IF;

  -- Check if event chat already exists
  SELECT id INTO v_exists
  FROM public.conversations
  WHERE related_event_id = NEW.event_id AND type = 'event'
  LIMIT 1;

  IF v_exists IS NULL THEN
    PERFORM public.create_event_chat(NEW.event_id);
  ELSE
    -- Add this user to the event chat if not already a member
    INSERT INTO public.conversation_members (conversation_id, user_id, role)
    SELECT v_exists, NEW.user_id, 'member'
    WHERE NOT EXISTS (
      SELECT 1 FROM public.conversation_members
      WHERE conversation_id = v_exists AND user_id = NEW.user_id
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_maybe_create_event_chat ON public.event_participants;
CREATE TRIGGER trg_maybe_create_event_chat
  AFTER INSERT OR UPDATE OF rsvp_status ON public.event_participants
  FOR EACH ROW EXECUTE FUNCTION public.maybe_create_event_chat();

-- Ensure event_chat_settings exists for events (default true)
CREATE OR REPLACE FUNCTION public.ensure_event_chat_settings()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.event_chat_settings (event_id, chat_enabled)
  VALUES (NEW.id, true)
  ON CONFLICT (event_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_ensure_event_chat_settings ON public.events;
CREATE TRIGGER trg_ensure_event_chat_settings
  AFTER INSERT ON public.events
  FOR EACH ROW EXECUTE FUNCTION public.ensure_event_chat_settings();

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. RLS: Exclude blocked users from conversation visibility
-- conversations SELECT already uses conversation_members; blocks prevent creation.
-- For messages: exclude messages from blocked users (optional, app-level is fine).
-- We add a helper function for app use.
-- ─────────────────────────────────────────────────────────────────────────────

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. RLS: Exclude left members from conversations/messages
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS conversations_select ON public.conversations;
CREATE POLICY conversations_select ON public.conversations FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.conversation_members cm
    WHERE cm.conversation_id = conversations.id AND cm.user_id = auth.uid() AND cm.left_at IS NULL)
);

DROP POLICY IF EXISTS messages_select ON public.messages;
CREATE POLICY messages_select ON public.messages FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.conversation_members cm
    WHERE cm.conversation_id = messages.conversation_id AND cm.user_id = auth.uid() AND cm.left_at IS NULL)
);

-- Grant execute for RPCs
GRANT EXECUTE ON FUNCTION public.create_direct_chat(UUID, UUID, app_mode, dm_source, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_event_chat(UUID) TO authenticated;
