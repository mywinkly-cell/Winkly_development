-- ─────────────────────────────────────────────────────────────────────────────
-- Location privacy — exact vs approximate, and ALWAYS store quantized coordinates
--
-- App Store / GDPR requirement:
--   * Users choose a discovery location precision: 'precise' or 'approximate'.
--   * The raw device GPS coordinates are NEVER persisted. set_my_location() snaps
--     the incoming coordinates to a coarse grid (rounding) BEFORE building the
--     geography point, so user_locations only ever holds an approximated point.
--       - 'approximate' → ~1.1 km grid (2 decimal places)  [default, GDPR-friendly]
--       - 'precise'     → ~110 m grid  (3 decimal places)   [still not raw GPS]
--   * Other users still never read coordinates (owner-only RLS); they only get a
--     rounded distance label from romance_discover_feed_geo.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1) Persisted per-user precision preference (independent of whether a location
--    point exists yet, so users can opt into 'approximate' before sharing).
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS location_precision TEXT NOT NULL DEFAULT 'approximate';

DO $$
BEGIN
  ALTER TABLE public.user_profiles
    ADD CONSTRAINT user_profiles_location_precision_chk
    CHECK (location_precision IN ('precise', 'approximate'));
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

COMMENT ON COLUMN public.user_profiles.location_precision IS
  'Discovery location precision chosen by the user: precise (~110m grid) or approximate (~1.1km grid). Raw GPS is never stored; set_my_location snaps to this grid.';

-- 2) Coordinate quantizer — snaps a lat/lng to the grid for the chosen precision.
CREATE OR REPLACE FUNCTION public._winkly_snap_coord(
  p_value DOUBLE PRECISION,
  p_precision TEXT
)
RETURNS DOUBLE PRECISION
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT round(
    p_value::numeric,
    CASE WHEN p_precision = 'precise' THEN 3 ELSE 2 END
  )::double precision;
$$;

-- 3) set_my_location — now quantizes before storing and honours the precision
--    preference. Backwards compatible: callers passing only (lat, lng) still work
--    (p_precision defaults to NULL → falls back to the stored preference).
DROP FUNCTION IF EXISTS public.set_my_location(DOUBLE PRECISION, DOUBLE PRECISION);

CREATE OR REPLACE FUNCTION public.set_my_location(
  p_lat DOUBLE PRECISION,
  p_lng DOUBLE PRECISION,
  p_precision TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

  -- Resolve precision: explicit arg > stored preference > 'approximate' default.
  v_precision := lower(NULLIF(p_precision, ''));
  IF v_precision IS NULL THEN
    SELECT location_precision INTO v_precision
    FROM public.user_profiles WHERE id = v_uid;
  END IF;
  IF v_precision NOT IN ('precise', 'approximate') OR v_precision IS NULL THEN
    v_precision := 'approximate';
  END IF;

  -- Persist the preference when the caller passed one explicitly.
  IF p_precision IS NOT NULL THEN
    UPDATE public.user_profiles
      SET location_precision = v_precision
    WHERE id = v_uid;
  END IF;

  -- Quantize BEFORE storing — raw device coordinates are never persisted.
  v_lat := public._winkly_snap_coord(p_lat, v_precision);
  v_lng := public._winkly_snap_coord(p_lng, v_precision);

  INSERT INTO public.user_locations (user_id, geog, updated_at)
  VALUES (
    v_uid,
    ST_SetSRID(ST_MakePoint(v_lng, v_lat), 4326)::geography,
    now()
  )
  ON CONFLICT (user_id) DO UPDATE
    SET geog = EXCLUDED.geog,
        updated_at = now();
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_my_location(DOUBLE PRECISION, DOUBLE PRECISION, TEXT) TO authenticated;

-- 4) set_my_location_precision — change the preference from settings without a new
--    GPS read. Re-snaps any existing stored point to the new grid (coarsening is
--    immediate; switching to 'precise' takes effect on the next location refresh).
CREATE OR REPLACE FUNCTION public.set_my_location_precision(
  p_precision TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

  -- Re-snap an existing point so coarsening applies immediately (never up-samples).
  SELECT ST_Y(geog::geometry), ST_X(geog::geometry)
    INTO v_lat, v_lng
  FROM public.user_locations
  WHERE user_id = v_uid;

  IF v_lat IS NOT NULL THEN
    v_lat := public._winkly_snap_coord(v_lat, v_precision);
    v_lng := public._winkly_snap_coord(v_lng, v_precision);
    UPDATE public.user_locations
      SET geog = ST_SetSRID(ST_MakePoint(v_lng, v_lat), 4326)::geography,
          updated_at = now()
    WHERE user_id = v_uid;
  END IF;

  RETURN v_precision;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_my_location_precision(TEXT) TO authenticated;

-- 5) get_my_location_precision — convenience reader for the settings screen.
CREATE OR REPLACE FUNCTION public.get_my_location_precision()
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT coalesce(
    (SELECT location_precision FROM public.user_profiles WHERE id = auth.uid()),
    'approximate'
  );
$$;

GRANT EXECUTE ON FUNCTION public.get_my_location_precision() TO authenticated;
