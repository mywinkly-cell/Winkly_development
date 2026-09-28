-- Plan changes (cancel / reschedule / can't make it) and live plan alerts (weather, traffic).
--
-- 1. planner_participants
--    • cancelled_at / cancel_reason — a participant who can't make it (the plan goes on for
--      the others); the organiser cancelling uses planner_items.meta.cancelled_at as before.
--    • device_calendar_revision — which planner_items.revision this phone's calendar event
--      reflects; the app re-writes the event when the plan was rescheduled since.
-- 2. planner_items.revision — bumped on every reschedule.
-- 3. plan_changes — what changed, by whom, and why (shown in plan details and chats).
--    Readable by the plan's participants; written only by the plan-update Edge Function.
-- 4. plan_alerts — per-user alerts ("heavy rain at 19:00", "25 min extra traffic") with
--    actions in the app. Owner reads/dismisses; written by plan-watch-cron.
-- 5. user_push_tokens.locale / timezone — the app language and time zone on that device,
--    so server pushes are written in the recipient's language with their local times.
--
-- DOWN (manual):
--   DROP TABLE IF EXISTS public.plan_alerts; DROP TABLE IF EXISTS public.plan_changes;
--   ALTER TABLE public.planner_items DROP COLUMN IF EXISTS revision;
--   ALTER TABLE public.planner_participants DROP COLUMN IF EXISTS cancelled_at,
--     DROP COLUMN IF EXISTS cancel_reason, DROP COLUMN IF EXISTS device_calendar_revision;
--   ALTER TABLE public.user_push_tokens DROP COLUMN IF EXISTS locale, DROP COLUMN IF EXISTS timezone;

ALTER TABLE public.planner_participants
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancel_reason TEXT CHECK (cancel_reason IS NULL OR length(cancel_reason) <= 500),
  ADD COLUMN IF NOT EXISTS device_calendar_revision INT NOT NULL DEFAULT 0;

ALTER TABLE public.planner_items
  ADD COLUMN IF NOT EXISTS revision INT NOT NULL DEFAULT 0;

ALTER TABLE public.user_push_tokens
  ADD COLUMN IF NOT EXISTS locale TEXT CHECK (locale IS NULL OR locale ~ '^[a-z]{2}$'),
  ADD COLUMN IF NOT EXISTS timezone TEXT CHECK (timezone IS NULL OR length(timezone) <= 64);

-- ── plan_changes ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.plan_changes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  planner_item_id UUID NOT NULL REFERENCES public.planner_items(id) ON DELETE CASCADE,
  actor_id        UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  kind            TEXT NOT NULL CHECK (kind IN ('cancelled', 'cant_make_it', 'rescheduled', 'restored', 'heads_up')),
  reason          TEXT CHECK (reason IS NULL OR length(reason) <= 500),
  old_starts_at   TIMESTAMPTZ,
  new_starts_at   TIMESTAMPTZ,
  new_ends_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS plan_changes_item_idx ON public.plan_changes (planner_item_id, created_at DESC);

ALTER TABLE public.plan_changes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS plan_changes_participants_read ON public.plan_changes;
CREATE POLICY plan_changes_participants_read ON public.plan_changes
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.planner_participants pp
      WHERE pp.planner_item_id = plan_changes.planner_item_id AND pp.user_id = auth.uid()
    )
  );

REVOKE ALL ON public.plan_changes FROM anon, authenticated;
GRANT SELECT ON public.plan_changes TO authenticated;

-- ── plan_alerts ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.plan_alerts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  planner_item_id UUID NOT NULL REFERENCES public.planner_items(id) ON DELETE CASCADE,
  kind            TEXT NOT NULL CHECK (kind IN ('weather', 'traffic')),
  -- weather: 'rain' | 'heavy_rain' | 'storm' | 'snow' | 'heat' | 'cold' ; traffic: 'delay'
  condition       TEXT NOT NULL,
  severity        INT NOT NULL DEFAULT 0 CHECK (severity BETWEEN 0 AND 100),
  data            JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  dismissed_at    TIMESTAMPTZ,
  UNIQUE (user_id, planner_item_id, kind, condition)
);

COMMENT ON TABLE public.plan_alerts IS
  'Live alerts for an upcoming plan (weather at plan time, traffic before departure). One row per user/plan/kind/condition so each change is announced once. Written by plan-watch-cron.';

CREATE INDEX IF NOT EXISTS plan_alerts_user_open_idx
  ON public.plan_alerts (user_id, created_at DESC) WHERE dismissed_at IS NULL;

ALTER TABLE public.plan_alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS plan_alerts_own_read ON public.plan_alerts;
CREATE POLICY plan_alerts_own_read ON public.plan_alerts
  FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS plan_alerts_own_dismiss ON public.plan_alerts;
CREATE POLICY plan_alerts_own_dismiss ON public.plan_alerts
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

REVOKE ALL ON public.plan_alerts FROM anon, authenticated;
GRANT SELECT ON public.plan_alerts TO authenticated;
GRANT UPDATE (dismissed_at) ON public.plan_alerts TO authenticated;

-- ── Watch schedule: plan-watch-cron every 15 minutes ─────────────────────────
-- Same pattern as weather-pivot-cron (private.webhook_config.function_base_url +
-- cron_secret; the function checks CRON_SECRET). No-op until configured.
CREATE OR REPLACE FUNCTION private.invoke_plan_watch_cron()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, extensions
AS $$
DECLARE
  v_url    TEXT;
  v_secret TEXT;
BEGIN
  SELECT function_base_url, cron_secret INTO v_url, v_secret
  FROM private.webhook_config
  WHERE id
  LIMIT 1;

  -- Not configured yet → silently skip.
  IF v_url IS NULL OR v_secret IS NULL THEN
    RETURN;
  END IF;

  BEGIN
    PERFORM net.http_post(
      url := v_url || '/functions/v1/plan-watch-cron',
      body := '{}'::jsonb,
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', v_secret),
      timeout_milliseconds := 10000
    );
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
END;
$$;

REVOKE ALL ON FUNCTION private.invoke_plan_watch_cron() FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'plan-watch-cron';
    PERFORM cron.schedule('plan-watch-cron', '*/15 * * * *', 'SELECT private.invoke_plan_watch_cron();');
  END IF;
END $$;

-- ── Coordinates for traffic checks (server only) ─────────────────────────────
-- plan-watch-cron needs the participants' saved (already coarsened) locations to estimate
-- travel time. Service role only; never exposed to clients.
CREATE OR REPLACE FUNCTION public.plan_watch_user_coords(p_user_ids UUID[])
RETURNS TABLE (user_id UUID, lat DOUBLE PRECISION, lng DOUBLE PRECISION)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT ul.user_id, ST_Y(ul.geog::geometry), ST_X(ul.geog::geometry)
  FROM public.user_locations ul
  WHERE ul.user_id = ANY (p_user_ids);
$$;

REVOKE ALL ON FUNCTION public.plan_watch_user_coords(UUID[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.plan_watch_user_coords(UUID[]) TO service_role;
