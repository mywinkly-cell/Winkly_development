-- ─────────────────────────────────────────────────────────────────────────────
-- Winkly Trust & Safety — image moderation for profile photos and chat images
-- v1.0 – September 2026   (see docs/MODERATION.md)
-- ─────────────────────────────────────────────────────────────────────────────
-- 1. public.media_moderation — one row per moderated image. Owner-only read,
--    service-role write (the moderate-media Edge Function). Moderators work the
--    queue in Supabase Studio (status = 'review').
-- 2. media-quarantine — PRIVATE bucket profile photos are uploaded to first.
--    Only moderate-media promotes a passed photo into the public user-photos
--    bucket; clients lose INSERT/UPDATE on user-photos.
-- 3. enforce_moderated_profile_photos — a newly added profile photo URL (any
--    position, so also the primary one) must have passed moderation. Photos
--    already on the profile before this migration are grandfathered.
-- 4. get_chat_media_moderation(paths) — lets conversation members read the
--    moderation status of chat images (the table itself stays owner-only).
--    Unmoderated post-cutover images report 'review' (fail closed).
-- 5. Triggers → Edge Functions (pg_net, same pattern as report-notify):
--    new 'review' row → report-notify (moderation inbox);
--    status changed by a moderator → moderate-media { action: "resolve" }.
--
-- Configuration: deploy moderate-media + report-notify and set the moderation
-- vendor secrets BEFORE applying (see docs/MODERATION.md). Until the vendor
-- secrets are set every upload is held as 'review' (fail closed).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS pg_net;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Table
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.media_moderation (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind           TEXT NOT NULL CHECK (kind IN ('profile_photo', 'chat_image')),
  -- Where the object was moderated: 'media-quarantine' (profile) or 'chat-media' (chat).
  bucket         TEXT NOT NULL,
  storage_path   TEXT NOT NULL,
  -- Profile: 'core' | 'romance' | 'friends' | 'business'. Chat: conversation id.
  target         TEXT,
  -- Profile photos only: public user-photos URL once promoted (pass).
  public_url     TEXT,
  status         TEXT NOT NULL CHECK (status IN ('pass', 'review', 'block')),
  reasons        TEXT[] NOT NULL DEFAULT '{}',
  provider       TEXT NOT NULL,
  signals        JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- True when the vendor was down/misconfigured and the image was held by default.
  failed_closed  BOOLEAN NOT NULL DEFAULT false,
  reviewed_by    TEXT,
  reviewed_at    TIMESTAMPTZ,
  review_note    TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (bucket, storage_path)
);

COMMENT ON TABLE public.media_moderation IS
  'Image moderation verdicts (profile photos, chat images). Owner read; written only by the moderate-media Edge Function (service role) and by moderators in Studio. See docs/MODERATION.md.';

CREATE INDEX IF NOT EXISTS media_moderation_review_queue_idx
  ON public.media_moderation (created_at) WHERE status = 'review';
CREATE INDEX IF NOT EXISTS media_moderation_user_idx ON public.media_moderation (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS media_moderation_public_url_idx
  ON public.media_moderation (public_url) WHERE public_url IS NOT NULL;

ALTER TABLE public.media_moderation ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS media_moderation_owner_read ON public.media_moderation;
CREATE POLICY media_moderation_owner_read ON public.media_moderation
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- No INSERT/UPDATE/DELETE policies: only the service role (bypasses RLS) writes.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.media_moderation FROM anon, authenticated;
REVOKE ALL ON public.media_moderation FROM anon;
GRANT SELECT ON public.media_moderation TO authenticated;

CREATE OR REPLACE FUNCTION public.media_moderation_touch()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  IF NEW.status IS DISTINCT FROM OLD.status AND NEW.reviewed_at IS NULL THEN
    NEW.reviewed_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_media_moderation_touch ON public.media_moderation;
CREATE TRIGGER trg_media_moderation_touch
  BEFORE UPDATE ON public.media_moderation
  FOR EACH ROW EXECUTE FUNCTION public.media_moderation_touch();

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Storage: private quarantine bucket; user-photos becomes server-write-only
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'media-quarantine', 'media-quarantine', false, 52428800,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Owner-only: upload into, read (in-review preview) and delete from `{uid}/…`.
DROP POLICY IF EXISTS media_quarantine_owner_insert ON storage.objects;
CREATE POLICY media_quarantine_owner_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'media-quarantine' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS media_quarantine_owner_read ON storage.objects;
CREATE POLICY media_quarantine_owner_read ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'media-quarantine' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS media_quarantine_owner_delete ON storage.objects;
CREATE POLICY media_quarantine_owner_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'media-quarantine' AND (storage.foldername(name))[1] = auth.uid()::text);

-- user-photos: clients may no longer write (or overwrite) objects directly — every
-- object in the public bucket from now on has passed moderation. Owner read/delete
-- stay (users can still remove their own photos).
DROP POLICY IF EXISTS "user-photos_owner_insert" ON storage.objects;
DROP POLICY IF EXISTS "user-photos_owner_update" ON storage.objects;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Profile photo gate: new photo URLs must have passed moderation
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION private.profile_photo_allowed(p_user UUID, p_url TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    -- Passed moderation (automatically or after manual review).
    EXISTS (
      SELECT 1 FROM public.media_moderation m
      WHERE m.user_id = p_user AND m.kind = 'profile_photo'
        AND m.status = 'pass' AND m.public_url = p_url
    )
    -- Grandfathered: already on one of this user's profiles (pre-moderation photos,
    -- or reordering / copying a photo between modes).
    OR EXISTS (SELECT 1 FROM public.profiles_core WHERE id = p_user AND p_url = ANY (core_photos))
    OR EXISTS (SELECT 1 FROM public.user_profiles WHERE id = p_user AND (p_url = ANY (core_photos) OR main_photo_url = p_url))
    OR EXISTS (SELECT 1 FROM public.sub_profiles WHERE user_id = p_user AND p_url = ANY (photos))
    OR EXISTS (SELECT 1 FROM public.profiles_mode WHERE user_id = p_user AND p_url = ANY (photos));
$$;

REVOKE ALL ON FUNCTION private.profile_photo_allowed(UUID, TEXT) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.enforce_moderated_profile_photos()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_user UUID;
  v_new  TEXT[];
  v_old  TEXT[] := '{}';
  v_url  TEXT;
BEGIN
  -- Service role (moderate-media promotion/takedown), migrations and definer jobs.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME IN ('profiles_core', 'user_profiles') THEN
    v_user := NEW.id;
    v_new := COALESCE(NEW.core_photos, '{}');
    IF TG_OP = 'UPDATE' THEN v_old := COALESCE(OLD.core_photos, '{}'); END IF;
  ELSE
    v_user := NEW.user_id;
    v_new := COALESCE(NEW.photos, '{}');
    IF TG_OP = 'UPDATE' THEN v_old := COALESCE(OLD.photos, '{}'); END IF;
  END IF;

  FOREACH v_url IN ARRAY v_new LOOP
    CONTINUE WHEN v_url IS NULL OR v_url = ANY (v_old);
    IF NOT private.profile_photo_allowed(v_user, v_url) THEN
      RAISE EXCEPTION 'photo_not_moderated: this photo has not passed review yet'
        USING ERRCODE = 'check_violation';
    END IF;
  END LOOP;

  -- main_photo_url is client-writable too: it must be one of the (checked) photos
  -- or itself pass the gate.
  IF TG_TABLE_NAME = 'user_profiles'
     AND NEW.main_photo_url IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.main_photo_url IS DISTINCT FROM OLD.main_photo_url)
     AND NOT (NEW.main_photo_url = ANY (v_new))
     AND NOT private.profile_photo_allowed(v_user, NEW.main_photo_url) THEN
    RAISE EXCEPTION 'photo_not_moderated: this photo has not passed review yet'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_moderated_photos ON public.profiles_core;
CREATE TRIGGER trg_enforce_moderated_photos
  BEFORE INSERT OR UPDATE OF core_photos ON public.profiles_core
  FOR EACH ROW EXECUTE FUNCTION public.enforce_moderated_profile_photos();

DROP TRIGGER IF EXISTS trg_enforce_moderated_photos ON public.user_profiles;
CREATE TRIGGER trg_enforce_moderated_photos
  BEFORE INSERT OR UPDATE OF core_photos, main_photo_url ON public.user_profiles
  FOR EACH ROW EXECUTE FUNCTION public.enforce_moderated_profile_photos();

DROP TRIGGER IF EXISTS trg_enforce_moderated_photos ON public.sub_profiles;
CREATE TRIGGER trg_enforce_moderated_photos
  BEFORE INSERT OR UPDATE OF photos ON public.sub_profiles
  FOR EACH ROW EXECUTE FUNCTION public.enforce_moderated_profile_photos();

DROP TRIGGER IF EXISTS trg_enforce_moderated_photos ON public.profiles_mode;
CREATE TRIGGER trg_enforce_moderated_photos
  BEFORE INSERT OR UPDATE OF photos ON public.profiles_mode
  FOR EACH ROW EXECUTE FUNCTION public.enforce_moderated_profile_photos();

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Chat: members can read moderation status of a conversation's images
-- ─────────────────────────────────────────────────────────────────────────────
-- Chat images uploaded before this migration have no verdict; they are reported
-- as 'pass' (pre-moderation legacy). Anything uploaded after the cutover without
-- a verdict is reported as 'review' → blurred for the recipient.
CREATE TABLE IF NOT EXISTS private.media_moderation_config (
  id              BOOLEAN PRIMARY KEY DEFAULT true CHECK (id),
  chat_cutover_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO private.media_moderation_config (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.get_chat_media_moderation(p_paths TEXT[])
RETURNS TABLE (path TEXT, status TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, private, storage
AS $$
  SELECT
    p.path,
    CASE
      WHEN mm.status IS NOT NULL THEN mm.status
      WHEN o.id IS NULL THEN 'block'  -- object removed (blocked / taken down)
      WHEN o.created_at < COALESCE(
        (SELECT c.chat_cutover_at FROM private.media_moderation_config c LIMIT 1),
        '-infinity'::timestamptz
      ) THEN 'pass'
      ELSE 'review'                   -- unmoderated → fail closed
    END
  FROM unnest(p_paths[1:200]) AS p(path)
  LEFT JOIN public.media_moderation mm
    ON mm.bucket = 'chat-media' AND mm.storage_path = p.path
  LEFT JOIN storage.objects o
    ON o.bucket_id = 'chat-media' AND o.name = p.path
  WHERE EXISTS (
    SELECT 1 FROM public.conversation_members cm
    WHERE cm.conversation_id::text = split_part(p.path, '/', 2)
      AND cm.user_id = auth.uid()
      AND cm.left_at IS NULL
  );
$$;

REVOKE ALL ON FUNCTION public.get_chat_media_moderation(TEXT[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_chat_media_moderation(TEXT[]) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Triggers → Edge Functions
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.notify_media_moderation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, extensions
AS $$
DECLARE
  v_url    TEXT;
  v_secret TEXT;
BEGIN
  SELECT function_base_url, secret INTO v_url, v_secret
  FROM private.webhook_config
  WHERE id
  LIMIT 1;

  IF v_url IS NULL OR v_secret IS NULL THEN
    RETURN NEW;
  END IF;

  BEGIN
    IF TG_OP = 'INSERT' THEN
      -- New item in the manual review queue → moderation inbox.
      PERFORM net.http_post(
        url := v_url || '/functions/v1/report-notify',
        body := jsonb_build_object(
          'type', 'media_review',
          'record', jsonb_build_object(
            'id', NEW.id,
            'kind', NEW.kind,
            'user_id', NEW.user_id,
            'reasons', NEW.reasons,
            'failed_closed', NEW.failed_closed,
            'created_at', NEW.created_at
          )
        ),
        headers := jsonb_build_object('Content-Type', 'application/json', 'x-webhook-secret', v_secret),
        timeout_milliseconds := 5000
      );
    ELSE
      -- A moderator changed the verdict → promote (review→pass) or remove (→block).
      PERFORM net.http_post(
        url := v_url || '/functions/v1/moderate-media',
        body := jsonb_build_object('action', 'resolve', 'id', NEW.id),
        headers := jsonb_build_object('Content-Type', 'application/json', 'x-webhook-secret', v_secret),
        timeout_milliseconds := 10000
      );
    END IF;
  EXCEPTION WHEN OTHERS THEN
    -- Never block (or roll back) the verdict write on notification delivery.
    NULL;
  END;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_media_moderation_queued ON public.media_moderation;
CREATE TRIGGER trg_media_moderation_queued
  AFTER INSERT ON public.media_moderation
  FOR EACH ROW
  WHEN (NEW.status = 'review')
  EXECUTE FUNCTION public.notify_media_moderation();

DROP TRIGGER IF EXISTS trg_media_moderation_resolved ON public.media_moderation;
CREATE TRIGGER trg_media_moderation_resolved
  AFTER UPDATE OF status ON public.media_moderation
  FOR EACH ROW
  WHEN (
    (OLD.status = 'review' AND NEW.status = 'pass')
    OR (OLD.status <> 'block' AND NEW.status = 'block')
  )
  EXECUTE FUNCTION public.notify_media_moderation();
