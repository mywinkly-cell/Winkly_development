-- ─────────────────────────────────────────────────────────────────────────────
-- AI cost tracking (COST-2, August 2026 audit)
--
-- ai_requests recorded (user_id, mode, task, created_at) and nothing else, so
-- there was no way to answer "what does a user cost us" — which is also the
-- most sensitive input in the Year-1 financial model. Both provider SDKs return
-- token usage on every response; this stores it.
--
-- cost_micros is millionths of a euro (1 EUR = 1_000_000), so a €0.0004 call
-- stores as 400 with no floating point in the aggregate path.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.ai_requests
  ADD COLUMN IF NOT EXISTS provider      TEXT,
  ADD COLUMN IF NOT EXISTS model         TEXT,
  ADD COLUMN IF NOT EXISTS input_tokens  INTEGER,
  ADD COLUMN IF NOT EXISTS output_tokens INTEGER,
  ADD COLUMN IF NOT EXISTS cost_micros   BIGINT,
  ADD COLUMN IF NOT EXISTS cached        BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.ai_requests.cost_micros IS
  'Estimated provider cost in millionths of a euro, computed from token counts and the price table in ai-gateway/pricing.ts. Estimate, not an invoice.';
COMMENT ON COLUMN public.ai_requests.cached IS
  'True when the response was served from the semantic or context cache, so it cost nothing.';

-- The daily-spend guard reads (user_id, created_at) for a UTC day window.
CREATE INDEX IF NOT EXISTS ai_requests_user_created_idx
  ON public.ai_requests (user_id, created_at DESC);

-- And the global guard reads (created_at) across all users.
CREATE INDEX IF NOT EXISTS ai_requests_created_idx
  ON public.ai_requests (created_at DESC);

-- ── Spend rollups ────────────────────────────────────────────────────────────
-- Owner-visible only through RLS on the underlying table; the gateway reads
-- them with the service role.

CREATE OR REPLACE VIEW public.ai_spend_daily AS
  SELECT
    date_trunc('day', created_at AT TIME ZONE 'UTC')::date AS day,
    user_id,
    count(*)                                   AS requests,
    count(*) FILTER (WHERE cached)             AS cached_requests,
    coalesce(sum(input_tokens), 0)             AS input_tokens,
    coalesce(sum(output_tokens), 0)            AS output_tokens,
    coalesce(sum(cost_micros), 0)              AS cost_micros,
    round(coalesce(sum(cost_micros), 0) / 1000000.0, 4) AS cost_eur
  FROM public.ai_requests
  GROUP BY 1, 2;

ALTER VIEW public.ai_spend_daily SET (security_invoker = on);

CREATE OR REPLACE VIEW public.ai_spend_by_task AS
  SELECT
    date_trunc('day', created_at AT TIME ZONE 'UTC')::date AS day,
    task,
    model,
    count(*)                        AS requests,
    coalesce(sum(cost_micros), 0)   AS cost_micros,
    round(coalesce(sum(cost_micros), 0) / 1000000.0, 4) AS cost_eur
  FROM public.ai_requests
  GROUP BY 1, 2, 3;

ALTER VIEW public.ai_spend_by_task SET (security_invoker = on);

COMMENT ON VIEW public.ai_spend_daily IS
  'Per-user, per-UTC-day AI spend. Feeds the daily cap in ai-gateway and answers the cost-per-active-user question the financial model needs.';

-- ── Guard function used by the gateway ───────────────────────────────────────
-- Kept in the database so the number is authoritative even if a second client
-- ever calls the provider.

CREATE OR REPLACE FUNCTION private.ai_spend_today_micros(p_user_id uuid)
RETURNS BIGINT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(sum(cost_micros), 0)::bigint
  FROM public.ai_requests
  WHERE user_id = p_user_id
    AND created_at >= date_trunc('day', now() AT TIME ZONE 'UTC');
$$;

REVOKE ALL ON FUNCTION private.ai_spend_today_micros(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.ai_spend_today_micros(uuid) TO service_role;

CREATE OR REPLACE FUNCTION private.ai_spend_global_month_micros()
RETURNS BIGINT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(sum(cost_micros), 0)::bigint
  FROM public.ai_requests
  WHERE created_at >= date_trunc('month', now() AT TIME ZONE 'UTC');
$$;

REVOKE ALL ON FUNCTION private.ai_spend_global_month_micros() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.ai_spend_global_month_micros() TO service_role;

-- PostgREST only exposes `public`, so the gateway cannot call the private
-- functions above directly. These thin INVOKER wrappers are the API surface,
-- granted to service_role only — the mobile app never calls them.

CREATE OR REPLACE FUNCTION public.ai_spend_today_micros(p_user_id uuid)
RETURNS BIGINT
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, private
AS $$ SELECT private.ai_spend_today_micros(p_user_id); $$;

REVOKE ALL ON FUNCTION public.ai_spend_today_micros(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ai_spend_today_micros(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.ai_spend_global_month_micros()
RETURNS BIGINT
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, private
AS $$ SELECT private.ai_spend_global_month_micros(); $$;

REVOKE ALL ON FUNCTION public.ai_spend_global_month_micros() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ai_spend_global_month_micros() TO service_role;

COMMENT ON FUNCTION public.ai_spend_today_micros(uuid) IS
  'Micro-euros this user has spent on AI since 00:00 UTC. service_role only; read by the daily cap in ai-gateway.';
