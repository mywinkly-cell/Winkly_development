-- Shareable plan links with web RSVP ("every plan becomes an invitation").
--
-- 1. plan_shares — one link token per shared planner item. Owner-only RLS. Tokens expire after
--    7 days by default (hard max 30) and can be revoked; max_uses caps how many people can join.
-- 2. plan_share_rsvps — "I'm in" answers from the web page (first name + email). The host reads
--    first name + status (never the email — column grants); written only by the RPCs below.
-- 3. private.plan_share_rsvp_attempts — rate-limit ledger (hashed IP + share), not exposed.
-- 4. RPCs
--    • get_shared_plan(token)            anon + authenticated, SECURITY DEFINER. The ONLY public
--                                         read path: title, when, neighbourhood (never the exact
--                                         address), host first name + main photo, fit line.
--    • web_rsvp(token, name, email)      anon + authenticated, SECURITY DEFINER, rate-limited per
--                                         IP and per token; fails closed.
--    • create_plan_share(item_id, tz)    authenticated, SECURITY INVOKER (RLS applies). Reuses the
--                                         active link for the item if there is one.
--    • revoke_plan_share(share_id)       authenticated, SECURITY INVOKER.
--    • accept_plan_share(token)          authenticated, SECURITY DEFINER. Opening the link in the
--                                         app makes the caller a normal participant.
--    • claim_plan_share_rsvps()          authenticated, SECURITY DEFINER. On sign-in, converts
--                                         pending web RSVPs for the caller's *confirmed* email —
--                                         only RSVPs given before the account existed ("signed up
--                                         from the link"), so nobody can push a plan into an
--                                         existing user's planner by typing their email.
--
-- Tests: supabase/tests/plan_shares_test.sql
--
-- DOWN (manual):
--   DROP FUNCTION IF EXISTS public.get_shared_plan(text), public.web_rsvp(text, text, text),
--     public.create_plan_share(uuid, text), public.revoke_plan_share(uuid),
--     public.accept_plan_share(text), public.claim_plan_share_rsvps();
--   DROP TABLE IF EXISTS private.plan_share_rsvp_attempts, public.plan_share_rsvps, public.plan_shares;

CREATE SCHEMA IF NOT EXISTS private;

-- ── plan_shares ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.plan_shares (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Set by the plan_shares_set_token trigger; clients can't choose it.
  token           TEXT NOT NULL UNIQUE CHECK (token ~ '^[A-Za-z0-9_-]{20,64}$'),
  planner_item_id UUID NOT NULL REFERENCES public.planner_items(id) ON DELETE CASCADE,
  created_by      UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at      TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '7 days'),
  max_uses        INT CHECK (max_uses IS NULL OR max_uses BETWEEN 1 AND 100),
  use_count       INT NOT NULL DEFAULT 0 CHECK (use_count >= 0),
  revoked_at      TIMESTAMPTZ,
  -- The host's IANA time zone when sharing, so the web page and link preview show the plan's
  -- local time (crawlers have no time zone of their own).
  time_zone       TEXT CHECK (time_zone IS NULL OR time_zone ~ '^[A-Za-z0-9_+/-]{1,64}$'),
  CONSTRAINT plan_shares_expiry_window
    CHECK (expires_at > created_at AND expires_at <= created_at + INTERVAL '30 days')
);

CREATE INDEX IF NOT EXISTS plan_shares_item_idx ON public.plan_shares (planner_item_id);
CREATE INDEX IF NOT EXISTS plan_shares_created_by_idx ON public.plan_shares (created_by);

ALTER TABLE public.plan_shares ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS plan_shares_select_own ON public.plan_shares;
CREATE POLICY plan_shares_select_own ON public.plan_shares
  FOR SELECT TO authenticated USING (created_by = auth.uid());

DROP POLICY IF EXISTS plan_shares_insert_own ON public.plan_shares;
CREATE POLICY plan_shares_insert_own ON public.plan_shares
  FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid() AND public.is_planner_item_creator(planner_item_id, auth.uid()));

DROP POLICY IF EXISTS plan_shares_update_own ON public.plan_shares;
CREATE POLICY plan_shares_update_own ON public.plan_shares
  FOR UPDATE TO authenticated USING (created_by = auth.uid()) WITH CHECK (created_by = auth.uid());

DROP POLICY IF EXISTS plan_shares_delete_own ON public.plan_shares;
CREATE POLICY plan_shares_delete_own ON public.plan_shares
  FOR DELETE TO authenticated USING (created_by = auth.uid());

-- Column grants: clients choose the item / expiry / cap and may revoke; token, use_count and
-- ownership are server-controlled.
REVOKE ALL ON public.plan_shares FROM PUBLIC, anon, authenticated;
GRANT SELECT, DELETE ON public.plan_shares TO authenticated;
GRANT INSERT (planner_item_id, expires_at, max_uses, time_zone) ON public.plan_shares TO authenticated;
GRANT UPDATE (revoked_at) ON public.plan_shares TO authenticated;
GRANT ALL ON public.plan_shares TO service_role;

-- Token: 18 random bytes → 24 URL-safe chars (144 bits). Unguessable, never derived from ids.
-- SECURITY DEFINER so signed-in clients need no access to the private schema or pgcrypto.
CREATE OR REPLACE FUNCTION private.plan_shares_set_token()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  NEW.token := translate(encode(extensions.gen_random_bytes(18), 'base64'), '+/', '-_');
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.plan_shares_set_token() FROM PUBLIC;

DROP TRIGGER IF EXISTS plan_shares_set_token ON public.plan_shares;
CREATE TRIGGER plan_shares_set_token
  BEFORE INSERT ON public.plan_shares
  FOR EACH ROW EXECUTE FUNCTION private.plan_shares_set_token();

-- A revoked link stays revoked.
CREATE OR REPLACE FUNCTION private.plan_shares_guard_revoke()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF OLD.revoked_at IS NOT NULL AND NEW.revoked_at IS DISTINCT FROM OLD.revoked_at THEN
    RAISE EXCEPTION 'plan_share_revoked: a revoked link cannot be re-enabled'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.plan_shares_guard_revoke() FROM PUBLIC;

DROP TRIGGER IF EXISTS plan_shares_guard_revoke ON public.plan_shares;
CREATE TRIGGER plan_shares_guard_revoke
  BEFORE UPDATE ON public.plan_shares
  FOR EACH ROW EXECUTE FUNCTION private.plan_shares_guard_revoke();

COMMENT ON TABLE public.plan_shares IS
  'Shareable plan links (mywinkly.de/p/<token>). Owner-only RLS; public read only via get_shared_plan().';

-- ── plan_share_rsvps ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.plan_share_rsvps (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  share_id          UUID REFERENCES public.plan_shares(id) ON DELETE SET NULL,
  planner_item_id   UUID NOT NULL REFERENCES public.planner_items(id) ON DELETE CASCADE,
  first_name        TEXT NOT NULL CHECK (char_length(first_name) BETWEEN 1 AND 50),
  -- Stored lower-cased. Never readable by clients (no column grant) — only used to convert.
  email             TEXT NOT NULL CHECK (char_length(email) BETWEEN 3 AND 254 AND email = lower(email)),
  status            TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'converted')),
  converted_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  converted_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (planner_item_id, email)
);

CREATE INDEX IF NOT EXISTS plan_share_rsvps_email_pending_idx
  ON public.plan_share_rsvps (email) WHERE status = 'pending';

ALTER TABLE public.plan_share_rsvps ENABLE ROW LEVEL SECURITY;

-- The host (planner item creator) sees who said "I'm in" on their plan.
DROP POLICY IF EXISTS plan_share_rsvps_select_host ON public.plan_share_rsvps;
CREATE POLICY plan_share_rsvps_select_host ON public.plan_share_rsvps
  FOR SELECT TO authenticated
  USING (public.is_planner_item_creator(planner_item_id, auth.uid()));

DROP POLICY IF EXISTS plan_share_rsvps_delete_host ON public.plan_share_rsvps;
CREATE POLICY plan_share_rsvps_delete_host ON public.plan_share_rsvps
  FOR DELETE TO authenticated
  USING (public.is_planner_item_creator(planner_item_id, auth.uid()));

REVOKE ALL ON public.plan_share_rsvps FROM PUBLIC, anon, authenticated;
GRANT SELECT (id, share_id, planner_item_id, first_name, status, converted_user_id, converted_at, created_at)
  ON public.plan_share_rsvps TO authenticated;
GRANT DELETE ON public.plan_share_rsvps TO authenticated;
GRANT ALL ON public.plan_share_rsvps TO service_role;

COMMENT ON TABLE public.plan_share_rsvps IS
  'Web "I''m in" answers for shared plans. Host reads first name/status; email is never client-readable.';

-- ── Rate-limit ledger ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS private.plan_share_rsvp_attempts (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  share_id   UUID,
  ip_hash    TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS plan_share_rsvp_attempts_ip_idx
  ON private.plan_share_rsvp_attempts (ip_hash, created_at);
CREATE INDEX IF NOT EXISTS plan_share_rsvp_attempts_share_idx
  ON private.plan_share_rsvp_attempts (share_id, created_at);
CREATE INDEX IF NOT EXISTS plan_share_rsvp_attempts_created_idx
  ON private.plan_share_rsvp_attempts (created_at);

ALTER TABLE private.plan_share_rsvp_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.plan_share_rsvp_attempts FROM PUBLIC, anon, authenticated;

-- ── Helpers ──────────────────────────────────────────────────────────────────

-- Link state for a share row: 'ok' | 'revoked' | 'expired' | 'full' | 'unavailable'.
CREATE OR REPLACE FUNCTION private.plan_share_state(
  p_revoked_at TIMESTAMPTZ,
  p_expires_at TIMESTAMPTZ,
  p_max_uses   INT,
  p_use_count  INT,
  p_starts_at  TIMESTAMPTZ,
  p_meta       JSONB
) RETURNS TEXT
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT CASE
    WHEN p_revoked_at IS NOT NULL THEN 'revoked'
    WHEN p_expires_at <= now() THEN 'expired'
    -- A plan that already happened can't be joined.
    WHEN p_starts_at < now() - INTERVAL '3 hours' THEN 'expired'
    WHEN p_meta ? 'cancelled_at' AND COALESCE(p_meta->>'cancelled_at', '') <> '' THEN 'unavailable'
    WHEN p_max_uses IS NOT NULL AND p_use_count >= p_max_uses THEN 'full'
    ELSE 'ok'
  END;
$$;

-- "City, Country" / neighbourhood from plan meta — drops street names, house numbers and
-- postcodes so the public page never shows an exact address.
CREATE OR REPLACE FUNCTION private.plan_share_area(p_meta JSONB)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  v_raw   TEXT;
  v_parts TEXT[] := '{}';
  v_part  TEXT;
  v_out   TEXT;
BEGIN
  IF p_meta IS NULL THEN RETURN NULL; END IF;
  -- An explicit neighbourhood/area wins (it is never a street address).
  v_raw := NULLIF(btrim(COALESCE(p_meta->>'neighbourhood', p_meta->>'area', p_meta->'venue'->>'area', '')), '');
  IF v_raw IS NOT NULL AND v_raw !~ '[0-9]' THEN
    RETURN left(v_raw, 80);
  END IF;
  v_raw := NULLIF(btrim(COALESCE(p_meta->>'location', p_meta->'venue'->>'address', '')), '');
  IF v_raw IS NULL THEN RETURN NULL; END IF;
  FOREACH v_part IN ARRAY string_to_array(v_raw, ',') LOOP
    v_part := btrim(regexp_replace(btrim(v_part), '^[A-Z]{0,2}-?[0-9]{4,6}\s+', ''));
    CONTINUE WHEN v_part = '' OR v_part ~ '[0-9]';
    v_parts := v_parts || v_part;
  END LOOP;
  IF cardinality(v_parts) = 0 THEN RETURN NULL; END IF;
  -- Single segment: a street-ish word on its own ("…straße", "…str") is not an area.
  IF cardinality(v_parts) = 1 AND v_parts[1] ~* '(stra(ss|ß)e|str\.|street|st\.|road|avenue|weg|gasse|allee)$' THEN
    RETURN NULL;
  END IF;
  v_out := array_to_string(v_parts[greatest(1, cardinality(v_parts) - 1):cardinality(v_parts)], ', ');
  RETURN left(v_out, 80);
END;
$$;

-- Hashed client IP for the rate limiter. Falls back to one shared bucket when the header is
-- missing, so a request without an IP is limited harder, never less (fail closed).
CREATE OR REPLACE FUNCTION private.plan_share_client_ip_hash()
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
DECLARE
  v_headers JSON;
  v_ip      TEXT;
BEGIN
  BEGIN
    v_headers := NULLIF(current_setting('request.headers', true), '')::json;
  EXCEPTION WHEN others THEN
    v_headers := NULL;
  END;
  v_ip := NULLIF(btrim(COALESCE(
    v_headers->>'cf-connecting-ip',
    split_part(COALESCE(v_headers->>'x-forwarded-for', ''), ',', 1),
    v_headers->>'x-real-ip',
    ''
  )), '');
  RETURN encode(extensions.digest('winkly-plan-share:' || COALESCE(v_ip, 'unknown'), 'sha256'), 'hex');
END;
$$;

REVOKE ALL ON FUNCTION private.plan_share_state(TIMESTAMPTZ, TIMESTAMPTZ, INT, INT, TIMESTAMPTZ, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.plan_share_area(JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.plan_share_client_ip_hash() FROM PUBLIC;

-- ── get_shared_plan(token) — the only public read path ───────────────────────
CREATE OR REPLACE FUNCTION public.get_shared_plan(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_share  public.plan_shares%ROWTYPE;
  v_item   public.planner_items%ROWTYPE;
  v_state  TEXT;
  v_first  TEXT;
  v_photo  TEXT;
  v_fit    TEXT;
BEGIN
  IF p_token IS NULL OR p_token !~ '^[A-Za-z0-9_-]{20,64}$' THEN
    RETURN jsonb_build_object('status', 'not_found');
  END IF;

  SELECT * INTO v_share FROM public.plan_shares WHERE token = p_token;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'not_found');
  END IF;

  SELECT * INTO v_item FROM public.planner_items WHERE id = v_share.planner_item_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'not_found');
  END IF;

  v_state := private.plan_share_state(
    v_share.revoked_at, v_share.expires_at, v_share.max_uses, v_share.use_count,
    v_item.starts_at, v_item.meta);
  -- Dead links reveal nothing about the plan.
  IF v_state IN ('revoked', 'expired', 'unavailable') THEN
    RETURN jsonb_build_object('status', v_state);
  END IF;

  -- Host: first name (first word only) + main photo. Never last name, age or birthday.
  SELECT NULLIF(split_part(btrim(up.first_name), ' ', 1), ''),
         COALESCE(NULLIF(up.main_photo_url, ''), up.core_photos[1])
    INTO v_first, v_photo
    FROM public.user_profiles up WHERE up.id = v_item.created_by;
  IF v_first IS NULL THEN
    SELECT NULLIF(split_part(btrim(pc.first_name), ' ', 1), ''), COALESCE(v_photo, pc.core_photos[1])
      INTO v_first, v_photo
      FROM public.profiles_core pc WHERE pc.id = v_item.created_by;
  END IF;

  -- Fit line: only AI-written "why it fits" text, never free-form host notes.
  v_fit := NULLIF(btrim(COALESCE(
    v_item.meta->>'fit_line',
    v_item.meta->>'fit_reason',
    CASE WHEN (v_item.meta->>'from_concierge') = 'true' THEN v_item.description END,
    '')), '');
  IF v_fit IS NOT NULL AND char_length(v_fit) > 160 THEN
    v_fit := left(v_fit, 159) || '…';
  END IF;

  RETURN jsonb_build_object(
    'status', v_state,
    'plan', jsonb_build_object(
      'title', left(v_item.title, 120),
      'starts_at', v_item.starts_at,
      'time_zone', v_share.time_zone,
      'ends_at', v_item.ends_at,
      'source_mode', v_item.source_mode,
      'neighbourhood', private.plan_share_area(v_item.meta),
      'fit_line', v_fit,
      'host', jsonb_build_object('first_name', v_first, 'photo_url', v_photo)
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_shared_plan(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_shared_plan(TEXT) TO anon, authenticated, service_role;

-- ── web_rsvp(token, name, email) — "I'm in" from the browser ─────────────────
-- Limits: per IP 5 per 10 min and 20 per day; per link 30 per hour. Every call is recorded
-- (including bad tokens), so token guessing is throttled too.
CREATE OR REPLACE FUNCTION public.web_rsvp(p_token TEXT, p_first_name TEXT, p_email TEXT)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_ip_hash  TEXT := private.plan_share_client_ip_hash();
  v_share    public.plan_shares%ROWTYPE;
  v_item     public.planner_items%ROWTYPE;
  v_state    TEXT;
  v_name     TEXT;
  v_email    TEXT;
  v_inserted BOOLEAN;
BEGIN
  -- Per-IP limits first (cheap, before touching the share).
  IF (SELECT count(*) FROM private.plan_share_rsvp_attempts
        WHERE ip_hash = v_ip_hash AND created_at > now() - INTERVAL '10 minutes') >= 5
     OR (SELECT count(*) FROM private.plan_share_rsvp_attempts
        WHERE ip_hash = v_ip_hash AND created_at > now() - INTERVAL '1 day') >= 20 THEN
    RETURN jsonb_build_object('status', 'rate_limited');
  END IF;

  IF p_token IS NOT NULL AND p_token ~ '^[A-Za-z0-9_-]{20,64}$' THEN
    SELECT * INTO v_share FROM public.plan_shares WHERE token = p_token FOR UPDATE;
  END IF;

  INSERT INTO private.plan_share_rsvp_attempts (share_id, ip_hash) VALUES (v_share.id, v_ip_hash);
  -- Hashed IPs are kept at most a day (privacy policy §7): every call prunes older rows.
  DELETE FROM private.plan_share_rsvp_attempts WHERE created_at < now() - INTERVAL '1 day';

  IF v_share.id IS NULL THEN
    RETURN jsonb_build_object('status', 'not_found');
  END IF;

  IF (SELECT count(*) FROM private.plan_share_rsvp_attempts
        WHERE share_id = v_share.id AND created_at > now() - INTERVAL '1 hour') > 30 THEN
    RETURN jsonb_build_object('status', 'rate_limited');
  END IF;

  SELECT * INTO v_item FROM public.planner_items WHERE id = v_share.planner_item_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'not_found');
  END IF;

  v_state := private.plan_share_state(
    v_share.revoked_at, v_share.expires_at, v_share.max_uses, v_share.use_count,
    v_item.starts_at, v_item.meta);
  IF v_state <> 'ok' THEN
    RETURN jsonb_build_object('status', v_state);
  END IF;

  -- Input: strip control characters and markup-ish brackets; first name only.
  v_name := btrim(regexp_replace(COALESCE(p_first_name, ''), '[[:cntrl:]<>"]', '', 'g'));
  v_email := lower(btrim(COALESCE(p_email, '')));
  IF char_length(v_name) NOT BETWEEN 1 AND 50
     OR char_length(v_email) NOT BETWEEN 3 AND 254
     OR v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' THEN
    RETURN jsonb_build_object('status', 'invalid_input');
  END IF;

  INSERT INTO public.plan_share_rsvps (share_id, planner_item_id, first_name, email)
  VALUES (v_share.id, v_share.planner_item_id, v_name, v_email)
  ON CONFLICT (planner_item_id, email) DO UPDATE
    SET first_name = EXCLUDED.first_name, updated_at = now()
  RETURNING (xmax = 0) INTO v_inserted;

  IF v_inserted THEN
    UPDATE public.plan_shares SET use_count = use_count + 1 WHERE id = v_share.id;
  END IF;

  RETURN jsonb_build_object('status', 'ok');
END;
$$;

REVOKE ALL ON FUNCTION public.web_rsvp(TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.web_rsvp(TEXT, TEXT, TEXT) TO anon, authenticated, service_role;

-- ── create_plan_share(item) — host creates (or reuses) a link ────────────────
CREATE OR REPLACE FUNCTION public.create_plan_share(p_planner_item_id UUID, p_time_zone TEXT DEFAULT NULL)
RETURNS public.plan_shares
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_row public.plan_shares%ROWTYPE;
BEGIN
  SELECT * INTO v_row FROM public.plan_shares
   WHERE planner_item_id = p_planner_item_id
     AND created_by = auth.uid()
     AND revoked_at IS NULL
     AND expires_at > now() + INTERVAL '1 day'
     AND (max_uses IS NULL OR use_count < max_uses)
   ORDER BY created_at DESC
   LIMIT 1;
  IF FOUND THEN
    RETURN v_row;
  END IF;

  IF p_time_zone IS NOT NULL AND p_time_zone !~ '^[A-Za-z0-9_+/-]{1,64}$' THEN
    p_time_zone := NULL;
  END IF;

  -- RLS (plan_shares_insert_own) rejects items the caller didn't create.
  INSERT INTO public.plan_shares (planner_item_id, time_zone) VALUES (p_planner_item_id, p_time_zone)
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.create_plan_share(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_plan_share(UUID, TEXT) TO authenticated, service_role;

-- ── revoke_plan_share(share) ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.revoke_plan_share(p_share_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
VOLATILE
SECURITY INVOKER
SET search_path = ''
AS $$
  WITH upd AS (
    UPDATE public.plan_shares SET revoked_at = now()
     WHERE id = p_share_id AND created_by = auth.uid() AND revoked_at IS NULL
    RETURNING 1
  )
  SELECT EXISTS (SELECT 1 FROM upd);
$$;

REVOKE ALL ON FUNCTION public.revoke_plan_share(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.revoke_plan_share(UUID) TO authenticated, service_role;

-- ── accept_plan_share(token) — invitee opened the link in the app ────────────
CREATE OR REPLACE FUNCTION public.accept_plan_share(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid       UUID := auth.uid();
  v_share     public.plan_shares%ROWTYPE;
  v_item      public.planner_items%ROWTYPE;
  v_state     TEXT;
  v_email     TEXT;
  v_rsvp_id   UUID;
  v_converted BOOLEAN := false;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('status', 'unauthenticated');
  END IF;
  IF p_token IS NULL OR p_token !~ '^[A-Za-z0-9_-]{20,64}$' THEN
    RETURN jsonb_build_object('status', 'not_found');
  END IF;

  SELECT * INTO v_share FROM public.plan_shares WHERE token = p_token FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'not_found');
  END IF;
  SELECT * INTO v_item FROM public.planner_items WHERE id = v_share.planner_item_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'not_found');
  END IF;

  IF v_item.created_by = v_uid THEN
    RETURN jsonb_build_object('status', 'own_plan', 'planner_item_id', v_item.id);
  END IF;

  IF EXISTS (SELECT 1 FROM public.planner_participants
              WHERE planner_item_id = v_item.id AND user_id = v_uid) THEN
    RETURN jsonb_build_object('status', 'ok', 'planner_item_id', v_item.id, 'already_joined', true);
  END IF;

  -- Either side blocked the other → behave like a dead link.
  IF EXISTS (SELECT 1 FROM public.user_blocks
              WHERE (blocker_id = v_item.created_by AND blocked_id = v_uid)
                 OR (blocker_id = v_uid AND blocked_id = v_item.created_by)) THEN
    RETURN jsonb_build_object('status', 'unavailable');
  END IF;

  -- A web RSVP from this user's confirmed email already holds a seat (and counted a use).
  SELECT lower(u.email) INTO v_email FROM auth.users u
   WHERE u.id = v_uid AND u.email_confirmed_at IS NOT NULL;
  IF v_email IS NOT NULL THEN
    SELECT r.id INTO v_rsvp_id FROM public.plan_share_rsvps r
     WHERE r.planner_item_id = v_item.id AND r.email = v_email AND r.status = 'pending';
  END IF;

  v_state := private.plan_share_state(
    v_share.revoked_at, v_share.expires_at, v_share.max_uses,
    -- Their seat is already counted, so a "full" link still lets them in.
    CASE WHEN v_rsvp_id IS NOT NULL THEN 0 ELSE v_share.use_count END,
    v_item.starts_at, v_item.meta);
  IF v_state <> 'ok' THEN
    RETURN jsonb_build_object('status', v_state);
  END IF;

  INSERT INTO public.planner_participants (planner_item_id, user_id, role)
  VALUES (v_item.id, v_uid, 'attendee')
  ON CONFLICT (planner_item_id, user_id) DO NOTHING;

  IF v_rsvp_id IS NOT NULL THEN
    UPDATE public.plan_share_rsvps
       SET status = 'converted', converted_user_id = v_uid, converted_at = now(), updated_at = now()
     WHERE id = v_rsvp_id;
    v_converted := true;
  ELSE
    UPDATE public.plan_shares SET use_count = use_count + 1 WHERE id = v_share.id;
  END IF;

  RETURN jsonb_build_object(
    'status', 'ok', 'planner_item_id', v_item.id, 'already_joined', false, 'converted_rsvp', v_converted);
END;
$$;

REVOKE ALL ON FUNCTION public.accept_plan_share(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_plan_share(TEXT) TO authenticated, service_role;

-- ── claim_plan_share_rsvps() — convert web RSVPs after signing up ────────────
CREATE OR REPLACE FUNCTION public.claim_plan_share_rsvps()
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid     UUID := auth.uid();
  v_email   TEXT;
  v_created TIMESTAMPTZ;
  v_ids     UUID[] := '{}';
  r         RECORD;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('converted', 0, 'planner_item_ids', '[]'::jsonb);
  END IF;

  -- Only a confirmed email proves the RSVP was theirs.
  SELECT lower(u.email), u.created_at INTO v_email, v_created
    FROM auth.users u WHERE u.id = v_uid AND u.email_confirmed_at IS NOT NULL;
  IF v_email IS NULL THEN
    RETURN jsonb_build_object('converted', 0, 'planner_item_ids', '[]'::jsonb);
  END IF;

  FOR r IN
    SELECT rs.id, rs.planner_item_id, pi.created_by, pi.starts_at, pi.meta
      FROM public.plan_share_rsvps rs
      JOIN public.planner_items pi ON pi.id = rs.planner_item_id
     WHERE rs.email = v_email
       AND rs.status = 'pending'
       -- Signed up *after* answering: an existing account must open the link instead.
       AND rs.created_at <= v_created
     FOR UPDATE OF rs
  LOOP
    CONTINUE WHEN r.created_by = v_uid;
    CONTINUE WHEN r.meta ? 'cancelled_at' AND COALESCE(r.meta->>'cancelled_at', '') <> '';
    CONTINUE WHEN EXISTS (SELECT 1 FROM public.user_blocks
                           WHERE (blocker_id = r.created_by AND blocked_id = v_uid)
                              OR (blocker_id = v_uid AND blocked_id = r.created_by));

    INSERT INTO public.planner_participants (planner_item_id, user_id, role)
    VALUES (r.planner_item_id, v_uid, 'attendee')
    ON CONFLICT (planner_item_id, user_id) DO NOTHING;

    UPDATE public.plan_share_rsvps
       SET status = 'converted', converted_user_id = v_uid, converted_at = now(), updated_at = now()
     WHERE id = r.id;
    v_ids := v_ids || r.planner_item_id;
  END LOOP;

  RETURN jsonb_build_object('converted', cardinality(v_ids), 'planner_item_ids', to_jsonb(v_ids));
END;
$$;

REVOKE ALL ON FUNCTION public.claim_plan_share_rsvps() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_plan_share_rsvps() TO authenticated, service_role;
