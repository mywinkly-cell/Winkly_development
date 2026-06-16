-- Storage: move photo-verification selfies into a PRIVATE bucket.
--
-- Why: verification selfies are sensitive (face/biometric-adjacent) personal data.
-- They were previously uploaded to the PUBLIC `user-photos` bucket, where any
-- object is readable by anyone who has (or guesses) the URL — no auth check.
-- This bucket is private: only the owner (and the service role used by the
-- verify-profile-photo Edge Function) can read its objects. The selfie is never
-- rendered in the app — it is only compared server-side — so a private bucket
-- has no UX impact.
--
-- Paired app/function changes:
--   * apps/mobile/app/account/photo-verification.tsx → uploads to this bucket
--   * supabase/functions/verify-profile-photo/index.ts → downloads from this bucket (service role)
--   * supabase/functions/delete-account/index.ts → includes this bucket in GDPR erasure
--
-- All upload paths remain namespaced by user id: `{userId}/...`.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Private bucket (idempotent). public = false → no anonymous reads.
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'verification-selfies', 'verification-selfies', false, 10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. RLS on storage.objects for this bucket: owner-only, no public read.
--    The service role (Edge Function) bypasses RLS, so verification still works.
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS verification_selfies_owner_read ON storage.objects;
CREATE POLICY verification_selfies_owner_read ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'verification-selfies' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS verification_selfies_owner_insert ON storage.objects;
CREATE POLICY verification_selfies_owner_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'verification-selfies' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS verification_selfies_owner_update ON storage.objects;
CREATE POLICY verification_selfies_owner_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'verification-selfies' AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id = 'verification-selfies' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS verification_selfies_owner_delete ON storage.objects;
CREATE POLICY verification_selfies_owner_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'verification-selfies' AND (storage.foldername(name))[1] = auth.uid()::text);
