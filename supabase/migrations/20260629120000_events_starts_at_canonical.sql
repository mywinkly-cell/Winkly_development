-- Canonicalize the events time column to starts_at.
-- Idempotent and non-destructive to data: reconciles any environment that drifted to a
-- physical start_at column. The drift originates in 20250216110000_remaining_tables_and_views.sql,
-- whose `ADD COLUMN IF NOT EXISTS start_at` lands on top of the original starts_at
-- (20250130000001_winkly_schema.sql), leaving two columns with start_at empty.
--
-- After this runs, public.events exposes only starts_at. We also re-create
-- match_events_for_concierge() against starts_at: editing the original 20260406120000
-- migration does not re-run it where it was already applied, so without this the deployed
-- function would still reference the (now dropped) start_at column.

-- 1. Reconcile the column to canonical starts_at.
DO $$
DECLARE
  has_start_at  boolean;
  has_starts_at boolean;
BEGIN
  SELECT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='events' AND column_name='start_at')  INTO has_start_at;
  SELECT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='events' AND column_name='starts_at') INTO has_starts_at;

  -- Case A: drifted env has start_at but not starts_at -> rename to canonical.
  IF has_start_at AND NOT has_starts_at THEN
    ALTER TABLE public.events RENAME COLUMN start_at TO starts_at;

  -- Case B: both exist (the worst drift) -> backfill starts_at from start_at where null, then drop start_at.
  ELSIF has_start_at AND has_starts_at THEN
    UPDATE public.events SET starts_at = COALESCE(starts_at, start_at);
    ALTER TABLE public.events DROP COLUMN start_at;
  END IF;
  -- Case C: only starts_at exists -> nothing to do (canonical already).
END $$;

-- 2. Re-create the concierge matcher against starts_at so already-applied environments stay
--    consistent after start_at is dropped. Body mirrors 20260406120000 verbatim except the column.
CREATE OR REPLACE FUNCTION public.match_events_for_concierge(
  p_search text,
  p_city text,
  p_from timestamptz,
  p_to timestamptz,
  p_limit int DEFAULT 20
)
RETURNS TABLE (
  id uuid,
  title text,
  description text,
  location text,
  city text,
  category text,
  tags text[],
  starts_at timestamptz,
  end_at timestamptz,
  mode text,
  visibility text,
  price_eur numeric,
  trgm_score double precision
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  lim int := LEAST(GREATEST(COALESCE(p_limit, 20), 1), 50);
  search_trim text := trim(COALESCE(p_search, ''));
  city_trim text := trim(COALESCE(p_city, ''));
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'events' AND column_name = 'starts_at'
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    e.id,
    e.title,
    e.description,
    e.location,
    e.city,
    e.category,
    e.tags,
    e.starts_at,
    e.end_at,
    e.mode::text,
    COALESCE(e.visibility::text, 'public'),
    e.price_eur,
    GREATEST(
      similarity(lower(COALESCE(e.title, '')), lower(search_trim)),
      similarity(lower(COALESCE(e.description, '')), lower(search_trim)),
      similarity(lower(COALESCE(e.category, '')), lower(search_trim)),
      similarity(
        lower(COALESCE(e.title, '') || ' ' || COALESCE(e.description, '') || ' ' || COALESCE(e.category, '')),
        lower(search_trim)
      )
    )::double precision AS trgm_score
  FROM public.events e
  WHERE e.starts_at >= p_from
    AND e.starts_at <= p_to
    AND (COALESCE(e.visibility::text, 'public') IN ('public', 'Public'))
    AND (
      city_trim = ''
      OR lower(COALESCE(e.city, '')) LIKE '%' || lower(city_trim) || '%'
      OR lower(COALESCE(e.location, '')) LIKE '%' || lower(city_trim) || '%'
    )
    AND (
      (search_trim <> '' AND (
        similarity(
          lower(COALESCE(e.title, '') || ' ' || COALESCE(e.description, '') || ' ' || COALESCE(e.category, '')),
          lower(search_trim)
        ) > 0.06
        OR lower(COALESCE(e.title, '') || ' ' || COALESCE(e.description, '')) % lower(search_trim)
      ))
      OR (search_trim = '' AND city_trim <> '')
    )
    AND (search_trim <> '' OR city_trim <> '')
  ORDER BY trgm_score DESC NULLS LAST, e.starts_at ASC
  LIMIT lim;
END;
$$;

COMMENT ON FUNCTION public.match_events_for_concierge(text, text, timestamptz, timestamptz, int) IS
  'ai-gateway: fuzzy-match public events by intent text + city + time window.';

GRANT EXECUTE ON FUNCTION public.match_events_for_concierge(text, text, timestamptz, timestamptz, int) TO anon, authenticated, service_role;
