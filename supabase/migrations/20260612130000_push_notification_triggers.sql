-- ─────────────────────────────────────────────────────────────────────────────
-- Winkly Messaging — server-side push fan-out (DB triggers → Edge Function)
-- v1.0 – June 2026
-- ─────────────────────────────────────────────────────────────────────────────
-- Previously, push notifications for new messages and new matches were fired by
-- the *sender's* client right after the INSERT. That is unreliable: if the app is
-- backgrounded, killed, or loses connectivity in that window, the peer never gets
-- notified. This migration moves delivery server-side: Postgres AFTER INSERT
-- triggers call the `notify-fanout` Edge Function over pg_net the moment the row
-- is committed, regardless of the sender's app state.
--
-- Configuration (run once per environment, AFTER deploying the function):
--   1. Deploy: supabase functions deploy notify-fanout
--   2. Set the function secret (must match private.webhook_config.secret below):
--        supabase secrets set WEBHOOK_SECRET=<random-strong-secret>
--   3. Point the triggers at the project + secret:
--        INSERT INTO private.webhook_config (id, function_base_url, secret)
--        VALUES (true, 'https://<project-ref>.supabase.co', '<random-strong-secret>')
--        ON CONFLICT (id) DO UPDATE
--          SET function_base_url = EXCLUDED.function_base_url,
--              secret            = EXCLUDED.secret;
--
-- Until the config row is populated, the triggers no-op (no errors), so this
-- migration is safe to apply before the function is configured.
-- ─────────────────────────────────────────────────────────────────────────────

-- pg_net provides net.http_post for async, non-blocking outbound HTTP from SQL.
CREATE EXTENSION IF NOT EXISTS pg_net;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Webhook config (single row, private schema, not exposed via PostgREST)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE SCHEMA IF NOT EXISTS private;

CREATE TABLE IF NOT EXISTS private.webhook_config (
  id                BOOLEAN PRIMARY KEY DEFAULT true,
  function_base_url TEXT,
  secret            TEXT,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT webhook_config_singleton CHECK (id)
);

COMMENT ON TABLE private.webhook_config IS
  'Single-row config for DB-triggered Edge Function webhooks (notify-fanout). function_base_url = https://<ref>.supabase.co; secret must equal the function''s WEBHOOK_SECRET env var.';

-- Lock the table down: only postgres / service_role (and SECURITY DEFINER triggers) touch it.
ALTER TABLE private.webhook_config ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.webhook_config FROM anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Fan-out on new message
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.notify_fanout_on_message()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, extensions
AS $$
DECLARE
  v_url    TEXT;
  v_secret TEXT;
BEGIN
  SELECT function_base_url, secret INTO v_url, v_secret
  FROM private.webhook_config
  WHERE id
  LIMIT 1;

  -- Not configured yet → silently skip (delivery falls back to other paths).
  IF v_url IS NULL OR v_secret IS NULL THEN
    RETURN NEW;
  END IF;

  BEGIN
    PERFORM net.http_post(
      url := v_url || '/functions/v1/notify-fanout',
      body := jsonb_build_object(
        'type', 'message',
        'record', jsonb_build_object(
          'id', NEW.id,
          'conversation_id', NEW.conversation_id,
          'sender_id', NEW.sender_id,
          'content', NEW.content,
          'message_type', NEW.message_type
        )
      ),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-webhook-secret', v_secret
      ),
      timeout_milliseconds := 5000
    );
  EXCEPTION WHEN OTHERS THEN
    -- Never block (or roll back) the message write on notification delivery.
    NULL;
  END;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_message ON public.messages;
CREATE TRIGGER trg_notify_message
  AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.notify_fanout_on_message();

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Fan-out on new mutual romance match
--    Fires for every like, but only POSTs when the like makes the pair mutual.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.notify_fanout_on_romance_like()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, extensions
AS $$
DECLARE
  v_url    TEXT;
  v_secret TEXT;
  v_mutual BOOLEAN;
  v_pair   TEXT;
  v_chat   UUID;
BEGIN
  -- Mutual only: the liked user must already have liked the liker back.
  SELECT EXISTS (
    SELECT 1 FROM public.romance_likes r
    WHERE r.liker_id = NEW.liked_id AND r.liked_id = NEW.liker_id
  ) INTO v_mutual;

  IF NOT v_mutual THEN
    RETURN NEW;
  END IF;

  SELECT function_base_url, secret INTO v_url, v_secret
  FROM private.webhook_config
  WHERE id
  LIMIT 1;

  IF v_url IS NULL OR v_secret IS NULL THEN
    RETURN NEW;
  END IF;

  -- Resolve the (already-created) DM so the notification can deep-link to it.
  v_pair := LEAST(NEW.liker_id::text, NEW.liked_id::text) || ':' ||
            GREATEST(NEW.liker_id::text, NEW.liked_id::text);
  SELECT c.id INTO v_chat
  FROM public.conversations c
  WHERE c.type = 'dm' AND c.mode = 'romance' AND c.dm_pair_key = v_pair
  LIMIT 1;

  BEGIN
    PERFORM net.http_post(
      url := v_url || '/functions/v1/notify-fanout',
      body := jsonb_build_object(
        'type', 'match',
        'liker_id', NEW.liker_id,
        -- Notify the person who is now matched (the prior liker).
        'liked_id', NEW.liked_id,
        'chat_id', v_chat
      ),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-webhook-secret', v_secret
      ),
      timeout_milliseconds := 5000
    );
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_romance_like ON public.romance_likes;
CREATE TRIGGER trg_notify_romance_like
  AFTER INSERT ON public.romance_likes
  FOR EACH ROW EXECUTE FUNCTION public.notify_fanout_on_romance_like();
