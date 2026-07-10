-- Security Advisor lint 0029 — client RPCs from the screenshot batch.
-- 1) Self-service RPCs → SECURITY INVOKER (+ RLS where needed).
-- 2) Privileged RPCs → private.* impl (DEFINER) + public INVOKER wrapper.
--    PostgREST only exposes public; private is not in the API schema.

-- ── RLS helpers ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS business_analytics_events_insert ON public.business_analytics_events;
CREATE POLICY business_analytics_events_insert ON public.business_analytics_events
  FOR INSERT TO authenticated
  WITH CHECK (
    (metadata->>'viewer_id')::uuid = auth.uid()
    AND event_type IN ('offer_impression', 'offer_tap', 'profile_view', 'add_to_planner')
  );

DROP POLICY IF EXISTS user_locations_select_romance_discover ON public.user_locations;
CREATE POLICY user_locations_select_romance_discover ON public.user_locations
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles_mode pm
      WHERE pm.user_id = user_locations.user_id
        AND pm.mode = 'romance'
    )
  );

DROP POLICY IF EXISTS behavior_pair_upsert_own ON public.behavior_pair_signals;
CREATE POLICY behavior_pair_upsert_own ON public.behavior_pair_signals
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IN (user_a_id, user_b_id));

DROP POLICY IF EXISTS behavior_pair_update_own ON public.behavior_pair_signals;
CREATE POLICY behavior_pair_update_own ON public.behavior_pair_signals
  FOR UPDATE TO authenticated
  USING (auth.uid() IN (user_a_id, user_b_id))
  WITH CHECK (auth.uid() IN (user_a_id, user_b_id));

-- ── Location (SECURITY INVOKER) ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_my_location(
  p_lat DOUBLE PRECISION,
  p_lng DOUBLE PRECISION,
  p_precision TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, extensions
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_precision TEXT;
  v_lat DOUBLE PRECISION;
  v_lng DOUBLE PRECISION;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'set_my_location: not authenticated' USING ERRCODE = '28000';
  END IF;
  IF p_lat IS NULL OR p_lng IS NULL
     OR p_lat < -90 OR p_lat > 90
     OR p_lng < -180 OR p_lng > 180 THEN
    RAISE EXCEPTION 'set_my_location: invalid coordinates' USING ERRCODE = '22023';
  END IF;
  v_precision := lower(NULLIF(p_precision, ''));
  IF v_precision IS NULL THEN
    SELECT location_precision INTO v_precision
    FROM public.user_profiles WHERE id = v_uid;
  END IF;
  IF v_precision NOT IN ('precise', 'approximate') OR v_precision IS NULL THEN
    v_precision := 'approximate';
  END IF;
  IF p_precision IS NOT NULL THEN
    UPDATE public.user_profiles SET location_precision = v_precision WHERE id = v_uid;
  END IF;
  v_lat := public._winkly_snap_coord(p_lat, v_precision);
  v_lng := public._winkly_snap_coord(p_lng, v_precision);
  INSERT INTO public.user_locations (user_id, geog, updated_at)
  VALUES (v_uid, ST_SetSRID(ST_MakePoint(v_lng, v_lat), 4326)::extensions.geography, now())
  ON CONFLICT (user_id) DO UPDATE
    SET geog = EXCLUDED.geog, updated_at = now();
END;
$$;

CREATE OR REPLACE FUNCTION public.set_my_location_precision(p_precision TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, extensions
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_precision TEXT := lower(coalesce(p_precision, ''));
  v_lat DOUBLE PRECISION;
  v_lng DOUBLE PRECISION;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'set_my_location_precision: not authenticated' USING ERRCODE = '28000';
  END IF;
  IF v_precision NOT IN ('precise', 'approximate') THEN
    RAISE EXCEPTION 'set_my_location_precision: invalid precision' USING ERRCODE = '22023';
  END IF;
  UPDATE public.user_profiles SET location_precision = v_precision WHERE id = v_uid;
  SELECT ST_Y(geog::geometry), ST_X(geog::geometry) INTO v_lat, v_lng
  FROM public.user_locations WHERE user_id = v_uid;
  IF v_lat IS NOT NULL THEN
    v_lat := public._winkly_snap_coord(v_lat, v_precision);
    v_lng := public._winkly_snap_coord(v_lng, v_precision);
    UPDATE public.user_locations
      SET geog = ST_SetSRID(ST_MakePoint(v_lng, v_lat), 4326)::extensions.geography,
          updated_at = now()
    WHERE user_id = v_uid;
  END IF;
  RETURN v_precision;
END;
$$;

-- ── Events (SECURITY INVOKER) ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.join_event(p_event_id uuid, p_status text DEFAULT 'going')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_conv_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'join_event: not authenticated' USING ERRCODE = '28000';
  END IF;
  IF p_status NOT IN ('going', 'interested', 'not_going') THEN
    RAISE EXCEPTION 'join_event: invalid status %', p_status USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.event_participants (event_id, user_id, rsvp_status)
  VALUES (p_event_id, v_uid, p_status)
  ON CONFLICT (event_id, user_id) DO UPDATE SET rsvp_status = EXCLUDED.rsvp_status;
  v_conv_id := (
    SELECT c.id FROM public.conversations c
    WHERE c.related_event_id = p_event_id AND c.type = 'event'
    LIMIT 1
  );
  IF v_conv_id IS NOT NULL AND p_status IN ('going', 'interested') THEN
    INSERT INTO public.conversation_members (conversation_id, user_id, role)
    VALUES (v_conv_id, v_uid, 'member')
    ON CONFLICT (conversation_id, user_id) DO NOTHING;
  ELSIF v_conv_id IS NOT NULL AND p_status = 'not_going' THEN
    DELETE FROM public.conversation_members
    WHERE conversation_id = v_conv_id AND user_id = v_uid;
  END IF;
  RETURN jsonb_build_object('ok', true, 'event_id', p_event_id, 'status', p_status, 'conversation_id', v_conv_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.leave_event(p_event_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_conv_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'leave_event: not authenticated' USING ERRCODE = '28000';
  END IF;
  DELETE FROM public.event_participants WHERE event_id = p_event_id AND user_id = v_uid;
  v_conv_id := (
    SELECT c.id FROM public.conversations c
    WHERE c.related_event_id = p_event_id AND c.type = 'event'
    LIMIT 1
  );
  IF v_conv_id IS NOT NULL THEN
    DELETE FROM public.conversation_members
    WHERE conversation_id = v_conv_id AND user_id = v_uid;
  END IF;
  RETURN jsonb_build_object('ok', true, 'event_id', p_event_id, 'conversation_id', v_conv_id);
END;
$$;

-- ── Messaging / analytics / AI cache (SECURITY INVOKER) ─────────────────────
CREATE OR REPLACE FUNCTION public.mark_messages_delivered(p_message_ids uuid[])
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
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

CREATE OR REPLACE FUNCTION public.record_business_analytics_event(
  p_business_id uuid,
  p_event_type text,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_viewer_id uuid := auth.uid();
  v_meta jsonb;
BEGIN
  IF v_viewer_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF p_event_type NOT IN ('offer_impression', 'offer_tap', 'profile_view', 'add_to_planner') THEN
    RAISE EXCEPTION 'Invalid event_type: %', p_event_type;
  END IF;
  v_meta := COALESCE(p_metadata, '{}'::jsonb);
  IF NOT (v_meta ? 'viewer_id') THEN
    v_meta := v_meta || jsonb_build_object('viewer_id', v_viewer_id);
  END IF;
  INSERT INTO public.business_analytics_events (business_id, event_type, metadata)
  VALUES (p_business_id, p_event_type, v_meta)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_cached_ai_plan(
  p_user_id uuid,
  p_other_user_id uuid,
  p_mode app_mode,
  p_plan_json jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  ua uuid := LEAST(p_user_id, p_other_user_id);
  ub uuid := GREATEST(p_user_id, p_other_user_id);
BEGIN
  IF auth.uid() IS NULL OR auth.uid() NOT IN (p_user_id, p_other_user_id) THEN
    RAISE EXCEPTION 'set_cached_ai_plan: forbidden' USING ERRCODE = '28000';
  END IF;
  INSERT INTO public.ai_plan_cache (user_a_id, user_b_id, mode, plan_json, generated_at)
  VALUES (ua, ub, p_mode, p_plan_json, now())
  ON CONFLICT (user_a_id, user_b_id, mode)
  DO UPDATE SET plan_json = EXCLUDED.plan_json, generated_at = now();
END;
$$;

CREATE OR REPLACE FUNCTION public.record_pair_behavior_signal(
  p_partner_user_id uuid,
  p_mode public.app_mode,
  p_kind text,
  p_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  ua uuid;
  ub uuid;
  mc integer;
  sig jsonb;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF p_partner_user_id IS NULL OR p_partner_user_id = uid THEN
    RETURN;
  END IF;
  IF p_mode NOT IN ('romance'::app_mode, 'friends'::app_mode, 'business'::app_mode) THEN
    RETURN;
  END IF;
  ua := LEAST(uid, p_partner_user_id);
  ub := GREATEST(uid, p_partner_user_id);
  INSERT INTO public.behavior_pair_signals (
    user_a_id, user_b_id, mode, message_count, last_message_at, affinity_score, interaction_signals, updated_at
  )
  VALUES (ua, ub, p_mode, 0, NULL, 0.5, '{}'::jsonb, now())
  ON CONFLICT (user_a_id, user_b_id, mode) DO NOTHING;
  SELECT message_count, interaction_signals INTO mc, sig
  FROM public.behavior_pair_signals
  WHERE user_a_id = ua AND user_b_id = ub AND mode = p_mode;
  mc := COALESCE(mc, 0);
  sig := COALESCE(sig, '{}'::jsonb);
  IF p_kind = 'concierge_match_session' THEN
    sig := sig || jsonb_build_object(
      'concierge_sessions', COALESCE((sig->>'concierge_sessions')::integer, 0) + 1,
      'last_concierge_at', to_jsonb(now())
    );
  ELSIF p_kind = 'planner_from_chat' THEN
    sig := sig || jsonb_build_object(
      'planner_from_chat', COALESCE((sig->>'planner_from_chat')::integer, 0) + 1,
      'last_planner_from_chat_at', to_jsonb(now())
    );
    IF p_payload ? 'conversation_id' THEN
      sig := sig || jsonb_build_object('last_planner_conversation_id', p_payload->'conversation_id');
    END IF;
  ELSIF p_kind = 'invite_accepted' THEN
    sig := sig || jsonb_build_object(
      'invites_accepted', COALESCE((sig->>'invites_accepted')::integer, 0) + 1,
      'last_invite_accepted_at', to_jsonb(now())
    );
  ELSIF p_kind = 'dm_first_outreach' THEN
    sig := sig || jsonb_build_object(
      'dm_first_outreach', GREATEST(COALESCE((sig->>'dm_first_outreach')::integer, 0), 1)
    );
  ELSE
    RETURN;
  END IF;
  UPDATE public.behavior_pair_signals
  SET interaction_signals = sig,
      affinity_score = public.compute_behavior_affinity_score(mc, sig),
      updated_at = now()
  WHERE user_a_id = ua AND user_b_id = ub AND mode = p_mode;
END;
$$;

-- ── Romance like (SECURITY INVOKER + caller guard) ──────────────────────────
CREATE OR REPLACE FUNCTION public.romance_like_profile(
  current_user_id uuid,
  target_user_id uuid,
  p_super_like boolean DEFAULT false,
  p_super_like_message text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_is_match boolean;
  v_chat_id uuid;
  v_pair_key text;
BEGIN
  IF current_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'romance_like_profile: forbidden' USING ERRCODE = '28000';
  END IF;
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
$$;

CREATE OR REPLACE FUNCTION public.romance_like_profile(current_user_id uuid, target_user_id uuid)
RETURNS jsonb
LANGUAGE sql
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT public.romance_like_profile(current_user_id, target_user_id, false, NULL);
$$;

-- ── Romance feeds / lists (SECURITY INVOKER + caller guard) ─────────────────
CREATE OR REPLACE FUNCTION public.romance_discover_feed(current_user_id uuid)
RETURNS SETOF public.public_profile_view
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF current_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'romance_discover_feed: forbidden' USING ERRCODE = '28000';
  END IF;
  RETURN QUERY
    SELECT v.*
    FROM public.public_profile_view v
    INNER JOIN public.profiles_mode pm ON pm.user_id = v.id AND pm.mode = 'romance'
    WHERE v.id IS NOT NULL
      AND v.id != current_user_id
      AND NOT EXISTS (
        SELECT 1 FROM public.romance_likes rl
        WHERE rl.liker_id = current_user_id AND rl.liked_id = v.id
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.user_blocks ub
        WHERE (ub.blocker_id = current_user_id AND ub.blocked_id = v.id)
           OR (ub.blocker_id = v.id AND ub.blocked_id = current_user_id)
      )
    ORDER BY v.updated_at DESC NULLS LAST, v.created_at DESC NULLS LAST
    LIMIT 100;
END;
$$;

-- romance_discover_feed_geo: body unchanged; switch to INVOKER (RLS allows romance locations).
CREATE OR REPLACE FUNCTION public.romance_discover_feed_geo(
  current_user_id uuid,
  p_max_distance_km integer DEFAULT NULL,
  p_age_min integer DEFAULT NULL,
  p_age_max integer DEFAULT NULL,
  p_genders text[] DEFAULT NULL,
  p_limit integer DEFAULT 100
)
RETURNS TABLE (
  id uuid, first_name text, last_name text, gender text, age integer, city text,
  education text, languages text[], occupation text, interests text[],
  core_photos text[], main_photo_url text, instagram text, bio_romance text,
  romance_photos text[], romance_interests text[], romance_meta jsonb,
  distance_km integer, distance_label text
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public, extensions
AS $$
DECLARE
  v_self_geog extensions.geography;
BEGIN
  IF current_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'romance_discover_feed_geo: forbidden' USING ERRCODE = '28000';
  END IF;
  SELECT ul.geog INTO v_self_geog FROM public.user_locations ul WHERE ul.user_id = current_user_id;
  RETURN QUERY
  WITH base AS (
    SELECT v.id, v.first_name, v.last_name, v.gender, v.age, v.city, v.education,
           v.languages, v.occupation, v.interests, v.core_photos, v.main_photo_url,
           v.instagram, v.bio_romance, v.romance_photos, v.romance_interests, v.romance_meta,
           v.updated_at,
           CASE WHEN v_self_geog IS NOT NULL AND cl.geog IS NOT NULL
                THEN ST_Distance(v_self_geog, cl.geog) ELSE NULL END AS dist_m
    FROM public.public_profile_view v
    INNER JOIN public.profiles_mode pm ON pm.user_id = v.id AND pm.mode = 'romance'
    LEFT JOIN public.user_locations cl ON cl.user_id = v.id
    WHERE v.id IS NOT NULL AND v.id <> current_user_id
      AND NOT EXISTS (
        SELECT 1 FROM public.romance_likes rl
        WHERE rl.liker_id = current_user_id AND rl.liked_id = v.id
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.user_swipes us
        WHERE us.user_id = current_user_id AND us.target_user_id = v.id AND us.mode = 'romance'
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.user_blocks ub
        WHERE (ub.blocker_id = current_user_id AND ub.blocked_id = v.id)
           OR (ub.blocker_id = v.id AND ub.blocked_id = current_user_id)
      )
  )
  SELECT b.id, b.first_name, b.last_name, b.gender, b.age, b.city, b.education,
         b.languages, b.occupation, b.interests, b.core_photos, b.main_photo_url,
         b.instagram, b.bio_romance, b.romance_photos, b.romance_interests, b.romance_meta,
         CASE WHEN b.dist_m IS NULL THEN NULL
              ELSE GREATEST(1, ROUND(b.dist_m / 1000.0))::int END,
         CASE WHEN b.dist_m IS NULL THEN NULL
              WHEN b.dist_m < 1000 THEN '< 1 km away'
              ELSE '~' || GREATEST(1, ROUND(b.dist_m / 1000.0))::int::text || ' km away' END
  FROM base b
  WHERE (p_age_min IS NULL OR b.age IS NULL OR b.age >= p_age_min)
    AND (p_age_max IS NULL OR b.age IS NULL OR b.age <= p_age_max)
    AND (p_genders IS NULL OR array_length(p_genders, 1) IS NULL OR b.gender = ANY(p_genders))
    AND (p_max_distance_km IS NULL OR v_self_geog IS NULL OR b.dist_m IS NULL
         OR b.dist_m <= p_max_distance_km * 1000.0)
  ORDER BY b.dist_m ASC NULLS LAST, b.updated_at DESC NULLS LAST
  LIMIT COALESCE(p_limit, 100);
END;
$$;

CREATE OR REPLACE FUNCTION public.romance_new_matches(current_user_id uuid)
RETURNS SETOF jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF current_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'romance_new_matches: forbidden' USING ERRCODE = '28000';
  END IF;
  RETURN QUERY
  SELECT jsonb_build_object(
    'id', m.id, 'first_name', p.first_name, 'last_name', p.last_name,
    'age', EXTRACT(YEAR FROM AGE(COALESCE(p.birthday, '2000-01-01'::date)))::int,
    'city', p.city, 'interests', COALESCE(pm.interests, p.interests, '{}'),
    'languages', COALESCE(p.languages, '{}'), 'occupation', p.occupation,
    'bio_romance', pm.bio, 'romance_photos', COALESCE(pm.photos, p.core_photos, '{}'),
    'core_photos', p.core_photos
  )
  FROM (
    SELECT a.liked_id AS id FROM public.romance_likes a
    JOIN public.romance_likes b ON a.liker_id = b.liked_id AND a.liked_id = b.liker_id
    WHERE a.liker_id = current_user_id
    ORDER BY a.created_at DESC
  ) m
  LEFT JOIN public.user_profiles p ON p.id = m.id
  LEFT JOIN public.profiles_mode pm ON pm.user_id = m.id AND pm.mode = 'romance';
END;
$$;

CREATE OR REPLACE FUNCTION public.romance_connections(current_user_id uuid)
RETURNS SETOF jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY SELECT * FROM public.romance_new_matches(current_user_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.romance_liked_profiles(current_user_id uuid)
RETURNS SETOF jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF current_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'romance_liked_profiles: forbidden' USING ERRCODE = '28000';
  END IF;
  RETURN QUERY
  SELECT jsonb_build_object(
    'id', rl.liked_id, 'first_name', p.first_name, 'last_name', p.last_name,
    'age', EXTRACT(YEAR FROM AGE(COALESCE(p.birthday, '2000-01-01'::date)))::int,
    'city', p.city, 'interests', COALESCE(pm.interests, p.interests, '{}'),
    'languages', COALESCE(p.languages, '{}'), 'occupation', p.occupation,
    'bio_romance', pm.bio, 'romance_photos', COALESCE(pm.photos, p.core_photos, '{}'),
    'core_photos', p.core_photos,
    'super_like', COALESCE(rl.super_like, false),
    'super_like_message', rl.super_like_message,
    'matched_chat_id', (
      SELECT c.id FROM public.conversations c
      INNER JOIN public.conversation_members cm_me
        ON cm_me.conversation_id = c.id AND cm_me.user_id = current_user_id AND cm_me.left_at IS NULL
      INNER JOIN public.conversation_members cm_them
        ON cm_them.conversation_id = c.id AND cm_them.user_id = rl.liked_id AND cm_them.left_at IS NULL
      WHERE c.type = 'dm' AND c.mode = 'romance' LIMIT 1
    )
  )
  FROM public.romance_likes rl
  LEFT JOIN public.user_profiles p ON p.id = rl.liked_id
  LEFT JOIN public.profiles_mode pm ON pm.user_id = rl.liked_id AND pm.mode = 'romance'
  WHERE rl.liker_id = current_user_id
  ORDER BY rl.created_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.romance_likes_received(current_user_id uuid)
RETURNS SETOF jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF current_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'romance_likes_received: forbidden' USING ERRCODE = '28000';
  END IF;
  RETURN QUERY
  SELECT jsonb_build_object(
    'id', rl.liker_id, 'first_name', p.first_name, 'last_name', p.last_name,
    'age', EXTRACT(YEAR FROM AGE(COALESCE(p.birthday, '2000-01-01'::date)))::int,
    'city', p.city, 'interests', COALESCE(pm.interests, p.interests, '{}'),
    'languages', COALESCE(p.languages, '{}'), 'occupation', p.occupation,
    'bio_romance', pm.bio, 'romance_photos', COALESCE(pm.photos, p.core_photos, '{}'),
    'core_photos', p.core_photos,
    'super_like', COALESCE(rl.super_like, false),
    'super_like_message', rl.super_like_message
  )
  FROM public.romance_likes rl
  LEFT JOIN public.user_profiles p ON p.id = rl.liker_id
  LEFT JOIN public.profiles_mode pm ON pm.user_id = rl.liker_id AND pm.mode = 'romance'
  WHERE rl.liked_id = current_user_id
    AND NOT EXISTS (
      SELECT 1 FROM public.romance_likes x
      WHERE x.liker_id = current_user_id AND x.liked_id = rl.liker_id
    )
  ORDER BY rl.created_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.romance_pending_chat_invites(p_user_id uuid)
RETURNS SETOF jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'romance_pending_chat_invites: forbidden' USING ERRCODE = '28000';
  END IF;
  RETURN QUERY
  SELECT jsonb_build_object(
    'id', c.dm_initiator, 'conversation_id', c.id,
    'first_name', p.first_name, 'last_name', p.last_name,
    'age', EXTRACT(YEAR FROM AGE(COALESCE(p.birthday, '2000-01-01'::date)))::int,
    'city', p.city, 'occupation', p.occupation,
    'romance_photos', COALESCE(pm.photos, p.core_photos, '{}'),
    'core_photos', p.core_photos,
    'preview_message', (
      SELECT m.content FROM public.messages m
      WHERE m.conversation_id = c.id AND m.sender_id = c.dm_initiator
      ORDER BY m.created_at ASC LIMIT 1
    ),
    'super_like', COALESCE(rl.super_like, false)
  )
  FROM public.conversations c
  JOIN public.conversation_members cm
    ON cm.conversation_id = c.id AND cm.user_id = p_user_id AND cm.left_at IS NULL
  LEFT JOIN public.user_profiles p ON p.id = c.dm_initiator
  LEFT JOIN public.profiles_mode pm ON pm.user_id = c.dm_initiator AND pm.mode = 'romance'
  LEFT JOIN public.romance_likes rl ON rl.liker_id = c.dm_initiator AND rl.liked_id = p_user_id
  WHERE c.type = 'dm' AND c.mode = 'romance' AND c.dm_source = 'invite'
    AND c.romance_invite_status = 'pending' AND c.dm_initiator <> p_user_id
    AND NOT EXISTS (
      SELECT 1 FROM public.romance_likes x
      WHERE x.liker_id = p_user_id AND x.liked_id = c.dm_initiator
    )
  ORDER BY c.last_message_at DESC NULLS LAST, c.created_at DESC;
END;
$$;

-- ── Privileged RPCs: private impl + public INVOKER wrapper ───────────────────
CREATE OR REPLACE FUNCTION private.match_contacts_impl(
  p_email_hashes text[] DEFAULT NULL,
  p_phone_hashes text[] DEFAULT NULL,
  p_limit integer DEFAULT 50
)
RETURNS TABLE(user_id uuid, email_hash text, phone_hash text)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, auth, extensions
AS $$
  WITH candidates AS (
    SELECT u.id AS user_id,
      encode(digest(lower(trim(coalesce(u.email, ''))), 'sha256'), 'hex') AS email_hash,
      encode(digest(regexp_replace(coalesce(u.phone, ''), '[^0-9]', '', 'g'), 'sha256'), 'hex') AS phone_hash
    FROM auth.users u
    WHERE u.id != auth.uid()
  )
  SELECT c.user_id, c.email_hash, c.phone_hash
  FROM candidates c
  WHERE (
    (p_email_hashes IS NOT NULL AND c.email_hash = ANY(p_email_hashes)
     AND c.email_hash <> encode(digest('', 'sha256'), 'hex'))
    OR (p_phone_hashes IS NOT NULL AND c.phone_hash = ANY(p_phone_hashes)
        AND c.phone_hash <> encode(digest('', 'sha256'), 'hex'))
  )
  LIMIT greatest(0, least(coalesce(p_limit, 50), 200));
$$;

CREATE OR REPLACE FUNCTION public.match_contacts(
  p_email_hashes text[] DEFAULT NULL,
  p_phone_hashes text[] DEFAULT NULL,
  p_limit integer DEFAULT 50
)
RETURNS TABLE(user_id uuid, email_hash text, phone_hash text)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, private
AS $$
  SELECT * FROM private.match_contacts_impl(p_email_hashes, p_phone_hashes, p_limit);
$$;

CREATE OR REPLACE FUNCTION private.remove_mode_connection_impl(
  p_other_user_id uuid,
  p_mode app_mode
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_chat_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'remove_mode_connection: not authenticated' USING ERRCODE = '28000';
  END IF;
  IF p_other_user_id IS NULL OR p_other_user_id = v_uid THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_user');
  END IF;
  IF p_mode = 'romance' THEN
    DELETE FROM public.romance_likes
    WHERE (liker_id = v_uid AND liked_id = p_other_user_id)
       OR (liker_id = p_other_user_id AND liked_id = v_uid);
  ELSIF p_mode = 'friends' THEN
    DELETE FROM public.follows
    WHERE (follower_id = v_uid AND followee_id = p_other_user_id)
       OR (follower_id = p_other_user_id AND followee_id = v_uid);
  ELSIF p_mode = 'business' THEN
    UPDATE public.business_connections
    SET status = 'withdrawn', withdrawn_at = now()
    WHERE status = 'accepted'
      AND ((from_user_id = v_uid AND to_user_id = p_other_user_id)
        OR (from_user_id = p_other_user_id AND to_user_id = v_uid));
  ELSE
    RETURN jsonb_build_object('ok', false, 'error', 'unsupported_mode');
  END IF;
  SELECT c.id INTO v_chat_id
  FROM public.conversations c
  JOIN public.conversation_members cm1 ON cm1.conversation_id = c.id AND cm1.user_id = v_uid
  JOIN public.conversation_members cm2 ON cm2.conversation_id = c.id AND cm2.user_id = p_other_user_id
  WHERE c.type = 'dm' AND c.mode = p_mode
  LIMIT 1;
  IF v_chat_id IS NOT NULL THEN
    UPDATE public.conversation_members
    SET left_at = now()
    WHERE conversation_id = v_chat_id
      AND user_id IN (v_uid, p_other_user_id)
      AND left_at IS NULL;
  END IF;
  RETURN jsonb_build_object('ok', true, 'chat_id', v_chat_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.remove_mode_connection(
  p_other_user_id uuid,
  p_mode app_mode
)
RETURNS jsonb
LANGUAGE sql
SECURITY INVOKER
SET search_path = public, private
AS $$
  SELECT private.remove_mode_connection_impl(p_other_user_id, p_mode);
$$;

-- Private impls: callable by authenticated for wrapper chain, not exposed via PostgREST.
REVOKE ALL ON FUNCTION private.match_contacts_impl(text[], text[], integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.remove_mode_connection_impl(uuid, app_mode) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.match_contacts_impl(text[], text[], integer) TO authenticated;
GRANT EXECUTE ON FUNCTION private.remove_mode_connection_impl(uuid, app_mode) TO authenticated;
