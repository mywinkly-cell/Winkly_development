-- Security Advisor warnings batch 2 (Splinter)
-- 1. Revoke anon/PUBLIC EXECUTE on SECURITY DEFINER RPCs (lint 0028)
-- 2. Tighten business_analytics_events INSERT policy (lint rls_policy_always_true)
-- 3. Move vector / pg_trgm / pg_net into extensions schema (lint 0014)

-- ── 1. SECURITY DEFINER: signed-in users only (not anon) ─────────────────────
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT
      p.oid::regprocedure AS signature,
      has_function_privilege('authenticated', p.oid, 'EXECUTE') AS grant_authenticated
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
      AND p.prosecdef
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC', r.signature);
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon', r.signature);
    IF r.grant_authenticated THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.signature);
    END IF;
  END LOOP;
END $$;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM anon;

-- ── 2. Analytics: inserts only via record_business_analytics_event (SECURITY DEFINER) ─
DROP POLICY IF EXISTS business_analytics_events_insert ON public.business_analytics_events;
CREATE POLICY business_analytics_events_insert ON public.business_analytics_events
  FOR INSERT TO authenticated
  WITH CHECK (false);

-- ── 3a. pg_trgm → extensions (recreate GIN indexes) ─────────────────────────
DROP INDEX IF EXISTS public.idx_events_title_trgm;
DROP INDEX IF EXISTS public.idx_events_description_trgm;
DROP EXTENSION IF EXISTS pg_trgm CASCADE;
CREATE EXTENSION pg_trgm WITH SCHEMA extensions;

DO $$
BEGIN
  IF to_regclass('public.events') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_events_title_trgm
      ON public.events USING gin (lower(title) extensions.gin_trgm_ops);
    CREATE INDEX IF NOT EXISTS idx_events_description_trgm
      ON public.events USING gin (lower(description) extensions.gin_trgm_ops);
  END IF;
END $$;

-- ── 3b. vector → extensions (preserve profile_embeddings rows) ────────────────
CREATE TABLE IF NOT EXISTS private._profile_embeddings_vector_backup (
  id             UUID PRIMARY KEY,
  user_id        UUID NOT NULL,
  mode           app_mode NOT NULL,
  embedding_text TEXT,
  source_hash    TEXT,
  created_at     TIMESTAMPTZ NOT NULL,
  updated_at     TIMESTAMPTZ NOT NULL
);

TRUNCATE private._profile_embeddings_vector_backup;

INSERT INTO private._profile_embeddings_vector_backup (
  id, user_id, mode, embedding_text, source_hash, created_at, updated_at
)
SELECT id, user_id, mode, embedding::text, source_hash, created_at, updated_at
FROM public.profile_embeddings
WHERE embedding IS NOT NULL;

ALTER TABLE public.profile_embeddings DROP COLUMN IF EXISTS embedding;
DROP EXTENSION IF EXISTS vector CASCADE;
CREATE EXTENSION vector WITH SCHEMA extensions;

ALTER TABLE public.profile_embeddings
  ADD COLUMN embedding extensions.vector(384);

UPDATE public.profile_embeddings pe
SET embedding = b.embedding_text::extensions.vector
FROM private._profile_embeddings_vector_backup b
WHERE pe.id = b.id
  AND b.embedding_text IS NOT NULL;

DROP TABLE private._profile_embeddings_vector_backup;

-- pg_trgm RPCs need extensions in search_path after move
ALTER FUNCTION public.match_events_for_concierge(text, text, timestamptz, timestamptz, integer)
  SET search_path = public, extensions;

-- pg_net: left in public for now (DROP CASCADE removes push triggers).
