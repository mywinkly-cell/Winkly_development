-- ─────────────────────────────────────────────────────────────────────────────
-- Winkly Chat System — RLS Policies
-- v1.0 – January 2026
-- Purpose: Secure access control for chat tables
-- ─────────────────────────────────────────────────────────────────────────────

-- ─────────────────────────────────────────────────────────────────────────────
-- CONVERSATIONS — extend: allow update for last_message_at (trigger does it)
-- and soft-archive. Block check handled in application.
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS conversations_insert ON public.conversations;
CREATE POLICY conversations_insert ON public.conversations FOR INSERT
  WITH CHECK (auth.uid() = created_by);

-- Add update policy for members (archive, etc.)
DROP POLICY IF EXISTS conversations_update ON public.conversations;
CREATE POLICY conversations_update ON public.conversations FOR UPDATE USING (
  EXISTS (SELECT 1 FROM public.conversation_members cm WHERE cm.conversation_id = conversations.id AND cm.user_id = auth.uid() AND cm.left_at IS NULL)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- MESSAGES — extend: UPDATE (edit/delete), block check
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS messages_insert ON public.messages;
CREATE POLICY messages_insert ON public.messages FOR INSERT WITH CHECK (
  auth.uid() = sender_id AND
  EXISTS (SELECT 1 FROM public.conversation_members cm WHERE cm.conversation_id = messages.conversation_id AND cm.user_id = auth.uid() AND cm.left_at IS NULL)
);

DROP POLICY IF EXISTS messages_update ON public.messages;
CREATE POLICY messages_update ON public.messages FOR UPDATE USING (
  auth.uid() = sender_id
);

DROP POLICY IF EXISTS messages_delete ON public.messages;
CREATE POLICY messages_delete ON public.messages FOR DELETE USING (
  auth.uid() = sender_id
);

-- ─────────────────────────────────────────────────────────────────────────────
-- CONVERSATION_MEMBER_SETTINGS
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS cms_select ON public.conversation_member_settings;
CREATE POLICY cms_select ON public.conversation_member_settings FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS cms_insert ON public.conversation_member_settings;
CREATE POLICY cms_insert ON public.conversation_member_settings FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS cms_update ON public.conversation_member_settings;
CREATE POLICY cms_update ON public.conversation_member_settings FOR UPDATE USING (auth.uid() = user_id);
DROP POLICY IF EXISTS cms_delete ON public.conversation_member_settings;
CREATE POLICY cms_delete ON public.conversation_member_settings FOR DELETE USING (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- MESSAGE_REACTIONS
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS mr_select ON public.message_reactions;
CREATE POLICY mr_select ON public.message_reactions FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.messages m
    JOIN public.conversation_members cm ON cm.conversation_id = m.conversation_id
    WHERE m.id = message_reactions.message_id AND cm.user_id = auth.uid() AND cm.left_at IS NULL)
);
DROP POLICY IF EXISTS mr_insert ON public.message_reactions;
CREATE POLICY mr_insert ON public.message_reactions FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS mr_delete ON public.message_reactions;
CREATE POLICY mr_delete ON public.message_reactions FOR DELETE USING (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- MESSAGE_READ_RECEIPTS
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS mrr_select ON public.message_read_receipts;
CREATE POLICY mrr_select ON public.message_read_receipts FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.messages m
    JOIN public.conversation_members cm ON cm.conversation_id = m.conversation_id
    WHERE m.id = message_read_receipts.message_id AND cm.user_id = auth.uid())
);
DROP POLICY IF EXISTS mrr_insert ON public.message_read_receipts;
CREATE POLICY mrr_insert ON public.message_read_receipts FOR INSERT WITH CHECK (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- TYPING_INDICATORS
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS ti_select ON public.typing_indicators;
CREATE POLICY ti_select ON public.typing_indicators FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.conversation_members cm WHERE cm.conversation_id = typing_indicators.conversation_id AND cm.user_id = auth.uid() AND cm.left_at IS NULL)
);
DROP POLICY IF EXISTS ti_insert ON public.typing_indicators;
CREATE POLICY ti_insert ON public.typing_indicators FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS ti_update ON public.typing_indicators;
CREATE POLICY ti_update ON public.typing_indicators FOR UPDATE USING (auth.uid() = user_id);
DROP POLICY IF EXISTS ti_delete ON public.typing_indicators;
CREATE POLICY ti_delete ON public.typing_indicators FOR DELETE USING (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- USER_BLOCKS
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS ub_select ON public.user_blocks;
CREATE POLICY ub_select ON public.user_blocks FOR SELECT USING (
  auth.uid() = blocker_id OR auth.uid() = blocked_id
);
DROP POLICY IF EXISTS ub_insert ON public.user_blocks;
CREATE POLICY ub_insert ON public.user_blocks FOR INSERT WITH CHECK (auth.uid() = blocker_id);
DROP POLICY IF EXISTS ub_delete ON public.user_blocks;
CREATE POLICY ub_delete ON public.user_blocks FOR DELETE USING (auth.uid() = blocker_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- USER_REPORTS
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS ur_insert ON public.user_reports;
CREATE POLICY ur_insert ON public.user_reports FOR INSERT WITH CHECK (auth.uid() = reporter_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- MESSAGE_REPORTS
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS mrep_insert ON public.message_reports;
CREATE POLICY mrep_insert ON public.message_reports FOR INSERT WITH CHECK (auth.uid() = reporter_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- PINNED_MESSAGES
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS pm_select ON public.pinned_messages;
CREATE POLICY pm_select ON public.pinned_messages FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.conversation_members cm WHERE cm.conversation_id = pinned_messages.conversation_id AND cm.user_id = auth.uid())
);
DROP POLICY IF EXISTS pm_insert ON public.pinned_messages;
CREATE POLICY pm_insert ON public.pinned_messages FOR INSERT WITH CHECK (
  auth.uid() = pinned_by AND
  EXISTS (SELECT 1 FROM public.conversation_members cm WHERE cm.conversation_id = pinned_messages.conversation_id AND cm.user_id = auth.uid() AND cm.role IN ('owner', 'admin', 'moderator'))
);
DROP POLICY IF EXISTS pm_delete ON public.pinned_messages;
CREATE POLICY pm_delete ON public.pinned_messages FOR DELETE USING (
  auth.uid() = pinned_by OR
  EXISTS (SELECT 1 FROM public.conversation_members cm WHERE cm.conversation_id = pinned_messages.conversation_id AND cm.user_id = auth.uid() AND cm.role IN ('owner', 'admin', 'moderator'))
);
