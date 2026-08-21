-- Run this in the SQL editor BEFORE validating the 18+ constraints added in
-- 20260821120000_security_hardening_audit_v1_48.sql.
--
-- The constraints are created NOT VALID, so they guard every new write but do
-- not scan existing rows. If this query returns anything, that is a moderation
-- decision — not something to fix by relaxing the constraint.

SELECT
  'user_profiles' AS source,
  p.id,
  u.email,
  p.birthday,
  date_part('year', age(p.birthday))::int AS age_now,
  p.created_at
FROM public.user_profiles p
LEFT JOIN public.users u ON u.id = p.id
WHERE p.birthday IS NOT NULL
  AND p.birthday > (CURRENT_DATE - INTERVAL '18 years')

UNION ALL

SELECT
  'profiles_core',
  c.id,
  u.email,
  c.birthday,
  date_part('year', age(c.birthday))::int,
  NULL
FROM public.profiles_core c
LEFT JOIN public.users u ON u.id = c.id
WHERE c.birthday IS NOT NULL
  AND c.birthday > (CURRENT_DATE - INTERVAL '18 years')

ORDER BY birthday DESC;

-- Once the result is empty (or the accounts have been actioned):
--
--   ALTER TABLE public.user_profiles VALIDATE CONSTRAINT user_profiles_min_age_chk;
--   ALTER TABLE public.profiles_core VALIDATE CONSTRAINT profiles_core_min_age_chk;
