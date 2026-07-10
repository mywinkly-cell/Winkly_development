-- Drop legacy dashboard-created storage policies that still allow bucket-wide listing.
-- Winkly-owned policies (*_owner_*) from 20260613120000 remain the source of truth.

DROP POLICY IF EXISTS "Anyone can view user photos" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view user videos" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view business logos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can manage their own user photos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can manage their own user videos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can manage their own logos" ON storage.objects;
