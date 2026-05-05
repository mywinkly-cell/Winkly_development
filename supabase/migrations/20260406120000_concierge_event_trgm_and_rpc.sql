-- Concierge supply: pg_trgm indexes + RPC for fuzzy event matching (title/description/category vs user intent).
-- Requires public.events with start_at (app standard); if your DB only has starts_at, run a column sync or skip this migration’s function and rely on JS scoring in ai-gateway.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- GIN indexes for similarity / ILIKE on events (safe no-op if table missing)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'events'
  ) THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'events' AND column_name = 'title'
    ) THEN
      EXECUTE 'CREATE INDEX IF NOT EXISTS idx_events_title_trgm ON public.events USING gin (lower(title) gin_trgm_ops)';
    END IF;
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'events' AND column_name = 'description'
    ) THEN
      EXECUTE 'CREATE INDEX IF NOT EXISTS idx_events_description_trgm ON public.events USING gin (lower(description) gin_trgm_ops)';
    END IF;
  END IF;
END $$;

-- Fuzzy match events for concierge (service role / definer read)
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
  start_at timestamptz,
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
    WHERE table_schema = 'public' AND table_name = 'events' AND column_name = 'start_at'
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
    e.start_at,
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
  WHERE e.start_at >= p_from
    AND e.start_at <= p_to
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
  ORDER BY trgm_score DESC NULLS LAST, e.start_at ASC
  LIMIT lim;
END;
$$;

COMMENT ON FUNCTION public.match_events_for_concierge(text, text, timestamptz, timestamptz, int) IS
  'ai-gateway: fuzzy-match public events by intent text + city + time window.';

GRANT EXECUTE ON FUNCTION public.match_events_for_concierge(text, text, timestamptz, timestamptz, int) TO anon, authenticated, service_role;
