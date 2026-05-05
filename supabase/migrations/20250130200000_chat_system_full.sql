-- ─────────────────────────────────────────────────────────────────────────────
-- Winkly Chat System — Production Schema
-- v1.0 – January 2026
-- © Winkly Technologies UG (haftungsbeschränkt)
-- Purpose: Full chat infrastructure for 1:1, group, event, and system chats
-- ─────────────────────────────────────────────────────────────────────────────

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. ENUMS (extend existing)
-- ─────────────────────────────────────────────────────────────────────────────
DO $$ BEGIN
  ALTER TYPE conversation_type ADD VALUE 'system';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE dm_source AS ENUM (
  'match',           -- romance mutual like
  'connection',      -- friends/business mutual connection
  'invite',          -- manual invite accepted
  'event'            -- from event participation
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE message_type AS ENUM (
  'text', 'image', 'video', 'audio', 'file', 'gif', 'sticker',
  'system', 'poll', 'location', 'cta'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE delete_type AS ENUM ('none', 'for_me', 'for_everyone');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE member_role AS ENUM ('owner', 'admin', 'moderator', 'member');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE report_reason AS ENUM (
  'spam', 'harassment', 'inappropriate', 'fake', 'other'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. CONVERSATIONS — extend
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS last_message_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archived BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS name TEXT,
  ADD COLUMN IF NOT EXISTS is_system BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS system_type TEXT,
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS dm_source dm_source,
  ADD COLUMN IF NOT EXISTS dm_initiator UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS requires_approval BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS visibility visibility DEFAULT 'private';

-- Add dm_initiator only if we need it for DM metadata (already added above)
COMMENT ON COLUMN public.conversations.dm_initiator IS 'For DMs: user who initiated the conversation';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. CONVERSATION_MEMBERS — extend with role enum and left_at
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.conversation_members
  ADD COLUMN IF NOT EXISTS left_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS invited_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- Use member_role for new chats; keep TEXT for backward compat, use CHECK
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'conversation_members' AND column_name = 'role'
  ) THEN
    ALTER TABLE public.conversation_members ADD COLUMN role TEXT NOT NULL DEFAULT 'member';
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. CONVERSATION_MEMBER_SETTINGS — per-user inbox preferences
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.conversation_member_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pinned BOOLEAN NOT NULL DEFAULT false,
  muted BOOLEAN NOT NULL DEFAULT false,
  archived BOOLEAN NOT NULL DEFAULT false,
  last_read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (conversation_id, user_id)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. MESSAGES — extend
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS message_type message_type NOT NULL DEFAULT 'text',
  ADD COLUMN IF NOT EXISTS attachments JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS reply_to_id UUID REFERENCES public.messages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS delete_type delete_type NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'sent';

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. MESSAGE_REACTIONS
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.message_reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  emoji TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (message_id, user_id, emoji)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. MESSAGE_READ_RECEIPTS
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.message_read_receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  read_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (message_id, user_id)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. TYPING_INDICATORS (ephemeral; use Realtime presence or this table)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.typing_indicators (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (conversation_id, user_id)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 9. USER_BLOCKS
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.user_blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  blocker_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  blocked_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (blocker_id, blocked_id),
  CHECK (blocker_id != blocked_id)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 10. REPORTS
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.user_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reported_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reason report_reason NOT NULL,
  details TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (reporter_id, reported_id)
);

CREATE TABLE IF NOT EXISTS public.message_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  reporter_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reason report_reason NOT NULL,
  details TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (message_id, reporter_id)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 11. PINNED_MESSAGES
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pinned_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  message_id UUID NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  pinned_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (conversation_id, message_id)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 12. GROUPS — extend for business/community
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.groups
  ADD COLUMN IF NOT EXISTS group_type TEXT DEFAULT 'friends',
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS avatar_url TEXT,
  ADD COLUMN IF NOT EXISTS is_public BOOLEAN NOT NULL DEFAULT false;

-- group_type: 'friends' | 'business' | 'community' | 'event' | 'temporary'

-- ─────────────────────────────────────────────────────────────────────────────
-- 13. EVENT_CHAT_SETTINGS — extend
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.event_chat_settings
  ADD COLUMN IF NOT EXISTS auto_archive_days INT DEFAULT 7,
  ADD COLUMN IF NOT EXISTS allow_polls BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS allow_media BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS allow_location_share BOOLEAN NOT NULL DEFAULT true;

-- ─────────────────────────────────────────────────────────────────────────────
-- 14. VIEW: conversation_participants (alias for conversation_members)
-- ─────────────────────────────────────────────────────────────────────────────
-- Idempotent: drop table first (DROP VIEW errors if object is a table), then view, then create view
DROP TABLE IF EXISTS public.conversation_participants CASCADE;
DROP VIEW IF EXISTS public.conversation_participants;
CREATE VIEW public.conversation_participants AS
SELECT
  id,
  conversation_id,
  user_id,
  role,
  joined_at,
  left_at,
  invited_by
FROM public.conversation_members;

-- Grant select for RLS-covered view (underlying table has RLS)
ALTER VIEW public.conversation_participants SET (security_invoker = on);
GRANT SELECT ON public.conversation_participants TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 15. TRIGGER: update last_message_at on message insert
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.update_conversation_last_message()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.conversations
  SET last_message_at = NEW.created_at, updated_at = now()
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_update_conversation_last_message ON public.messages;
CREATE TRIGGER trg_update_conversation_last_message
  AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.update_conversation_last_message();

-- ─────────────────────────────────────────────────────────────────────────────
-- 16. FUNCTION: create event chat
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_event_chat(p_event_id UUID)
RETURNS UUID AS $$
DECLARE
  v_event RECORD;
  v_chat_id UUID;
  v_participant RECORD;
BEGIN
  SELECT id, created_by, title, mode INTO v_event
  FROM public.events WHERE id = p_event_id;
  IF v_event.id IS NULL THEN
    RAISE EXCEPTION 'Event not found';
  END IF;

  -- Create conversation
  INSERT INTO public.conversations (
    type, mode, created_by, related_event_id, name, is_system
  ) VALUES (
    'event', v_event.mode, v_event.created_by, p_event_id,
    'Event: ' || v_event.title, false
  ) RETURNING id INTO v_chat_id;

  -- Add host as owner
  INSERT INTO public.conversation_members (conversation_id, user_id, role)
  VALUES (v_chat_id, v_event.created_by, 'owner');

  -- Add participants who have RSVP'd
  FOR v_participant IN
    SELECT user_id FROM public.event_participants
    WHERE event_id = p_event_id AND rsvp_status IN ('accepted', 'going')
  LOOP
    INSERT INTO public.conversation_members (conversation_id, user_id, role)
    VALUES (v_chat_id, v_participant.user_id, 'member')
    ON CONFLICT (conversation_id, user_id) DO NOTHING;
  END LOOP;

  RETURN v_chat_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─────────────────────────────────────────────────────────────────────────────
-- 17. FUNCTION: create direct chat (with DM metadata)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_direct_chat(
  p_user_a UUID,
  p_user_b UUID,
  p_mode app_mode,
  p_source dm_source,
  p_initiator UUID
)
RETURNS UUID AS $$
DECLARE
  v_chat_id UUID;
  v_exists UUID;
BEGIN
  IF p_user_a = p_user_b THEN
    RAISE EXCEPTION 'Cannot create DM with self';
  END IF;

  -- Check block
  IF EXISTS (SELECT 1 FROM public.user_blocks
    WHERE (blocker_id = p_user_a AND blocked_id = p_user_b)
       OR (blocker_id = p_user_b AND blocked_id = p_user_a)) THEN
    RAISE EXCEPTION 'Cannot create chat: user is blocked';
  END IF;

  -- Check existing DM
  SELECT c.id INTO v_exists
  FROM public.conversations c
  JOIN public.conversation_members cm1 ON cm1.conversation_id = c.id AND cm1.user_id = p_user_a AND cm1.left_at IS NULL
  JOIN public.conversation_members cm2 ON cm2.conversation_id = c.id AND cm2.user_id = p_user_b AND cm2.left_at IS NULL
  WHERE c.type = 'dm' AND c.mode = p_mode
  LIMIT 1;

  IF v_exists IS NOT NULL THEN
    RETURN v_exists;
  END IF;

  INSERT INTO public.conversations (type, mode, created_by, dm_source, dm_initiator)
  VALUES ('dm', p_mode, p_initiator, p_source, p_initiator)
  RETURNING id INTO v_chat_id;

  INSERT INTO public.conversation_members (conversation_id, user_id, role)
  VALUES (v_chat_id, p_user_a, 'member'), (v_chat_id, p_user_b, 'member');

  RETURN v_chat_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─────────────────────────────────────────────────────────────────────────────
-- 18. RLS: Enable on new tables
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.conversation_member_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_read_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.typing_indicators ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pinned_messages ENABLE ROW LEVEL SECURITY;
