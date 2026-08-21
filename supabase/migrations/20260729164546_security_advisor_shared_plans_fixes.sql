-- Security advisor fixes for 20260726120000_wishlist_places_and_shared_plans:
--
-- 0011 function_search_path_mutable: winkly_touch_updated_at had no fixed
--      search_path.
-- 0028/0029 anon/authenticated_security_definer_function_executable:
--      refresh_shared_plan_rating is a trigger-only function and must not be
--      callable via /rest/v1/rpc at all; increment_shared_plan_reuse is an app
--      RPC for signed-in users only (internally guarded by auth.uid()), so
--      revoke the implicit PUBLIC/anon EXECUTE it inherited.

ALTER FUNCTION public.winkly_touch_updated_at() SET search_path = public;

-- Trigger-only functions: triggers keep firing (EXECUTE is checked against the
-- table owner), but REST RPC access is removed. Same pattern as
-- 20260709170000_revoke_rpc_on_internal_functions.
REVOKE ALL ON FUNCTION public.refresh_shared_plan_rating() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.winkly_touch_updated_at() FROM PUBLIC, anon, authenticated;

-- App RPC: keep authenticated, drop the implicit PUBLIC grant that let anon in.
REVOKE ALL ON FUNCTION public.increment_shared_plan_reuse(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.increment_shared_plan_reuse(UUID) TO authenticated;
