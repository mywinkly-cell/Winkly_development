-- Move PostGIS from public → extensions so spatial_ref_sys is no longer exposed
-- via PostgREST (clears Splinter rls_disabled_in_public on public.spatial_ref_sys).
--
-- Preserves user_locations rows and recreates geo RPCs with search_path = public, extensions.

CREATE SCHEMA IF NOT EXISTS extensions;

-- 1) Backup stored locations as plain lat/lng (no geography type dependency)
CREATE TABLE IF NOT EXISTS private._user_locations_postgis_backup (
  user_id    UUID PRIMARY KEY,
  lat        DOUBLE PRECISION NOT NULL,
  lng        DOUBLE PRECISION NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

TRUNCATE private._user_locations_postgis_backup;

INSERT INTO private._user_locations_postgis_backup (user_id, lat, lng, updated_at)
SELECT
  ul.user_id,
  ST_Y(ul.geog::geometry),
  ST_X(ul.geog::geometry),
  ul.updated_at
FROM public.user_locations ul;

-- 2) Drop app objects that depend on public-scoped PostGIS types/functions
DROP FUNCTION IF EXISTS public.romance_discover_feed_geo(UUID, INT, INT, INT, TEXT[], INT);
DROP FUNCTION IF EXISTS public.set_my_location_precision(TEXT);
DROP FUNCTION IF EXISTS public.set_my_location(DOUBLE PRECISION, DOUBLE PRECISION, TEXT);
DROP FUNCTION IF EXISTS public.set_my_location(DOUBLE PRECISION, DOUBLE PRECISION);
DROP TABLE IF EXISTS public.user_locations;

DROP EXTENSION IF EXISTS postgis CASCADE;

CREATE EXTENSION postgis WITH SCHEMA extensions;

-- 3) Recreate user_locations (geography type lives in extensions schema)
CREATE TABLE public.user_locations (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  geog extensions.geography(Point, 4326) NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX user_locations_geog_idx
  ON public.user_locations USING GIST (geog);

ALTER TABLE public.user_locations ENABLE ROW LEVEL SECURITY;

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

INSERT INTO public.user_locations (user_id, geog, updated_at)
SELECT
  b.user_id,
  ST_SetSRID(ST_MakePoint(b.lng, b.lat), 4326)::extensions.geography,
  b.updated_at
FROM private._user_locations_postgis_backup b;

DROP TABLE private._user_locations_postgis_backup;

-- 4) Restore geo RPCs (latest bodies; search_path includes extensions)
CREATE OR REPLACE FUNCTION public.set_my_location(
  p_lat DOUBLE PRECISION,
  p_lng DOUBLE PRECISION,
  p_precision TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
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
    UPDATE public.user_profiles
      SET location_precision = v_precision
    WHERE id = v_uid;
  END IF;

  v_lat := public._winkly_snap_coord(p_lat, v_precision);
  v_lng := public._winkly_snap_coord(p_lng, v_precision);

  INSERT INTO public.user_locations (user_id, geog, updated_at)
  VALUES (
    v_uid,
    ST_SetSRID(ST_MakePoint(v_lng, v_lat), 4326)::extensions.geography,
    now()
  )
  ON CONFLICT (user_id) DO UPDATE
    SET geog = EXCLUDED.geog,
        updated_at = now();
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_my_location(DOUBLE PRECISION, DOUBLE PRECISION, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_my_location_precision(
  p_precision TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
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

  UPDATE public.user_profiles
    SET location_precision = v_precision
  WHERE id = v_uid;

  SELECT ST_Y(geog::geometry), ST_X(geog::geometry)
    INTO v_lat, v_lng
  FROM public.user_locations
  WHERE user_id = v_uid;

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

GRANT EXECUTE ON FUNCTION public.set_my_location_precision(TEXT) TO authenticated;

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
SET search_path = public, extensions
AS $$
DECLARE
  v_self_geog extensions.geography;
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

-- 5) Re-assert Security Advisor fixes (idempotent; dashboard cache may lag)
ALTER VIEW public.public_profile_view SET (security_invoker = on);
ALTER VIEW public.pending_plans_with_confirmation_counts SET (security_invoker = on);

DROP POLICY IF EXISTS webhook_config_no_api ON private.webhook_config;
CREATE POLICY webhook_config_no_api ON private.webhook_config
  AS RESTRICTIVE
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);
