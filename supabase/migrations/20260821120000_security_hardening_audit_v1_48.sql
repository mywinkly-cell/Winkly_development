-- ─────────────────────────────────────────────────────────────────────────────
-- Security hardening — August 2026 audit
--
-- Closes five findings that all share one root cause: RLS policies that check
-- *which row* a caller may touch, but never *which columns* or *what value*.
--
--   SEC-1  users_update_own let any account rewrite its own subscription_tier,
--          premium_until, status and invite_sending_suspended_until. The AI
--          gateway reads tier from this table (ai-gateway/index.ts), so the
--          whole server-side tier gate was bypassable with one PostgREST PATCH,
--          a banned account could restore itself, and an invite-spammer could
--          clear their own suspension (checked in business_connections_v1:174).
--
--   SEC-2  user_locations_select_romance_discover (20260710140000) exposed the
--          stored coordinates of every romance-mode user to every authenticated
--          user, contradicting the guarantee documented on the table itself in
--          20260610120000_postgis_geo_discovery.sql:49.
--
--   SEC-3  companies / business_services were writable by any authenticated
--          user (20260601120000 narrowed them from anon, but added no owner
--          predicate). Neither table has an ownership column, and nothing in
--          the app writes to them — so they become read-only here.
--
--   SEC-5  match_events_for_concierge was the only function in the schema
--          granted to anon.
--
--   SAFE-1 The 18+ gate was a date-picker bound in onboarding and nothing else:
--          no server-side check and no constraint, on a table the owner can
--          PATCH directly.
--
-- Idempotent and safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────

-- ══════════════════════════════════════════════════════════════════════════
-- SEC-1 · public.users — owner may update account_type and nothing else
-- ══════════════════════════════════════════════════════════════════════════

-- Row scope: unchanged, but UPDATE now also carries WITH CHECK so a row cannot
-- be re-pointed at another user on the way out.
DROP POLICY IF EXISTS users_update_own ON public.users;
CREATE POLICY users_update_own ON public.users
  FOR UPDATE TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Column scope: a table-level grant beats any column-level grant, so the broad
-- one has to go first. account_type is the only column the app ever writes
-- (apps/mobile/lib/account/accountTypeSwitch.ts:47).
REVOKE UPDATE ON public.users FROM authenticated, anon;
GRANT  UPDATE (account_type) ON public.users TO authenticated;
GRANT  UPDATE ON public.users TO service_role;

-- Defence in depth. Column grants are the real control, but they are also the
-- kind of thing a later "GRANT ALL ON ALL TABLES" maintenance script silently
-- undoes. This trigger fails loudly if that ever happens.
CREATE OR REPLACE FUNCTION public.users_guard_privileged_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  -- PostgREST switches role per request, so current_user is the API role.
  IF current_user IN ('service_role', 'postgres', 'supabase_admin') THEN
    RETURN NEW;
  END IF;

  IF NEW.subscription_tier              IS DISTINCT FROM OLD.subscription_tier
  OR NEW.is_premium                     IS DISTINCT FROM OLD.is_premium
  OR NEW.premium_until                  IS DISTINCT FROM OLD.premium_until
  OR NEW.trial_started_at               IS DISTINCT FROM OLD.trial_started_at
  OR NEW.trial_ends_at                  IS DISTINCT FROM OLD.trial_ends_at
  OR NEW.status                         IS DISTINCT FROM OLD.status
  OR NEW.invite_sending_suspended_until IS DISTINCT FROM OLD.invite_sending_suspended_until
  THEN
    RAISE EXCEPTION
      'users: billing and moderation columns are service-role only'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS users_guard_privileged_columns_trg ON public.users;
CREATE TRIGGER users_guard_privileged_columns_trg
  BEFORE UPDATE ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.users_guard_privileged_columns();

COMMENT ON FUNCTION public.users_guard_privileged_columns() IS
  'Rejects client-role writes to billing and moderation columns on public.users. Backstop for the column-level grants; see the August 2026 audit (SEC-1).';


-- ══════════════════════════════════════════════════════════════════════════
-- SEC-2 · user_locations — coordinates go back to owner-only
-- ══════════════════════════════════════════════════════════════════════════

-- The discover feed needs to *measure* distance between two users. It never
-- needs to hand a caller someone else's point. Reading the rows through a
-- DEFINER function in `private` gives it the former without the latter, which
-- is the pattern already established in
-- 20260710150000_security_definer_invoker_wrappers.sql.
DROP POLICY IF EXISTS user_locations_select_romance_discover ON public.user_locations;

CREATE SCHEMA IF NOT EXISTS private;
GRANT USAGE ON SCHEMA private TO authenticated, service_role;

CREATE OR REPLACE FUNCTION private.romance_discover_feed_geo(
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
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_self_geog extensions.geography;
BEGIN
  -- Unchanged from the INVOKER version: the caller may only ask about itself.
  -- This check is what makes DEFINER safe here.
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

-- `authenticated` keeps EXECUTE here on purpose: the public wrapper is INVOKER,
-- so it calls this as the end user and would fail without it. What protects the
-- inner function is that `private` is not in PostgREST's exposed schemas, so it
-- is unreachable over the API — plus the auth.uid() check in its own body. This
-- matches how 20260710150000_security_definer_invoker_wrappers.sql moves
-- functions into `private` (ALTER FUNCTION ... SET SCHEMA carries grants along).
REVOKE ALL ON FUNCTION private.romance_discover_feed_geo(uuid, integer, integer, integer, text[], integer)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.romance_discover_feed_geo(uuid, integer, integer, integer, text[], integer)
  TO authenticated, service_role;

-- Public wrapper keeps the exact signature the app already calls.
DROP FUNCTION IF EXISTS public.romance_discover_feed_geo(uuid, integer, integer, integer, text[], integer);

CREATE FUNCTION public.romance_discover_feed_geo(
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
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, private
AS $$
  SELECT * FROM private.romance_discover_feed_geo(
    current_user_id, p_max_distance_km, p_age_min, p_age_max, p_genders, p_limit
  );
$$;

REVOKE ALL ON FUNCTION public.romance_discover_feed_geo(uuid, integer, integer, integer, text[], integer)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.romance_discover_feed_geo(uuid, integer, integer, integer, text[], integer)
  TO authenticated, service_role;

COMMENT ON TABLE public.user_locations IS
  'Coarse per-user location for discovery distance filtering. Owner-only under RLS: other users never read coordinates, only a rounded distance label computed inside private.romance_discover_feed_geo.';


-- ══════════════════════════════════════════════════════════════════════════
-- SEC-3 · companies / business_services — read-only for clients
-- ══════════════════════════════════════════════════════════════════════════
-- Neither table has an owner column, so there is nothing to scope a write
-- policy to. The app only reads them (business/discover.tsx, business/companies).
-- Catalogue content is seeded server-side until Business mode models ownership.

DROP POLICY IF EXISTS companies_insert ON public.companies;
DROP POLICY IF EXISTS companies_update ON public.companies;
DROP POLICY IF EXISTS companies_delete ON public.companies;
REVOKE INSERT, UPDATE, DELETE ON public.companies FROM authenticated, anon;

DROP POLICY IF EXISTS business_services_insert ON public.business_services;
DROP POLICY IF EXISTS business_services_update ON public.business_services;
DROP POLICY IF EXISTS business_services_delete ON public.business_services;
REVOKE INSERT, UPDATE, DELETE ON public.business_services FROM authenticated, anon;

COMMENT ON TABLE public.companies IS
  'Business catalogue. Client-readable, service-role writable. When Business mode adds ownership, add owner_id and owner-scoped write policies.';
COMMENT ON TABLE public.business_services IS
  'Business service catalogue. Client-readable, service-role writable. See public.companies.';


-- ══════════════════════════════════════════════════════════════════════════
-- SEC-5 · match_events_for_concierge — drop the anon grant
-- ══════════════════════════════════════════════════════════════════════════
-- Every other function in the schema stops at `authenticated`. The anon key
-- ships inside the app bundle, so an anon grant is an unauthenticated compute
-- endpoint with a trigram search behind it.

-- Postgres grants EXECUTE on new functions to PUBLIC by default, and every role
-- inherits that. Revoking from `anon` alone leaves the PUBLIC grant in place and
-- changes nothing — the revoke has to name PUBLIC too.
REVOKE EXECUTE ON FUNCTION public.match_events_for_concierge(text, text, timestamptz, timestamptz, int)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.match_events_for_concierge(text, text, timestamptz, timestamptz, int)
  TO authenticated, service_role;


-- ══════════════════════════════════════════════════════════════════════════
-- SAFE-1 · 18+ enforced in the database
-- ══════════════════════════════════════════════════════════════════════════
-- A maximumDate on a date picker is a UI hint. These rows are PATCHable by
-- their owner, so the age floor has to live here.

DO $$
BEGIN
  ALTER TABLE public.user_profiles
    ADD CONSTRAINT user_profiles_min_age_chk
    CHECK (birthday IS NULL OR birthday <= (CURRENT_DATE - INTERVAL '18 years'))
    NOT VALID;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.profiles_core
    ADD CONSTRAINT profiles_core_min_age_chk
    CHECK (birthday IS NULL OR birthday <= (CURRENT_DATE - INTERVAL '18 years'))
    NOT VALID;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

-- NOT VALID: enforced for every INSERT and UPDATE from now on, but existing
-- rows are not scanned. Run the audit query in
-- supabase/scripts/underage-audit.sql before VALIDATE CONSTRAINT, so an
-- under-18 account already in the table surfaces as a moderation decision
-- rather than a failed migration.

COMMENT ON CONSTRAINT user_profiles_min_age_chk ON public.user_profiles IS
  'Winkly is 18+. Server-side floor; the onboarding date picker is a UI hint only (August 2026 audit, SAFE-1).';


-- ══════════════════════════════════════════════════════════════════════════
-- Bonus · blocked users can no longer read your profile row
-- ══════════════════════════════════════════════════════════════════════════
-- user_profiles_select_authenticated was USING (true), so blocking someone
-- removed them from your feeds but still let them read the row directly.
-- Column-level minimisation is a larger change and is tracked separately.

DROP POLICY IF EXISTS user_profiles_select_authenticated ON public.user_profiles;
CREATE POLICY user_profiles_select_authenticated ON public.user_profiles
  FOR SELECT TO authenticated
  USING (
    id = auth.uid()
    OR NOT EXISTS (
      SELECT 1 FROM public.user_blocks ub
      WHERE (ub.blocker_id = auth.uid() AND ub.blocked_id = user_profiles.id)
         OR (ub.blocker_id = user_profiles.id AND ub.blocked_id = auth.uid())
    )
  );

CREATE INDEX IF NOT EXISTS user_blocks_blocker_blocked_idx
  ON public.user_blocks (blocker_id, blocked_id);
CREATE INDEX IF NOT EXISTS user_blocks_blocked_blocker_idx
  ON public.user_blocks (blocked_id, blocker_id);
