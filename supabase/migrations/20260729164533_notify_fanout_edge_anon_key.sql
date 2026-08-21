-- pg_net → Edge Function calls must include Authorization + apikey (anon JWT).
-- Without them the API gateway responds 401 UNAUTHORIZED_NO_AUTH_HEADER even when
-- verify_jwt = false, so message/match push notifications were silently dropped
-- (the triggers swallow errors by design). Same fix as the cron invokers in
-- 20260728190009; x-webhook-secret stays as the function-level gate.

CREATE OR REPLACE FUNCTION public.notify_fanout_on_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, extensions
AS $$
DECLARE
  v_url    TEXT;
  v_secret TEXT;
  v_anon   TEXT;
BEGIN
  SELECT function_base_url, secret, edge_anon_key
    INTO v_url, v_secret, v_anon
  FROM private.webhook_config
  WHERE id
  LIMIT 1;

  -- Not configured yet → silently skip (delivery falls back to other paths).
  IF v_url IS NULL OR v_secret IS NULL OR v_anon IS NULL OR btrim(v_anon) = '' THEN
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
        'Authorization', 'Bearer ' || v_anon,
        'apikey', v_anon,
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

CREATE OR REPLACE FUNCTION public.notify_fanout_on_romance_like()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, extensions
AS $$
DECLARE
  v_url    TEXT;
  v_secret TEXT;
  v_anon   TEXT;
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

  SELECT function_base_url, secret, edge_anon_key
    INTO v_url, v_secret, v_anon
  FROM private.webhook_config
  WHERE id
  LIMIT 1;

  IF v_url IS NULL OR v_secret IS NULL OR v_anon IS NULL OR btrim(v_anon) = '' THEN
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
        'Authorization', 'Bearer ' || v_anon,
        'apikey', v_anon,
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
