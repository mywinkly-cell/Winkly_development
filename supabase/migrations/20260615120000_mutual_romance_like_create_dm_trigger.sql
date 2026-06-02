-- ─────────────────────────────────────────────────────────────────────────────
-- Mutual romance like → auto-create match DM (server-side, idempotent)
-- v1.0 – June 2026
--
-- Previously, the match DM was created only inside romance_like_profile RPC
-- *after* the INSERT, while trg_notify_romance_like fired *on* INSERT — so push
-- fan-out often ran before chat_id existed. This trigger creates the DM as soon
-- as the second like row is committed (before notify trigger, alphabetically).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.on_mutual_romance_like_create_dm()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_mutual BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.romance_likes r
    WHERE r.liker_id = NEW.liked_id AND r.liked_id = NEW.liker_id
  ) INTO v_mutual;

  IF NOT v_mutual THEN
    RETURN NEW;
  END IF;

  PERFORM public.create_direct_chat(
    NEW.liker_id,
    NEW.liked_id,
    'romance'::app_mode,
    'match'::dm_source,
    NEW.liker_id
  );

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.on_mutual_romance_like_create_dm IS
  'AFTER INSERT on romance_likes: when the row completes a mutual like, create the romance match DM (idempotent). Runs before trg_notify_romance_like so push fan-out can deep-link chat_id.';

DROP TRIGGER IF EXISTS trg_mutual_romance_like_create_dm ON public.romance_likes;
CREATE TRIGGER trg_mutual_romance_like_create_dm
  AFTER INSERT ON public.romance_likes
  FOR EACH ROW EXECUTE FUNCTION public.on_mutual_romance_like_create_dm();

-- romance_like_profile: rely on trigger for DM creation; resolve chat_id after insert.
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
    v_pair_key := LEAST(current_user_id::text, target_user_id::text) || ':' ||
                  GREATEST(current_user_id::text, target_user_id::text);
    SELECT c.id INTO v_chat_id
    FROM public.conversations c
    WHERE c.type = 'dm' AND c.mode = 'romance' AND c.dm_pair_key = v_pair_key
    LIMIT 1;
    RETURN jsonb_build_object('liked', true, 'is_match', true, 'chat_id', v_chat_id);
  END IF;

  RETURN jsonb_build_object('liked', true, 'is_match', false);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.romance_like_profile(current_user_id UUID, target_user_id UUID)
RETURNS JSONB AS $$
  SELECT public.romance_like_profile(current_user_id, target_user_id, false, NULL);
$$ LANGUAGE sql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.romance_like_profile(UUID, UUID, BOOLEAN, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.romance_like_profile(UUID, UUID) TO authenticated;
