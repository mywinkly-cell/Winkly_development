-- Storage: create Winkly media buckets and enforce size + MIME restrictions
-- Buckets used by the app:
--   user-photos    — profile/core/sub-profile photos, chat images, verification selfies
--   user-videos    — profile/sub-profile videos + chat/profile voice notes (audio)
--   business-logos — business account logos
--
-- Limits mirror supabase/config.toml ([storage] file_size_limit = "50MiB").
-- 50 MiB = 52428800 bytes. Validation is also enforced client-side before upload
-- (see apps/mobile/lib/mediaValidation.ts) to avoid unnecessary API calls.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Buckets (idempotent). Public read so getPublicUrl() works for profile media.
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  (
    'user-photos', 'user-photos', true, 52428800,
    ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
  ),
  (
    'user-videos', 'user-videos', true, 52428800,
    ARRAY['video/mp4', 'video/quicktime', 'audio/mp4', 'audio/mpeg', 'audio/aac', 'audio/x-m4a']
  ),
  (
    'business-logos', 'business-logos', true, 52428800,
    ARRAY['image/jpeg', 'image/png', 'image/webp']
  )
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. RLS policies on storage.objects.
--    All app upload paths are namespaced by user id: `{userId}/...`.
--    Owners may write/update/delete only inside their own top-level folder;
--    reads are public (buckets are public for profile media display).
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  b TEXT;
  buckets TEXT[] := ARRAY['user-photos', 'user-videos', 'business-logos'];
BEGIN
  FOREACH b IN ARRAY buckets LOOP
    -- Public read
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', b || '_public_read');
    EXECUTE format(
      'CREATE POLICY %I ON storage.objects FOR SELECT USING (bucket_id = %L)',
      b || '_public_read', b
    );

    -- Owner insert (first path segment must equal the authenticated user id)
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', b || '_owner_insert');
    EXECUTE format(
      'CREATE POLICY %I ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = %L AND (storage.foldername(name))[1] = auth.uid()::text)',
      b || '_owner_insert', b
    );

    -- Owner update
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', b || '_owner_update');
    EXECUTE format(
      'CREATE POLICY %I ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = %L AND (storage.foldername(name))[1] = auth.uid()::text) WITH CHECK (bucket_id = %L AND (storage.foldername(name))[1] = auth.uid()::text)',
      b || '_owner_update', b, b
    );

    -- Owner delete
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', b || '_owner_delete');
    EXECUTE format(
      'CREATE POLICY %I ON storage.objects FOR DELETE TO authenticated USING (bucket_id = %L AND (storage.foldername(name))[1] = auth.uid()::text)',
      b || '_owner_delete', b
    );
  END LOOP;
END $$;
