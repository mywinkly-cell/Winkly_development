-- ─────────────────────────────────────────────────────────────────────────────
-- Winkly Messaging — optimistic-UI reconciliation key
-- v1.0 – June 2026
-- ─────────────────────────────────────────────────────────────────────────────
-- The mobile client renders a message optimistically (before the server INSERT
-- resolves) using a locally generated `client_id`. We persist that id on the row
-- so the authoritative message echoed back over Realtime / returned by the INSERT
-- can be matched to (and replace) the pending bubble, with no duplicates and no
-- full-list refetch. Column is nullable: server-side / legacy inserts simply omit
-- it and reconcile by message id as before.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS client_id TEXT;

COMMENT ON COLUMN public.messages.client_id IS
  'Client-generated id used to reconcile an optimistic message bubble with the persisted row (optimistic UI). Nullable.';

-- Helps the (rare) lookup by client_id during reconciliation and dedupe.
CREATE INDEX IF NOT EXISTS idx_messages_client_id
  ON public.messages (client_id)
  WHERE client_id IS NOT NULL;
