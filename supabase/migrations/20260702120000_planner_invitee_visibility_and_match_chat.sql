-- ─────────────────────────────────────────────────────────────────────────────
-- Winkly — Two-sided planner visibility + hardened mutual-like chat resolution
-- v1.0 – July 2026
--
-- Fixes two bugs surfaced by the romance "ready date on first open" flow:
--
--  (3) ONE-SIDED PLANNER VISIBILITY
--      A proposed date is a planner_items row (created_by = inviter) + a
--      planner_invitations row (inviter_id / invitee_id). planner_items_select
--      only allowed the creator or an existing planner_participants row, so the
--      invitee could NOT read the planner_item until *after* they accepted (the
--      accept handler inserts their participant row). That made acceptPlannerInvite
--      read a NULL item (wrong source_mode / starts_at fallbacks) and hid the
--      proposed date from any planner/dates surface for the recipient.
--      Fix: the invitee on a pending/any planner_invitations row may SELECT the
--      linked planner_item. (The client additionally seeds an 'invitee'
--      planner_participants row so both sides are participants from the start.)
--
--  (2) MUTUAL-LIKE CHAT RESOLUTION
--      romance_like_profile resolved chat_id only by dm_pair_key. Legacy DMs (or
--      a row created before the pair key backfill) could miss, returning a NULL
--      chat_id even though both users share a conversation. Fix: fall back to the
--      conversation_members join (same approach as create_direct_chat and
--      romance_liked_profiles), so a match always returns the shared chat_id.
--      The dead `liked_you_back` flag is already replaced by `matched_chat_id`
--      (20260624130000); nothing here depends on it.
-- ─────────────────────────────────────────────────────────────────────────────

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. planner_items: invitees can read the proposed item (both DBs: winkly_rls and
--    ensure_planner_tables define this policy; recreate the canonical version).
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS planner_items_select ON public.planner_items;
CREATE POLICY planner_items_select ON public.planner_items FOR SELECT USING (
  auth.uid() = created_by
  OR EXISTS (
    SELECT 1 FROM public.planner_participants pp
    WHERE pp.planner_item_id = planner_items.id
      AND pp.user_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM public.planner_invitations inv
    WHERE inv.planner_item_id = planner_items.id
      AND inv.invitee_id = auth.uid()
  )
);

COMMENT ON POLICY planner_items_select ON public.planner_items IS
  'Readable by the creator, any participant, or an invitee on a planner_invitations row (so a proposed date is visible to the recipient before they accept).';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Hardened mutual-like chat resolution.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.romance_like_profile(
  current_user_id UUID,
  target_user_id UUID,
  p_super_like BOOLEAN DEFAULT false,
  p_super_like_message TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_is_match BOOLEAN;
  v_chat_id UUID;
  v_pair_key TEXT;
BEGIN
  IF current_user_id = target_user_id THEN
    RETURN jsonb_build_object('liked', false, 'is_match', false, 'error', 'Cannot like yourself');
  END IF;

  INSERT INTO public.romance_likes (liker_id, liked_id, super_like, super_like_message)
  VALUES (current_user_id, target_user_id, COALESCE(p_super_like, false), p_super_like_message)
  ON CONFLICT (liker_id, liked_id) DO UPDATE SET
    super_like = COALESCE(EXCLUDED.super_like, romance_likes.super_like),
    super_like_message = COALESCE(EXCLUDED.super_like_message, romance_likes.super_like_message);

  SELECT EXISTS (
    SELECT 1 FROM public.romance_likes a
    JOIN public.romance_likes b ON a.liker_id = b.liked_id AND a.liked_id = b.liker_id
    WHERE a.liker_id = current_user_id AND a.liked_id = target_user_id
  ) INTO v_is_match;

  IF v_is_match THEN
    -- The trg_mutual_romance_like_create_dm trigger has already created the DM in
    -- this transaction. Resolve it by pair key first, then by membership (legacy /
    -- pre-backfill rows) so a match never returns a NULL chat_id.
    v_pair_key := LEAST(current_user_id::text, target_user_id::text) || ':' ||
                  GREATEST(current_user_id::text, target_user_id::text);
    SELECT c.id INTO v_chat_id
    FROM public.conversations c
    WHERE c.type = 'dm' AND c.mode = 'romance' AND c.dm_pair_key = v_pair_key
    LIMIT 1;

    IF v_chat_id IS NULL THEN
      SELECT c.id INTO v_chat_id
      FROM public.conversations c
      JOIN public.conversation_members cm_me
        ON cm_me.conversation_id = c.id AND cm_me.user_id = current_user_id AND cm_me.left_at IS NULL
      JOIN public.conversation_members cm_them
        ON cm_them.conversation_id = c.id AND cm_them.user_id = target_user_id AND cm_them.left_at IS NULL
      WHERE c.type = 'dm' AND c.mode = 'romance'
      LIMIT 1;
    END IF;

    RETURN jsonb_build_object('liked', true, 'is_match', true, 'chat_id', v_chat_id);
  END IF;

  RETURN jsonb_build_object('liked', true, 'is_match', false);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.romance_like_profile(UUID, UUID, BOOLEAN, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.romance_like_profile(UUID, UUID) TO authenticated;
