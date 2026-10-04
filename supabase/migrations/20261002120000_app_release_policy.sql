-- Minimum supported app build per platform (force-update gate).
--
-- When a backend change would break older installs, raise min_build for that platform. On launch
-- the app compares its native build number (Android versionCode / iOS CFBundleVersion, set by EAS
-- autoIncrement) against min_build and, when lower, shows a blocking "Please update" screen that
-- links to store_url. No row (or min_build = 0) means every build is allowed.
--
-- Edit from the Supabase dashboard (Table editor) or SQL; clients can only read.
--   UPDATE public.app_release_policy SET min_build = 42 WHERE platform = 'android';

CREATE TABLE IF NOT EXISTS public.app_release_policy (
  platform TEXT PRIMARY KEY CHECK (platform IN ('ios', 'android')),
  min_build INTEGER NOT NULL DEFAULT 0 CHECK (min_build >= 0),
  store_url TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.app_release_policy IS
  'Per-platform minimum native build number the app accepts; lower builds are blocked with an update prompt linking to store_url. Read-only for clients.';

ALTER TABLE public.app_release_policy ENABLE ROW LEVEL SECURITY;

-- Readable before sign-in: an outdated build must be stopped on the auth screens too.
DROP POLICY IF EXISTS app_release_policy_read ON public.app_release_policy;
CREATE POLICY app_release_policy_read ON public.app_release_policy FOR SELECT TO anon, authenticated USING (true);

REVOKE INSERT, UPDATE, DELETE ON public.app_release_policy FROM anon, authenticated;
GRANT SELECT ON public.app_release_policy TO anon, authenticated;

INSERT INTO public.app_release_policy (platform, min_build, store_url)
VALUES
  ('android', 0, 'https://play.google.com/store/apps/details?id=com.winkly.app'),
  ('ios', 0, NULL)
ON CONFLICT (platform) DO NOTHING;
