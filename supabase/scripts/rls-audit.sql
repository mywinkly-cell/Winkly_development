-- RLS audit (run as service_role in Supabase SQL Editor or: psql $DATABASE_URL -f supabase/scripts/rls-audit.sql)
-- Expect every row: rls_enabled = true, policy_count > 0, status = OK (except intentional catalog tables).

SELECT * FROM public.rls_audit_report();

-- Quick anon smoke test (run in a separate session with anon key, not service_role):
--   const { data, error } = await supabase.from('users').select('id').limit(1)
--   → should error or return [] (RLS), never other users' rows.
