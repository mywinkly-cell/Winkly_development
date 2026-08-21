-- ─────────────────────────────────────────────────────────────────────────────
-- Winkly Planner — schedule the cloud calendar sync durability sweep (pg_cron → Edge Function)
-- v1.0 – August 2026
-- ─────────────────────────────────────────────────────────────────────────────
-- calendar-sync-confirmed-event fires once, fire-and-forget, right when a plan is
-- confirmed. This sweep retries anything that attempt missed (transient provider error,
-- device offline mid-confirm, a late calendar connect) by re-running the same sync logic
-- against upcoming confirmed_events every 10 minutes. Reuses the exact
-- private.webhook_config + pg_cron + pg_net pattern already built for weather-pivot-cron
-- (see 20260625120000_weather_pivot_cron_schedule.sql) and the same shared cron_secret.
--
-- Configuration (run once per environment, AFTER deploying the function):
--   1. Deploy: supabase functions deploy calendar-sync-sweep
--   2. CRON_SECRET must already be set (shared with weather-pivot-cron / weekly-spark-cron):
--        supabase secrets set CRON_SECRET=<random-strong-secret>
--   3. private.webhook_config must already have function_base_url + cron_secret populated
--      (see weather-pivot-cron's migration) — this job reuses that same row.
--
-- Until function_base_url + cron_secret are populated, the job no-ops (no errors), so this
-- migration is safe to apply before the function is configured.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE SCHEMA IF NOT EXISTS private;

CREATE OR REPLACE FUNCTION private.invoke_calendar_sync_sweep_cron()
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
      url := v_url || '/functions/v1/calendar-sync-sweep',
      body := '{}'::jsonb,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', v_secret
      ),
      timeout_milliseconds := 20000
    );
  EXCEPTION WHEN OTHERS THEN
    -- Never let a delivery failure abort the cron transaction.
    NULL;
  END;
END;
$$;

REVOKE ALL ON FUNCTION private.invoke_calendar_sync_sweep_cron() FROM anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- Schedule: every 10 minutes. Bounded to 50 events per run (soonest-starting first) so a
-- large backlog drains gradually instead of one run timing out. Idempotent re-run.
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'winkly-calendar-sync-sweep-10min') THEN
    PERFORM cron.unschedule('winkly-calendar-sync-sweep-10min');
  END IF;

  PERFORM cron.schedule(
    'winkly-calendar-sync-sweep-10min',
    '*/10 * * * *',
    $cron$ SELECT private.invoke_calendar_sync_sweep_cron(); $cron$
  );
END;
$$;
