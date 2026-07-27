-- ─────────────────────────────────────────────────────────────────────────────
-- Winkly — Wishlist as a place library + reusable, rated plans
-- v1.0 — 26 July 2026
-- ─────────────────────────────────────────────────────────────────────────────
-- Three connected capabilities, one data model: a saved item is a place or plan
-- with a visibility level.
--
--   1. wishlist_items becomes a real place record (was: title + description only,
--      with url/price smuggled into description as an HTML comment by
--      apps/mobile/lib/wishlistStore.ts). Those are promoted to real columns here
--      and the encoded values are backfilled out.
--
--   2. shared_plans stores the reusable skeleton of a plan someone actually ran,
--      so it can be offered to the next person planning something similar.
--
--   3. plan_ratings records 1–5 stars plus an optional comment after the plan
--      has happened.
--
-- Public sharing (attribution by name or social handle) is NOT enabled in the UI
-- yet, but the columns exist so turning it on later needs no data migration:
-- visibility, author_display, author_handle, moderation_status.
-- ─────────────────────────────────────────────────────────────────────────────

-- ═════════════════════════════════════════════════════════════════════════════
-- 1. wishlist_items → place record
-- ═════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.wishlist_items
  -- Promoted out of the encoded description hack.
  ADD COLUMN IF NOT EXISTS url          TEXT,
  ADD COLUMN IF NOT EXISTS price        TEXT,
  -- Place identity. place_id is the Google Places id when the save came from a
  -- venue the app already verified; null for free-text saves.
  ADD COLUMN IF NOT EXISTS place_id     TEXT,
  ADD COLUMN IF NOT EXISTS address      TEXT,
  ADD COLUMN IF NOT EXISTS city         TEXT,
  ADD COLUMN IF NOT EXISTS country      TEXT,
  ADD COLUMN IF NOT EXISTS latitude     DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS longitude    DOUBLE PRECISION,
  -- Where the idea came from: a reel, an article, a venue card in-app.
  ADD COLUMN IF NOT EXISTS source_url   TEXT,
  ADD COLUMN IF NOT EXISTS image_url    TEXT,
  ADD COLUMN IF NOT EXISTS saved_from   TEXT NOT NULL DEFAULT 'manual',
  -- "Making dreams come true": mark a wish as fulfilled instead of deleting it.
  ADD COLUMN IF NOT EXISTS visited_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archived_at  TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.wishlist_items'::regclass
      AND conname  = 'wishlist_items_saved_from_check'
  ) THEN
    ALTER TABLE public.wishlist_items
      ADD CONSTRAINT wishlist_items_saved_from_check
      CHECK (saved_from IN ('manual', 'plan', 'venue_card', 'link', 'share', 'weekly_spark'));
  END IF;
END $$;

COMMENT ON COLUMN public.wishlist_items.saved_from IS
  'Capture origin: manual | plan | venue_card | link | share | weekly_spark. Used to measure which capture paths actually get used.';
COMMENT ON COLUMN public.wishlist_items.visited_at IS
  'Set when the user marks a saved place as visited. Kept (not deleted) so Weekly Spark can avoid re-suggesting it.';

-- ── Backfill: pull url/price out of the encoded description ──────────────────
-- wishlistStore.ts appended:  <description>\n<!--winkly-wishlist-meta:{json}-->
-- Extract the JSON, promote its keys to real columns, and clean the description.
-- Done row-by-row with per-row exception handling: a single malformed payload
-- must not abort the migration. A plain UPDATE with ::jsonb would do exactly
-- that, because there is no try-cast in Postgres and a shape check
-- (looks like {...}) does not guarantee parseable JSON.
DO $backfill$
DECLARE
  r         RECORD;
  v_raw     TEXT;
  v_meta    JSONB;
  v_url     TEXT;
  v_price   TEXT;
  v_desc    TEXT;
  v_done    INT := 0;
  v_skipped INT := 0;
BEGIN
  FOR r IN
    SELECT id, description
    FROM public.wishlist_items
    WHERE description LIKE '%<!--winkly-wishlist-meta:%'
  LOOP
    v_raw := substring(r.description from '<!--winkly-wishlist-meta:(.*?)-->');
    BEGIN
      v_meta := v_raw::jsonb;
    EXCEPTION WHEN others THEN
      v_skipped := v_skipped + 1;
      CONTINUE;  -- leave the row untouched rather than losing data
    END;

    v_url   := NULLIF(trim(COALESCE(v_meta ->> 'url', '')), '');
    v_price := NULLIF(trim(COALESCE(v_meta ->> 'price', '')), '');
    v_desc  := NULLIF(rtrim(regexp_replace(r.description, '\n?<!--winkly-wishlist-meta:.*?-->', '', 'g')), '');

    UPDATE public.wishlist_items
    SET url         = COALESCE(url, v_url),
        price       = COALESCE(price, v_price),
        description = v_desc
    WHERE id = r.id;

    v_done := v_done + 1;
  END LOOP;

  RAISE NOTICE 'wishlist meta backfill: % migrated, % skipped (unparseable)', v_done, v_skipped;
END
$backfill$;

CREATE INDEX IF NOT EXISTS idx_wishlist_items_user_active
  ON public.wishlist_items (user_id, updated_at DESC)
  WHERE archived_at IS NULL AND visited_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_wishlist_items_city
  ON public.wishlist_items (user_id, city)
  WHERE city IS NOT NULL;

-- ═════════════════════════════════════════════════════════════════════════════
-- 2. shared_plans — the reusable skeleton of a plan someone actually ran
-- ═════════════════════════════════════════════════════════════════════════════
-- Deliberately stores a SKELETON, not a copy of someone's day: venue sequence,
-- timing and logic. A plan is intensely contextual (who, when, weather, budget,
-- origin), so a 5-star plan for three friends in August can be wrong for a couple
-- in February. Reuse the shape; regenerate the specifics.

CREATE TABLE IF NOT EXISTS public.shared_plans (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id           UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Provenance (nullable: a plan can be shared without the original still existing).
  source_planner_item_id UUID REFERENCES public.planner_items(id) ON DELETE SET NULL,
  source_pending_plan_id UUID,

  -- Matching keys — how the next user finds this.
  mode                app_mode NOT NULL,
  theme               TEXT,
  city                TEXT,
  country             TEXT,
  num_days            SMALLINT NOT NULL DEFAULT 1 CHECK (num_days BETWEEN 1 AND 30),
  language            TEXT,

  title               TEXT NOT NULL,
  summary             TEXT,
  -- The reusable skeleton: itinerary steps, venue references, durations.
  plan_json           JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Visibility. 'private' = the author's own record. 'community' = offered to
  -- others. The UI only writes 'private' today; public sharing flips this.
  visibility          TEXT NOT NULL DEFAULT 'private'
                        CHECK (visibility IN ('private', 'community')),

  -- How the author is credited when visibility = 'community'.
  author_display      TEXT NOT NULL DEFAULT 'anonymous'
                        CHECK (author_display IN ('anonymous', 'first_name', 'handle')),
  author_handle       TEXT,

  -- Moderation. Required for DSA notice-and-action once community sharing is on:
  -- content must be removable and the removal must be appealable.
  moderation_status   TEXT NOT NULL DEFAULT 'active'
                        CHECK (moderation_status IN ('active', 'hidden', 'removed')),
  moderation_reason   TEXT,
  moderated_at        TIMESTAMPTZ,

  -- Denormalised aggregates, maintained by trigger below.
  rating_avg          NUMERIC(3,2) NOT NULL DEFAULT 0,
  rating_count        INTEGER NOT NULL DEFAULT 0,
  reuse_count         INTEGER NOT NULL DEFAULT 0,

  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.shared_plans IS
  'Reusable skeleton of a plan that was actually carried out. visibility=community makes it eligible to be offered to other users.';
COMMENT ON COLUMN public.shared_plans.plan_json IS
  'Skeleton only — venue sequence, timing, durations. Not a verbatim copy of the author''s day; specifics are regenerated per requester.';
COMMENT ON COLUMN public.shared_plans.reuse_count IS
  'How many times this plan has been offered to and accepted by another user.';

-- Discovery index: "top-rated community plans for this city + mode".
CREATE INDEX IF NOT EXISTS idx_shared_plans_discovery
  ON public.shared_plans (city, mode, rating_avg DESC, rating_count DESC)
  WHERE visibility = 'community' AND moderation_status = 'active';

CREATE INDEX IF NOT EXISTS idx_shared_plans_author
  ON public.shared_plans (author_id, created_at DESC);

-- ═════════════════════════════════════════════════════════════════════════════
-- 3. plan_ratings — 1–5 stars + optional comment, after the plan happened
-- ═════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.plan_ratings (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shared_plan_id   UUID NOT NULL REFERENCES public.shared_plans(id) ON DELETE CASCADE,
  user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  stars            SMALLINT NOT NULL CHECK (stars BETWEEN 1 AND 5),
  comment          TEXT,

  -- Evidence the rater actually ran it, and whether they changed it.
  planner_item_id  UUID REFERENCES public.planner_items(id) ON DELETE SET NULL,
  was_adjusted     BOOLEAN NOT NULL DEFAULT false,

  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- One rating per person per plan; re-rating updates in place.
  UNIQUE (shared_plan_id, user_id)
);

COMMENT ON COLUMN public.plan_ratings.was_adjusted IS
  'True when the rater changed the plan before running it. An adjusted 5-star tells you the skeleton was right but the specifics were not.';

CREATE INDEX IF NOT EXISTS idx_plan_ratings_plan
  ON public.plan_ratings (shared_plan_id, created_at DESC);

-- ═════════════════════════════════════════════════════════════════════════════
-- 4. Keep shared_plans.rating_avg / rating_count accurate
-- ═════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.refresh_shared_plan_rating()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan_id UUID := COALESCE(NEW.shared_plan_id, OLD.shared_plan_id);
BEGIN
  UPDATE public.shared_plans sp
  SET rating_avg = COALESCE(agg.avg_stars, 0),
      rating_count = COALESCE(agg.n, 0),
      updated_at = now()
  FROM (
    SELECT ROUND(AVG(stars)::numeric, 2) AS avg_stars, COUNT(*) AS n
    FROM public.plan_ratings
    WHERE shared_plan_id = v_plan_id
  ) agg
  WHERE sp.id = v_plan_id;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_refresh_shared_plan_rating ON public.plan_ratings;
CREATE TRIGGER trg_refresh_shared_plan_rating
  AFTER INSERT OR UPDATE OF stars OR DELETE ON public.plan_ratings
  FOR EACH ROW EXECUTE FUNCTION public.refresh_shared_plan_rating();

-- updated_at maintenance
CREATE OR REPLACE FUNCTION public.winkly_touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_shared_plans_touch ON public.shared_plans;
CREATE TRIGGER trg_shared_plans_touch
  BEFORE UPDATE ON public.shared_plans
  FOR EACH ROW EXECUTE FUNCTION public.winkly_touch_updated_at();

DROP TRIGGER IF EXISTS trg_plan_ratings_touch ON public.plan_ratings;
CREATE TRIGGER trg_plan_ratings_touch
  BEFORE UPDATE ON public.plan_ratings
  FOR EACH ROW EXECUTE FUNCTION public.winkly_touch_updated_at();

-- ═════════════════════════════════════════════════════════════════════════════
-- 5. Row Level Security
-- ═════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.shared_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plan_ratings ENABLE ROW LEVEL SECURITY;

-- shared_plans: authors control their own rows; everyone may read plans that are
-- explicitly published AND not moderated away.
DROP POLICY IF EXISTS shared_plans_select ON public.shared_plans;
CREATE POLICY shared_plans_select ON public.shared_plans
  FOR SELECT
  USING (
    auth.uid() = author_id
    OR (visibility = 'community' AND moderation_status = 'active')
  );

DROP POLICY IF EXISTS shared_plans_insert_own ON public.shared_plans;
CREATE POLICY shared_plans_insert_own ON public.shared_plans
  FOR INSERT
  WITH CHECK (auth.uid() = author_id);

-- Authors may edit their own plan but must not be able to un-hide something a
-- moderator removed, so moderation_status is pinned in the WITH CHECK.
DROP POLICY IF EXISTS shared_plans_update_own ON public.shared_plans;
CREATE POLICY shared_plans_update_own ON public.shared_plans
  FOR UPDATE
  USING (auth.uid() = author_id AND moderation_status <> 'removed')
  WITH CHECK (auth.uid() = author_id AND moderation_status <> 'removed');

DROP POLICY IF EXISTS shared_plans_delete_own ON public.shared_plans;
CREATE POLICY shared_plans_delete_own ON public.shared_plans
  FOR DELETE
  USING (auth.uid() = author_id);

-- plan_ratings: ratings on visible plans are readable (they are the point);
-- writes are own-row only.
DROP POLICY IF EXISTS plan_ratings_select ON public.plan_ratings;
CREATE POLICY plan_ratings_select ON public.plan_ratings
  FOR SELECT
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM public.shared_plans sp
      WHERE sp.id = plan_ratings.shared_plan_id
        AND sp.visibility = 'community'
        AND sp.moderation_status = 'active'
    )
  );

DROP POLICY IF EXISTS plan_ratings_write_own ON public.plan_ratings;
CREATE POLICY plan_ratings_write_own ON public.plan_ratings
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.shared_plans TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.plan_ratings TO authenticated;

-- ═════════════════════════════════════════════════════════════════════════════
-- 6. Discovery RPC — top-rated community plans for a city + mode
-- ═════════════════════════════════════════════════════════════════════════════
-- SECURITY INVOKER so RLS still applies: a caller can only ever see plans the
-- policies above allow. Used by ai-gateway to mix real plans into AI results.

CREATE OR REPLACE FUNCTION public.top_community_plans(
  p_city     TEXT,
  p_mode     app_mode,
  p_theme    TEXT DEFAULT NULL,
  p_num_days SMALLINT DEFAULT 1,
  p_limit    INT DEFAULT 3
)
RETURNS TABLE (
  id             UUID,
  title          TEXT,
  summary        TEXT,
  plan_json      JSONB,
  theme          TEXT,
  num_days       SMALLINT,
  rating_avg     NUMERIC,
  rating_count   INTEGER,
  reuse_count    INTEGER,
  author_display TEXT,
  author_handle  TEXT
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT sp.id, sp.title, sp.summary, sp.plan_json, sp.theme, sp.num_days,
         sp.rating_avg, sp.rating_count, sp.reuse_count,
         sp.author_display, sp.author_handle
  FROM public.shared_plans sp
  WHERE sp.visibility = 'community'
    AND sp.moderation_status = 'active'
    AND (p_city IS NULL OR sp.city ILIKE p_city)
    AND sp.mode = p_mode
    AND (p_theme IS NULL OR sp.theme ILIKE '%' || p_theme || '%')
    AND sp.num_days = COALESCE(p_num_days, 1)
    -- Require at least one rating: an unrated plan is an untested plan.
    AND sp.rating_count > 0
  ORDER BY sp.rating_avg DESC, sp.rating_count DESC, sp.reuse_count DESC
  LIMIT GREATEST(1, LEAST(10, COALESCE(p_limit, 3)));
$$;

GRANT EXECUTE ON FUNCTION public.top_community_plans(TEXT, app_mode, TEXT, SMALLINT, INT) TO authenticated;

-- ═════════════════════════════════════════════════════════════════════════════
-- 7. Reuse counter
-- ═════════════════════════════════════════════════════════════════════════════
-- SECURITY DEFINER because the counter lives on someone else's row: a user
-- accepting a plan must be able to increment it without being granted UPDATE on
-- other authors' plans. Scoped tightly — it can only ever bump this one integer,
-- and only on a plan that is actually published.

CREATE OR REPLACE FUNCTION public.increment_shared_plan_reuse(p_plan_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  UPDATE public.shared_plans
  SET reuse_count = reuse_count + 1
  WHERE id = p_plan_id
    AND visibility = 'community'
    AND moderation_status = 'active';
END;
$$;

GRANT EXECUTE ON FUNCTION public.increment_shared_plan_reuse(UUID) TO authenticated;
