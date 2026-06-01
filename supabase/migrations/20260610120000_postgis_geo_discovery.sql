-- ─────────────────────────────────────────────────────────────────────────────
-- Geo-based discovery (PostGIS)
--
-- Adds opt-in coarse location for Romance discovery distance filtering.
--
-- Privacy / GDPR:
--   * Raw coordinates live in public.user_locations and are NEVER readable by
--     other users (no SELECT policy grants access to anyone but the owner).
--   * Distances are computed server-side in SECURITY DEFINER functions that
--     only ever return a ROUNDED distance in km + a human label ("~3 km away").
--   * Coordinates are written via set_my_location() so clients never touch the
--     geography column directly.
-- ─────────────────────────────────────────────────────────────────────────────

-- Install into public so the unqualified GEOGRAPHY type + ST_* functions below
-- resolve under the default search_path (matches pg_trgm/vector on this project).
CREATE EXTENSION IF NOT EXISTS postgis WITH SCHEMA public;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. user_locations — one coarse point per user (updated on app open, not live)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.user_locations (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  geog GEOGRAPHY(Point, 4326) NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS user_locations_geog_idx
  ON public.user_locations USING GIST (geog);

ALTER TABLE public.user_locations ENABLE ROW LEVEL SECURITY;

-- Owner-only access. There is intentionally NO policy that lets other users read
-- a row; cross-user distance is exposed only through the SECURITY DEFINER feed.
DROP POLICY IF EXISTS user_locations_select_own ON public.user_locations;
DROP POLICY IF EXISTS user_locations_insert_own ON public.user_locations;
DROP POLICY IF EXISTS user_locations_update_own ON public.user_locations;
DROP POLICY IF EXISTS user_locations_delete_own ON public.user_locations;

CREATE POLICY user_locations_select_own ON public.user_locations
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY user_locations_insert_own ON public.user_locations
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY user_locations_update_own ON public.user_locations
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY user_locations_delete_own ON public.user_locations
  FOR DELETE USING (auth.uid() = user_id);

COMMENT ON TABLE public.user_locations IS
  'Coarse per-user location for discovery distance filtering. Raw coordinates are owner-only (RLS); other users only ever see rounded distances via romance_discover_feed_geo.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. set_my_location — write own coordinates (geography built server-side)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_my_location(
  p_lat DOUBLE PRECISION,
  p_lng DOUBLE PRECISION
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'set_my_location: not authenticated' USING ERRCODE = '28000';
  END IF;

  IF p_lat IS NULL OR p_lng IS NULL
     OR p_lat < -90 OR p_lat > 90
     OR p_lng < -180 OR p_lng > 180 THEN
    RAISE EXCEPTION 'set_my_location: invalid coordinates' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.user_locations (user_id, geog, updated_at)
  VALUES (
    v_uid,
    ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography,
    now()
  )
  ON CONFLICT (user_id) DO UPDATE
    SET geog = EXCLUDED.geog,
        updated_at = now();
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_my_location(DOUBLE PRECISION, DOUBLE PRECISION) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. romance_discover_feed_geo — discovery feed with distance / age / gender
--    filtering. Returns a ROUNDED distance only; never raw coordinates.
--
--    Behaviour notes:
--      * p_max_distance_km NULL  => no distance filter ("Any").
--      * If the caller has no stored location, the distance filter is skipped
--        (we don't want to hide everyone before they share location).
--      * Candidates without a stored location are kept (sorted last) so the
--        feed still works during rollout.
--      * Already-liked, already-passed and blocked users are excluded.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.romance_discover_feed_geo(
  current_user_id UUID,
  p_max_distance_km INT DEFAULT NULL,
  p_age_min INT DEFAULT NULL,
  p_age_max INT DEFAULT NULL,
  p_genders TEXT[] DEFAULT NULL,
  p_limit INT DEFAULT 100
)
RETURNS TABLE (
  id UUID,
  first_name TEXT,
  last_name TEXT,
  gender TEXT,
  age INT,
  city TEXT,
  education TEXT,
  languages TEXT[],
  occupation TEXT,
  interests TEXT[],
  core_photos TEXT[],
  main_photo_url TEXT,
  instagram TEXT,
  bio_romance TEXT,
  romance_photos TEXT[],
  romance_interests TEXT[],
  romance_meta JSONB,
  distance_km INT,
  distance_label TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_self_geog GEOGRAPHY;
BEGIN
  IF current_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'romance_discover_feed_geo: forbidden' USING ERRCODE = '28000';
  END IF;

  SELECT ul.geog INTO v_self_geog
  FROM public.user_locations ul
  WHERE ul.user_id = current_user_id;

  RETURN QUERY
  WITH base AS (
    SELECT
      v.id,
      v.first_name,
      v.last_name,
      v.gender,
      v.age,
      v.city,
      v.education,
      v.languages,
      v.occupation,
      v.interests,
      v.core_photos,
      v.main_photo_url,
      v.instagram,
      v.bio_romance,
      v.romance_photos,
      v.romance_interests,
      v.romance_meta,
      v.updated_at,
      CASE
        WHEN v_self_geog IS NOT NULL AND cl.geog IS NOT NULL
          THEN ST_Distance(v_self_geog, cl.geog)
        ELSE NULL
      END AS dist_m
    FROM public.public_profile_view v
    INNER JOIN public.profiles_mode pm ON pm.user_id = v.id AND pm.mode = 'romance'
    LEFT JOIN public.user_locations cl ON cl.user_id = v.id
    WHERE v.id IS NOT NULL
      AND v.id <> current_user_id
      AND NOT EXISTS (
        SELECT 1 FROM public.romance_likes rl
        WHERE rl.liker_id = current_user_id AND rl.liked_id = v.id
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.user_swipes us
        WHERE us.user_id = current_user_id
          AND us.target_user_id = v.id
          AND us.mode = 'romance'
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.user_blocks ub
        WHERE (ub.blocker_id = current_user_id AND ub.blocked_id = v.id)
           OR (ub.blocker_id = v.id AND ub.blocked_id = current_user_id)
      )
  )
  SELECT
    b.id,
    b.first_name,
    b.last_name,
    b.gender,
    b.age,
    b.city,
    b.education,
    b.languages,
    b.occupation,
    b.interests,
    b.core_photos,
    b.main_photo_url,
    b.instagram,
    b.bio_romance,
    b.romance_photos,
    b.romance_interests,
    b.romance_meta,
    CASE WHEN b.dist_m IS NULL THEN NULL
         ELSE GREATEST(1, ROUND(b.dist_m / 1000.0))::int END AS distance_km,
    CASE
      WHEN b.dist_m IS NULL THEN NULL
      WHEN b.dist_m < 1000 THEN '< 1 km away'
      ELSE '~' || GREATEST(1, ROUND(b.dist_m / 1000.0))::int::text || ' km away'
    END AS distance_label
  FROM base b
  WHERE (p_age_min IS NULL OR b.age IS NULL OR b.age >= p_age_min)
    AND (p_age_max IS NULL OR b.age IS NULL OR b.age <= p_age_max)
    AND (
      p_genders IS NULL
      OR array_length(p_genders, 1) IS NULL
      OR b.gender = ANY(p_genders)
    )
    AND (
      p_max_distance_km IS NULL
      OR v_self_geog IS NULL
      OR b.dist_m IS NULL
      OR b.dist_m <= p_max_distance_km * 1000.0
    )
  ORDER BY b.dist_m ASC NULLS LAST, b.updated_at DESC NULLS LAST
  LIMIT COALESCE(p_limit, 100);
END;
$$;

GRANT EXECUTE ON FUNCTION public.romance_discover_feed_geo(UUID, INT, INT, INT, TEXT[], INT) TO authenticated;
