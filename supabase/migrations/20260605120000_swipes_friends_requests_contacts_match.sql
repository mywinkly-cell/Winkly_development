-- Swipe actions + Friends requests + Contacts matching RPCs
-- - Persists Romance/Friends swipe actions (pass) and Friends connect requests
-- - Reuses existing user_blocks / user_reports for block/report
-- - Adds privacy-preserving contacts matching via hashed identifiers

-- Needed for sha256 hashing in RPCs
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1) Generic swipe actions (pass/dislike etc.) — lightweight audit trail for discover feeds
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'swipe_action') THEN
    CREATE TYPE public.swipe_action AS ENUM ('pass');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.user_swipes (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mode app_mode NOT NULL,
  action public.swipe_action NOT NULL,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, target_user_id, mode, action),
  CHECK (user_id != target_user_id)
);

ALTER TABLE public.user_swipes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS us_select_own ON public.user_swipes;
DROP POLICY IF EXISTS us_insert_own ON public.user_swipes;
CREATE POLICY us_select_own ON public.user_swipes FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY us_insert_own ON public.user_swipes FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS user_swipes_user_mode_created_idx
  ON public.user_swipes (user_id, mode, created_at DESC);

-- 2) Friends: request/connect (no mutual-match logic yet; just persistence)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'friends_request_kind') THEN
    CREATE TYPE public.friends_request_kind AS ENUM ('connect', 'super_connect');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.friends_requests (
  requester_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  requested_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind public.friends_request_kind NOT NULL DEFAULT 'connect',
  message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (requester_id, requested_id),
  CHECK (requester_id != requested_id)
);

ALTER TABLE public.friends_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS fr_select_participant ON public.friends_requests;
DROP POLICY IF EXISTS fr_insert_own ON public.friends_requests;
CREATE POLICY fr_select_participant ON public.friends_requests FOR SELECT USING (
  auth.uid() = requester_id OR auth.uid() = requested_id
);
CREATE POLICY fr_insert_own ON public.friends_requests FOR INSERT WITH CHECK (auth.uid() = requester_id);

-- 3) Contacts match: client sends sha256 hashes (hex) of normalized identifiers.
-- Returns matching Winkly user ids + display basics.
--
-- Normalization contract (must match client):
-- - email: lower(trim(email))
-- - phone: remove all non-digits, then if length>=7 keep as digits string (no formatting)
CREATE OR REPLACE FUNCTION public.match_contacts(
  p_email_hashes TEXT[] DEFAULT NULL,
  p_phone_hashes TEXT[] DEFAULT NULL,
  p_limit INT DEFAULT 50
)
RETURNS TABLE (
  user_id UUID,
  email_hash TEXT,
  phone_hash TEXT
)
LANGUAGE sql
SECURITY DEFINER
-- `extensions` is required so digest()/pgcrypto resolves on hosted Supabase
-- (pgcrypto lives in the `extensions` schema, not `public`).
SET search_path = public, auth, extensions
AS $$
  WITH candidates AS (
    SELECT
      u.id AS user_id,
      encode(digest(lower(trim(coalesce(u.email, ''))), 'sha256'), 'hex') AS email_hash,
      encode(digest(regexp_replace(coalesce(u.phone, ''), '[^0-9]', '', 'g'), 'sha256'), 'hex') AS phone_hash
    FROM auth.users u
    WHERE u.id != auth.uid()
  )
  SELECT
    c.user_id,
    c.email_hash,
    c.phone_hash
  FROM candidates c
  WHERE (
    (p_email_hashes IS NOT NULL AND c.email_hash = ANY(p_email_hashes) AND c.email_hash <> encode(digest('', 'sha256'), 'hex'))
    OR
    (p_phone_hashes IS NOT NULL AND c.phone_hash = ANY(p_phone_hashes) AND c.phone_hash <> encode(digest('', 'sha256'), 'hex'))
  )
  LIMIT greatest(0, least(coalesce(p_limit, 50), 200));
$$;

GRANT EXECUTE ON FUNCTION public.match_contacts(TEXT[], TEXT[], INT) TO authenticated;

