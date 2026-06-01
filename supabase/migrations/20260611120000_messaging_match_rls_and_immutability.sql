-- ─────────────────────────────────────────────────────────────────────────────
-- Winkly Messaging — Match-gated sending, immutability (evidence trail),
-- delivered/seen receipts, and Realtime live delivery.
-- v1.0 – June 2026
-- ─────────────────────────────────────────────────────────────────────────────
-- Spec covered:
--  • Only matched users can message each other  → enforced via RLS on messages
--    (romance match DMs require an active mutual like; all DMs require no block).
--  • Real-time delivery                          → tables added to supabase_realtime.
--  • Read receipts (delivered + seen)            → message_delivery_receipts (delivered)
--    complements existing message_read_receipts (seen).
--  • Conversations keyed by the match            → conversations.dm_pair_key + unique
--    index guarantees one DM conversation per matched pair per mode.
--  • Messages are not deletable post-send        → DELETE/UPDATE removed at RLS and a
--    BEFORE UPDATE/DELETE trigger blocks user-role mutation (safety / evidence trail).
--  • Message reporting                           → message_reports already exists.
-- ─────────────────────────────────────────────────────────────────────────────

-- ─────────────────────────────────────────────────────────────────────────────
-- 0. Align conversation_type with the app + this migration's DM logic.
--    Older deployments created the DM value as 'direct'; the app and the rest of
--    this file use 'dm'. Rename if needed (no-op on fresh installs).
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
             WHERE t.typname = 'conversation_type' AND e.enumlabel = 'direct')
     AND NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
             WHERE t.typname = 'conversation_type' AND e.enumlabel = 'dm') THEN
    ALTER TYPE public.conversation_type RENAME VALUE 'direct' TO 'dm';
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. CONVERSATIONS — deterministic match/pair key ("keyed by match")
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS dm_pair_key TEXT;

COMMENT ON COLUMN public.conversations.dm_pair_key IS
  'For DM conversations: deterministic key of the matched pair (sorted user ids). Guarantees a single conversation per matched pair per mode.';

-- Backfill existing 1:1 conversations from their two members (sorted user ids).
UPDATE public.conversations c
SET dm_pair_key = sub.pair_key
FROM (
  SELECT cm.conversation_id,
         MIN(cm.user_id::text) || ':' || MAX(cm.user_id::text) AS pair_key
  FROM public.conversation_members cm
  GROUP BY cm.conversation_id
  HAVING COUNT(*) = 2
) sub
WHERE c.id = sub.conversation_id
  AND c.type = 'dm'
  AND c.dm_pair_key IS NULL;

-- One DM conversation per (mode, matched pair). Degrades to a non-unique index if
-- legacy duplicate pairs exist so the migration never hard-fails.
DO $$
BEGIN
  CREATE UNIQUE INDEX uq_conversations_dm_pair
    ON public.conversations (mode, dm_pair_key)
    WHERE type = 'dm' AND dm_pair_key IS NOT NULL;
EXCEPTION
  WHEN duplicate_table THEN NULL;
  WHEN unique_violation THEN
    RAISE NOTICE 'Duplicate DM pairs detected; creating non-unique index for dm_pair_key.';
    CREATE INDEX IF NOT EXISTS uq_conversations_dm_pair
      ON public.conversations (mode, dm_pair_key)
      WHERE type = 'dm' AND dm_pair_key IS NOT NULL;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. create_direct_chat — set dm_pair_key for new DMs
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
  v_pair_key TEXT;
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

  v_pair_key := LEAST(p_user_a::text, p_user_b::text) || ':' || GREATEST(p_user_a::text, p_user_b::text);

  -- Check existing DM (by pair key first, then by membership for legacy rows)
  SELECT c.id INTO v_exists
  FROM public.conversations c
  WHERE c.type = 'dm' AND c.mode = p_mode AND c.dm_pair_key = v_pair_key
  LIMIT 1;

  IF v_exists IS NULL THEN
    SELECT c.id INTO v_exists
    FROM public.conversations c
    JOIN public.conversation_members cm1 ON cm1.conversation_id = c.id AND cm1.user_id = p_user_a AND cm1.left_at IS NULL
    JOIN public.conversation_members cm2 ON cm2.conversation_id = c.id AND cm2.user_id = p_user_b AND cm2.left_at IS NULL
    WHERE c.type = 'dm' AND c.mode = p_mode
    LIMIT 1;
  END IF;

  IF v_exists IS NOT NULL THEN
    -- Ensure legacy row carries the pair key.
    UPDATE public.conversations SET dm_pair_key = v_pair_key
    WHERE id = v_exists AND dm_pair_key IS NULL;
    RETURN v_exists;
  END IF;

  INSERT INTO public.conversations (type, mode, created_by, dm_source, dm_initiator, dm_pair_key)
  VALUES ('dm', p_mode, p_initiator, p_source, p_initiator, v_pair_key)
  RETURNING id INTO v_chat_id;

  INSERT INTO public.conversation_members (conversation_id, user_id, role)
  VALUES (v_chat_id, p_user_a, 'member'), (v_chat_id, p_user_b, 'member');

  RETURN v_chat_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. is_dm_send_allowed — RLS helper enforcing "only matched users can message"
--    SECURITY DEFINER so it can see the *other* party's romance_like (RLS on
--    romance_likes only exposes a user's own rows).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_dm_send_allowed(p_conversation_id UUID, p_sender UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_type   conversation_type;
  v_mode   app_mode;
  v_source dm_source;
  v_other  UUID;
  v_match  BOOLEAN;
BEGIN
  SELECT c.type, c.mode, c.dm_source
    INTO v_type, v_mode, v_source
  FROM public.conversations c
  WHERE c.id = p_conversation_id;

  IF v_type IS NULL THEN
    RETURN false;
  END IF;

  -- Group/event/system/AI conversations are governed by membership only.
  IF v_type <> 'dm' THEN
    RETURN true;
  END IF;

  -- Resolve the other DM participant.
  SELECT cm.user_id INTO v_other
  FROM public.conversation_members cm
  WHERE cm.conversation_id = p_conversation_id
    AND cm.user_id <> p_sender
    AND cm.left_at IS NULL
  LIMIT 1;

  IF v_other IS NULL THEN
    RETURN false;
  END IF;

  -- A block in either direction disables messaging for every DM type.
  IF EXISTS (
    SELECT 1 FROM public.user_blocks b
    WHERE (b.blocker_id = p_sender AND b.blocked_id = v_other)
       OR (b.blocker_id = v_other AND b.blocked_id = p_sender)
  ) THEN
    RETURN false;
  END IF;

  -- Romance match DMs require an active mutual like (the "match"). Unmatching
  -- (deleting one's like) immediately revokes the ability to send new messages.
  IF v_source = 'match' AND v_mode = 'romance' THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.romance_likes a
      JOIN public.romance_likes b
        ON a.liker_id = b.liked_id AND a.liked_id = b.liker_id
      WHERE a.liker_id = p_sender AND a.liked_id = v_other
    ) INTO v_match;
    RETURN v_match;
  END IF;

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.is_dm_send_allowed(UUID, UUID) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. MESSAGES — INSERT gated on membership + match; UPDATE/DELETE removed
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS messages_insert ON public.messages;
CREATE POLICY messages_insert ON public.messages FOR INSERT WITH CHECK (
  auth.uid() = sender_id
  AND EXISTS (
    SELECT 1 FROM public.conversation_members cm
    WHERE cm.conversation_id = messages.conversation_id
      AND cm.user_id = auth.uid()
      AND cm.left_at IS NULL
  )
  AND public.is_dm_send_allowed(messages.conversation_id, auth.uid())
);

-- Evidence trail: messages cannot be edited or deleted once sent.
DROP POLICY IF EXISTS messages_update ON public.messages;
DROP POLICY IF EXISTS messages_delete ON public.messages;

-- Defense-in-depth: block UPDATE/DELETE from user-facing roles even if a future
-- policy is (re)introduced. Service-role/admin (account deletion cascades, moderation
-- tooling) is unaffected.
CREATE OR REPLACE FUNCTION public.enforce_message_immutability()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF auth.role() IN ('authenticated', 'anon') THEN
    RAISE EXCEPTION 'Messages are immutable once sent and cannot be % (safety / evidence trail).', lower(TG_OP);
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_messages_no_update ON public.messages;
CREATE TRIGGER trg_messages_no_update
  BEFORE UPDATE ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.enforce_message_immutability();

DROP TRIGGER IF EXISTS trg_messages_no_delete ON public.messages;
CREATE TRIGGER trg_messages_no_delete
  BEFORE DELETE ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.enforce_message_immutability();

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. MESSAGE_DELIVERY_RECEIPTS — "delivered" half of read receipts
--    (message_read_receipts already covers "seen")
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.message_delivery_receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  delivered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (message_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_mdr_conversation_user
  ON public.message_delivery_receipts (conversation_id, user_id);

ALTER TABLE public.message_delivery_receipts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS mdr_select ON public.message_delivery_receipts;
CREATE POLICY mdr_select ON public.message_delivery_receipts FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.conversation_members cm
    WHERE cm.conversation_id = message_delivery_receipts.conversation_id
      AND cm.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS mdr_insert ON public.message_delivery_receipts;
CREATE POLICY mdr_insert ON public.message_delivery_receipts FOR INSERT WITH CHECK (
  auth.uid() = user_id
);

-- RPC: mark the current user's *received* messages as delivered (fills conversation_id).
CREATE OR REPLACE FUNCTION public.mark_messages_delivered(p_message_ids UUID[])
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL OR p_message_ids IS NULL OR array_length(p_message_ids, 1) IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO public.message_delivery_receipts (message_id, conversation_id, user_id)
  SELECT m.id, m.conversation_id, v_uid
  FROM public.messages m
  JOIN public.conversation_members cm
    ON cm.conversation_id = m.conversation_id
   AND cm.user_id = v_uid
   AND cm.left_at IS NULL
  WHERE m.id = ANY(p_message_ids)
    AND m.sender_id <> v_uid
  ON CONFLICT (message_id, user_id) DO NOTHING;
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_messages_delivered(UUID[]) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. REALTIME — ensure live delivery for messages, typing and receipt streams
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.typing_indicators;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.message_read_receipts;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.message_delivery_receipts;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
