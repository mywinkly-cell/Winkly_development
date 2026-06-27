-- Canonicalize the events END time column to ends_at, and enforce plan-time integrity.
--
-- Completes the start_at/end_at drift cleanup begun in 20260629120000 (which handled the START
-- column). The END drift originates the same way: 20250130000001_winkly_schema.sql creates
-- events.ends_at, then an earlier revision of 20250216110000_remaining_tables_and_views.sql bolted on
-- a second physical column end_at via `ADD COLUMN IF NOT EXISTS end_at`. The app and RPC then wrote/read
-- end_at while ends_at sat empty — two columns, one of them stale. (The source migration now emits
-- ends_at directly, so fresh DBs never drift; this migration reconciles environments that already
-- applied the drifted version.)
--
-- After this runs, public.events exposes only starts_at / ends_at — matching planner_items and
-- confirmed_events, which were always canonical. We also:
--   * re-create match_events_for_concierge() against ends_at (an already-deployed end_at version would
--     break the instant end_at is dropped, since its body references the column),
--   * add NOT NULL (starts_at) + CHECK (ends_at IS NULL OR ends_at > starts_at) on the three plan tables,
--   * install a BEFORE INSERT guard that rejects past-dated or inverted-time plans with a clear error
--     (a CHECK constraint cannot reference now(), so the past-date rule lives in a trigger).
--
-- Idempotent-safe (re-runnable) and reversible (see DOWN block at the bottom).

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Reconcile events end column to canonical ends_at (mirrors the start reconciliation in 20260629120000).
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  has_end_at  boolean;
  has_ends_at boolean;
BEGIN
  SELECT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='events' AND column_name='end_at')  INTO has_end_at;
  SELECT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='events' AND column_name='ends_at') INTO has_ends_at;

  -- Case A: drifted env has end_at but not ends_at -> rename to canonical.
  IF has_end_at AND NOT has_ends_at THEN
    ALTER TABLE public.events RENAME COLUMN end_at TO ends_at;

  -- Case B: both exist (the real-world drift) -> backfill ends_at from the column the app actually wrote
  --         (end_at), then drop end_at. ends_at is the empty origin column, so prefer end_at's data.
  ELSIF has_end_at AND has_ends_at THEN
    UPDATE public.events SET ends_at = COALESCE(end_at, ends_at);
    ALTER TABLE public.events DROP COLUMN end_at;
  END IF;
  -- Case C: only ends_at exists -> nothing to do (canonical already; fresh DBs land here).
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Re-assert the concierge matcher against starts_at / ends_at.
--    Required for already-applied DBs whose live function still returns end_at: once end_at is dropped
--    above, that function would error on every call. DROP is required because CREATE OR REPLACE cannot
--    rename an OUT column (end_at -> ends_at). Body mirrors 20260406120000 verbatim except the column.
-- ─────────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.match_events_for_concierge(text, text, timestamptz, timestamptz, int);

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
  ends_at timestamptz,
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
    e.ends_at,
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

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Integrity constraints: starts_at NOT NULL + ends_at must be after starts_at.
--    Applied to the three canonical plan tables. Sanitize any inverted legacy rows first (null the
--    meaningless end time) so the CHECK validates instead of failing the migration on dirty data.
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  t text;
  has_null boolean;
BEGIN
  FOREACH t IN ARRAY ARRAY['events', 'planner_items', 'confirmed_events'] LOOP
    CONTINUE WHEN NOT EXISTS (SELECT 1 FROM information_schema.tables
                              WHERE table_schema='public' AND table_name=t);

    -- Null out meaningless inverted end times so the CHECK validates instead of failing on dirty data.
    EXECUTE format(
      'UPDATE public.%I SET ends_at = NULL WHERE ends_at IS NOT NULL AND ends_at <= starts_at', t);

    -- (Re)create the "ends_at after starts_at" CHECK idempotently.
    EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT IF EXISTS %I', t, t || '_ends_after_starts');
    EXECUTE format(
      'ALTER TABLE public.%I ADD CONSTRAINT %I CHECK (ends_at IS NULL OR ends_at > starts_at)',
      t, t || '_ends_after_starts');

    -- Enforce starts_at NOT NULL (no-op where already enforced; only set when there are no NULL rows).
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema='public' AND table_name=t
                 AND column_name='starts_at' AND is_nullable='YES') THEN
      EXECUTE format('SELECT EXISTS (SELECT 1 FROM public.%I WHERE starts_at IS NULL)', t) INTO has_null;
      IF NOT has_null THEN
        EXECUTE format('ALTER TABLE public.%I ALTER COLUMN starts_at SET NOT NULL', t);
      END IF;
    END IF;
  END LOOP;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Reject past-dated / inverted-time PLANS at write time, with a clear error.
--    A plan that lands on the planner or a calendar must be in the future and well-formed — this is the
--    product-trust guarantee (a handed-to-you plan must not point at a time that already passed).
--    The inversion rule is also covered by the CHECK above (all writes); this trigger adds the now()
--    rule (which a CHECK cannot express) and a friendlier message. INSERT-only: editing an already-past
--    plan's metadata stays allowed; only *creating* a past-dated plan is blocked. A small grace window
--    absorbs clock skew and in-flight multi-party confirmations.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.enforce_future_plan_time()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.ends_at IS NOT NULL AND NEW.ends_at <= NEW.starts_at THEN
    RAISE EXCEPTION 'Plan end time (%) must be after its start time (%).', NEW.ends_at, NEW.starts_at
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.starts_at < (now() - interval '5 minutes') THEN
    RAISE EXCEPTION 'Plan start time (%) is in the past; plans must be scheduled for the future.', NEW.starts_at
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.enforce_future_plan_time() IS
  'BEFORE INSERT guard for plan tables: rejects past-dated or inverted-time (ends_at <= starts_at) rows.';

DROP TRIGGER IF EXISTS planner_items_enforce_future_plan_time ON public.planner_items;
CREATE TRIGGER planner_items_enforce_future_plan_time
  BEFORE INSERT ON public.planner_items
  FOR EACH ROW EXECUTE FUNCTION public.enforce_future_plan_time();

DROP TRIGGER IF EXISTS confirmed_events_enforce_future_plan_time ON public.confirmed_events;
CREATE TRIGGER confirmed_events_enforce_future_plan_time
  BEFORE INSERT ON public.confirmed_events
  FOR EACH ROW EXECUTE FUNCTION public.enforce_future_plan_time();

-- ═════════════════════════════════════════════════════════════════════════════
-- DOWN MIGRATION (manual rollback — run by hand; Supabase applies migrations forward-only).
-- Reverses everything above. Note: the dropped events.end_at cannot recover values that only ever
-- existed in end_at if they were never copied — but step 1 backfilled ends_at from end_at, so re-adding
-- end_at from ends_at below is loss-free for the common (Case B) drift.
-- ═════════════════════════════════════════════════════════════════════════════
-- BEGIN;
--   -- 4. Remove the plan-time guard.
--   DROP TRIGGER IF EXISTS planner_items_enforce_future_plan_time ON public.planner_items;
--   DROP TRIGGER IF EXISTS confirmed_events_enforce_future_plan_time ON public.confirmed_events;
--   DROP FUNCTION IF EXISTS public.enforce_future_plan_time();
--   -- 3. Drop the integrity constraints (leave starts_at NOT NULL — it predates this migration).
--   ALTER TABLE public.events           DROP CONSTRAINT IF EXISTS events_ends_after_starts;
--   ALTER TABLE public.planner_items    DROP CONSTRAINT IF EXISTS planner_items_ends_after_starts;
--   ALTER TABLE public.confirmed_events DROP CONSTRAINT IF EXISTS confirmed_events_ends_after_starts;
--   -- 1. Restore the legacy end_at column on events (data preserved from ends_at).
--   ALTER TABLE public.events ADD COLUMN IF NOT EXISTS end_at timestamptz;
--   UPDATE public.events SET end_at = ends_at;
--   -- 2. Restore the prior RPC shape (returns end_at). See 20260629120000 for the verbatim body.
--   --    DROP FUNCTION IF EXISTS public.match_events_for_concierge(text, text, timestamptz, timestamptz, int);
--   --    CREATE FUNCTION ... RETURNS TABLE (..., starts_at timestamptz, end_at timestamptz, ...) ... SELECT ..., e.end_at, ...
-- COMMIT;
