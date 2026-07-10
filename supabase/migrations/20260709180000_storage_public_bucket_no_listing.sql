-- Security Advisor lint 0025: public_bucket_allows_listing
--
-- Public buckets (user-photos, user-videos, business-logos) do not need a broad
-- SELECT policy on storage.objects — /object/public/{bucket}/{path} URLs work
-- without RLS. The old bucket-wide SELECT allowed any client to list every object
-- via storage.list().
--
-- Owner-scoped SELECT keeps upsert/update working for the uploader; profile media
-- display continues via getPublicUrl() (CDN, no RLS). delete-account uses service_role.

DO $$
DECLARE
  b TEXT;
  buckets TEXT[] := ARRAY['user-photos', 'user-videos', 'business-logos'];
BEGIN
  FOREACH b IN ARRAY buckets LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', b || '_public_read');

    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', b || '_owner_read');
    EXECUTE format(
      'CREATE POLICY %I ON storage.objects FOR SELECT TO authenticated USING (bucket_id = %L AND (storage.foldername(name))[1] = auth.uid()::text)',
      b || '_owner_read',
      b
    );
  END LOOP;
END $$;
