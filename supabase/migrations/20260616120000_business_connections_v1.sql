-- Business Mode v1: connections, invite RPCs, extended discover feed

-- ─── Schema extensions ───────────────────────────────────────────────────────
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS invite_sending_suspended_until TIMESTAMPTZ;

ALTER TABLE public.profiles_business
  ADD COLUMN IF NOT EXISTS role TEXT,
  ADD COLUMN IF NOT EXISTS networking_goals TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS skills TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS interests TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS photo_verified_at TIMESTAMPTZ;

COMMENT ON COLUMN public.users.invite_sending_suspended_until IS
  'When set and in the future, business_connect rejects new invites (spam suspension).';

-- ─── business_connections ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.business_connections (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  to_user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status             TEXT NOT NULL CHECK (status IN ('pending','accepted','declined','withdrawn','blocked')),
  note               TEXT NOT NULL CHECK (char_length(note) BETWEEN 20 AND 200),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  accepted_at        TIMESTAMPTZ,
  declined_at        TIMESTAMPTZ,
  withdrawn_at       TIMESTAMPTZ,
  blocked_at         TIMESTAMPTZ,
  declined_until     TIMESTAMPTZ,
  reported_at        TIMESTAMPTZ,
  CONSTRAINT business_connections_no_self CHECK (from_user_id <> to_user_id),
  CONSTRAINT business_connections_unique_pair UNIQUE (from_user_id, to_user_id)
);

CREATE INDEX IF NOT EXISTS idx_bc_to_user ON public.business_connections(to_user_id, status);
CREATE INDEX IF NOT EXISTS idx_bc_from_user ON public.business_connections(from_user_id, created_at DESC);

ALTER TABLE public.business_connections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS business_connections_select ON public.business_connections;
CREATE POLICY business_connections_select ON public.business_connections
  FOR SELECT USING (auth.uid() IN (from_user_id, to_user_id));

DROP POLICY IF EXISTS business_connections_update ON public.business_connections;
CREATE POLICY business_connections_update ON public.business_connections
  FOR UPDATE USING (
    (auth.uid() = to_user_id AND status = 'pending')
    OR (auth.uid() = from_user_id AND status = 'pending')
  );

-- profile_views (Premium "who viewed me" — v2 UI; table ready)
CREATE TABLE IF NOT EXISTS public.profile_views (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  viewer_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  viewed_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  viewed_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  mode        TEXT NOT NULL DEFAULT 'business',
  CONSTRAINT profile_views_no_self CHECK (viewer_id <> viewed_id),
  CONSTRAINT profile_views_unique_hour UNIQUE (viewer_id, viewed_id)
);

CREATE INDEX IF NOT EXISTS idx_pv_viewed_id ON public.profile_views(viewed_id, viewed_at DESC);

ALTER TABLE public.profile_views ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS profile_views_select ON public.profile_views;
CREATE POLICY profile_views_select ON public.profile_views
  FOR SELECT USING (auth.uid() = viewed_id);

DROP POLICY IF EXISTS profile_views_insert ON public.profile_views;
CREATE POLICY profile_views_insert ON public.profile_views
  FOR INSERT WITH CHECK (auth.uid() = viewer_id AND viewer_id <> viewed_id);

-- AI ranking cache (populated by scheduled match_agent; optional for sort)
CREATE TABLE IF NOT EXISTS public.business_match_scores (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  viewer_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  candidate_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  score        FLOAT NOT NULL DEFAULT 0,
  scored_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT unique_bms_pair UNIQUE (viewer_id, candidate_id)
);

CREATE INDEX IF NOT EXISTS idx_bms_viewer ON public.business_match_scores(viewer_id, score DESC);

ALTER TABLE public.business_match_scores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS business_match_scores_select ON public.business_match_scores;
CREATE POLICY business_match_scores_select ON public.business_match_scores
  FOR SELECT USING (auth.uid() = viewer_id);

-- ─── business_connect ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.business_connect(p_to_user_id UUID, p_note TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid         UUID := auth.uid();
  v_tier        TEXT;
  v_daily_count INT;
  v_pending_count INT;
  v_limit_send  INT;
  v_limit_queue INT;
  v_profile     public.profiles_business%ROWTYPE;
  v_meta        JSONB;
  v_role        TEXT;
  v_goals_len   INT;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'business_connect: not authenticated' USING ERRCODE = '28000';
  END IF;

  IF char_length(coalesce(p_note, '')) < 20 OR char_length(p_note) > 200 THEN
    RETURN jsonb_build_object('error', 'NOTE_REQUIRED');
  END IF;

  SELECT subscription_tier INTO v_tier FROM public.users WHERE id = v_uid;
  v_limit_send := CASE coalesce(v_tier, 'free')
    WHEN 'super' THEN 20 WHEN 'premium' THEN 50 WHEN 'enterprise' THEN 100 ELSE 5 END;

  SELECT COUNT(*)::INT INTO v_daily_count
  FROM public.business_connections
  WHERE from_user_id = v_uid AND created_at > now() - interval '1 day';

  IF v_daily_count >= v_limit_send THEN
    RETURN jsonb_build_object('error', 'DAILY_LIMIT_REACHED', 'reset_at', (date_trunc('day', now()) + interval '1 day')::text);
  END IF;

  SELECT * INTO v_profile FROM public.profiles_business WHERE id = v_uid;
  SELECT meta INTO v_meta FROM public.sub_profiles WHERE user_id = v_uid AND mode = 'business' LIMIT 1;

  v_role := coalesce(nullif(trim(v_profile.role), ''), nullif(trim(v_meta->>'role'), ''), '');
  v_goals_len := coalesce(array_length(v_profile.networking_goals, 1), 0);
  IF v_goals_len = 0 AND v_meta ? 'networking_goals' THEN
    v_goals_len := jsonb_array_length(v_meta->'networking_goals');
  END IF;
  IF v_goals_len = 0 AND coalesce(nullif(trim(v_meta->>'networking_goal'), ''), '') <> '' THEN
    v_goals_len := 1;
  END IF;

  IF v_profile.logo_uri IS NULL
    OR char_length(v_role) < 2
    OR char_length(coalesce(nullif(trim(v_profile.business_name), ''), nullif(trim(v_meta->>'company'), ''), '')) < 2
    OR char_length(coalesce(v_profile.bio, '')) < 50
    OR v_goals_len IS NULL OR v_goals_len < 1 THEN
    RETURN jsonb_build_object('error', 'PROFILE_INCOMPLETE');
  END IF;

  v_limit_queue := CASE coalesce(v_tier, 'free')
    WHEN 'super' THEN 50 WHEN 'premium' THEN 100 ELSE 20 END;

  SELECT COUNT(*)::INT INTO v_pending_count
  FROM public.business_connections
  WHERE from_user_id = v_uid AND status = 'pending';

  IF v_pending_count >= v_limit_queue THEN
    RETURN jsonb_build_object('error', 'PENDING_QUEUE_FULL');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.business_connections bc
    WHERE ((bc.from_user_id = v_uid AND bc.to_user_id = p_to_user_id)
        OR (bc.from_user_id = p_to_user_id AND bc.to_user_id = v_uid))
      AND (bc.status = 'blocked'
        OR (bc.status = 'declined' AND bc.declined_until > now()))
  ) THEN
    RETURN jsonb_build_object('error', 'BLOCKED_OR_COOLING_OFF');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = v_uid AND u.invite_sending_suspended_until > now()
  ) THEN
    RETURN jsonb_build_object('error', 'ACCOUNT_SUSPENDED');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.user_blocks ub
    WHERE (ub.blocker_id = v_uid AND ub.blocked_id = p_to_user_id)
       OR (ub.blocker_id = p_to_user_id AND ub.blocked_id = v_uid)
  ) THEN
    RETURN jsonb_build_object('error', 'BLOCKED_OR_COOLING_OFF');
  END IF;

  INSERT INTO public.business_connections(from_user_id, to_user_id, status, note)
  VALUES (v_uid, p_to_user_id, 'pending', p_note)
  ON CONFLICT (from_user_id, to_user_id) DO UPDATE
    SET status = 'pending', note = EXCLUDED.note, created_at = now(),
        declined_at = NULL, declined_until = NULL, withdrawn_at = NULL;

  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.business_connect(UUID, TEXT) TO authenticated;

-- ─── business_accept_connection ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.business_accept_connection(p_connection_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid       UUID := auth.uid();
  v_row       public.business_connections%ROWTYPE;
  v_chat_id   UUID;
  v_note      TEXT;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'business_accept_connection: not authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO v_row FROM public.business_connections WHERE id = p_connection_id;
  IF v_row.id IS NULL OR v_row.to_user_id <> v_uid OR v_row.status <> 'pending' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_connection');
  END IF;

  v_note := v_row.note;

  UPDATE public.business_connections
  SET status = 'accepted', accepted_at = now()
  WHERE id = p_connection_id;

  v_chat_id := public.create_direct_chat(
    v_row.from_user_id, v_row.to_user_id, 'business'::app_mode, 'connection'::dm_source, v_uid
  );

  INSERT INTO public.messages (conversation_id, sender_id, content, message_type)
  VALUES (v_chat_id, v_row.from_user_id, v_note, 'text');

  RETURN jsonb_build_object('ok', true, 'chat_id', v_chat_id, 'connection_id', p_connection_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.business_accept_connection(UUID) TO authenticated;

-- ─── business_decline_connection ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.business_decline_connection(p_connection_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_row public.business_connections%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'business_decline_connection: not authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO v_row FROM public.business_connections WHERE id = p_connection_id;
  IF v_row.id IS NULL OR v_row.to_user_id <> v_uid OR v_row.status <> 'pending' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_connection');
  END IF;

  UPDATE public.business_connections
  SET status = 'declined', declined_at = now(), declined_until = now() + interval '90 days'
  WHERE id = p_connection_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.business_decline_connection(UUID) TO authenticated;

-- ─── Pending invite count ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.business_pending_invites_count()
RETURNS INT
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT COUNT(*)::INT
  FROM public.business_connections
  WHERE to_user_id = auth.uid() AND status = 'pending';
$$;

GRANT EXECUTE ON FUNCTION public.business_pending_invites_count() TO authenticated;

-- ─── Extended discover feed ───────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.business_discover_feed(UUID, INT);

CREATE OR REPLACE FUNCTION public.business_discover_feed(
  current_user_id UUID,
  p_limit INT DEFAULT 100,
  p_query TEXT DEFAULT NULL,
  p_role_type TEXT DEFAULT NULL,
  p_networking_goal TEXT DEFAULT NULL,
  p_skills TEXT[] DEFAULT NULL,
  p_sort TEXT DEFAULT 'relevant',
  p_cursor UUID DEFAULT NULL
)
RETURNS SETOF public.profiles_business
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_q TEXT := nullif(trim(p_query), '');
BEGIN
  IF current_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'business_discover_feed: forbidden' USING ERRCODE = '28000';
  END IF;

  RETURN QUERY
  SELECT pb.*
  FROM public.profiles_business pb
  LEFT JOIN public.business_match_scores bms
    ON bms.viewer_id = current_user_id AND bms.candidate_id = pb.id
  WHERE pb.id != current_user_id
    AND (p_cursor IS NULL OR pb.id > p_cursor)
    AND NOT EXISTS (
      SELECT 1 FROM public.user_blocks ub
      WHERE (ub.blocker_id = current_user_id AND ub.blocked_id = pb.id)
         OR (ub.blocker_id = pb.id AND ub.blocked_id = current_user_id)
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.business_connections bc
      WHERE ((bc.from_user_id = current_user_id AND bc.to_user_id = pb.id)
          OR (bc.from_user_id = pb.id AND bc.to_user_id = current_user_id))
        AND (bc.status = 'blocked'
          OR (bc.status = 'declined' AND bc.declined_until > now()))
    )
    AND (v_q IS NULL OR (
      coalesce(pb.business_name, '') || ' ' ||
      coalesce(pb.role, '') || ' ' ||
      coalesce(pb.area, '') || ' ' ||
      coalesce(pb.bio, '') || ' ' ||
      coalesce(pb.location, '') || ' ' ||
      coalesce(array_to_string(pb.networking_goals, ' '), '') || ' ' ||
      coalesce(array_to_string(pb.skills, ' '), '') || ' ' ||
      coalesce(array_to_string(pb.tags, ' '), '')
    ) ILIKE '%' || v_q || '%')
    AND (p_role_type IS NULL OR pb.role ILIKE '%' || p_role_type || '%')
    AND (p_networking_goal IS NULL OR p_networking_goal = ANY(pb.networking_goals))
    AND (p_skills IS NULL OR pb.skills && p_skills)
  ORDER BY
    CASE WHEN coalesce(p_sort, 'relevant') = 'relevant' THEN bms.score END DESC NULLS LAST,
    CASE WHEN p_sort = 'newest' THEN pb.created_at END DESC NULLS LAST,
    pb.updated_at DESC NULLS LAST,
    pb.id
  LIMIT greatest(0, least(coalesce(p_limit, 100), 200));
END;
$$;

GRANT EXECUTE ON FUNCTION public.business_discover_feed(UUID, INT, TEXT, TEXT, TEXT, TEXT[], TEXT, UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.business_home_feed(
  current_user_id UUID,
  p_limit INT DEFAULT 20,
  p_query TEXT DEFAULT NULL,
  p_role_type TEXT DEFAULT NULL,
  p_networking_goal TEXT DEFAULT NULL
)
RETURNS SETOF public.profiles_business
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT * FROM public.business_discover_feed(
    current_user_id, p_limit, p_query, p_role_type, p_networking_goal, NULL, 'relevant', NULL
  );
$$;

GRANT EXECUTE ON FUNCTION public.business_home_feed(UUID, INT, TEXT, TEXT, TEXT) TO authenticated;
