-- ─────────────────────────────────────────────────────────────────────────────
-- Winkly Weekly Spark — schedule the weekly generation (pg_cron → Edge Function)
-- v1.0 – June 2026
-- ─────────────────────────────────────────────────────────────────────────────
-- The `weekly-spark-cron` Edge Function generates each active user's 3 Weekly
-- Spark plans (SOLO / DATE / MEETUP). It runs once a week (Monday 06:00 UTC).
--
-- Like weather-pivot-cron, it authenticates the caller with the `x-cron-secret`
-- header compared against its CRON_SECRET env var, and we reuse the existing
-- private.webhook_config singleton (function_base_url + cron_secret).
--
-- Configuration (run once per environment, AFTER deploying the function):
--   1. Deploy: supabase functions deploy weekly-spark-cron
--   2. REQUIRED secrets (the cron FAILS CLOSED without the Places key — it will
--      produce NO Spark rather than emit world-knowledge venues):
--        supabase secrets set CRON_SECRET=<random-strong-secret>
--        supabase secrets set GOOGLE_PLACES_API_KEY=<key>
--   3. Point the schedule at the project + secret (shared with weather-pivot-cron):
--        INSERT INTO private.webhook_config (id, function_base_url, cron_secret)
--        VALUES (true, 'https://<project-ref>.supabase.co', '<random-strong-secret>')
--        ON CONFLICT (id) DO UPDATE
--          SET function_base_url = COALESCE(EXCLUDED.function_base_url, private.webhook_config.function_base_url),
--              cron_secret       = EXCLUDED.cron_secret;
--
-- Until function_base_url + cron_secret are populated, the job no-ops (no errors),
-- so this migration is safe to apply before the function is configured.
--
-- Reversible — DOWN (run manually to undo):
--   SELECT cron.unschedule('winkly-weekly-spark');
--   DROP FUNCTION IF EXISTS private.invoke_weekly_spark_cron();
-- ─────────────────────────────────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS pg_cron;

CREATE SCHEMA IF NOT EXISTS private;

-- The cron_secret column already exists (added by the weather-pivot schedule
-- migration); guard for environments applying these out of order.
ALTER TABLE private.webhook_config
  ADD COLUMN IF NOT EXISTS cron_secret TEXT;

-- ─────────────────────────────────────────────────────────────────────────────
-- Invoker: read config + POST to the function. SECURITY DEFINER so the cron role
-- can read the locked-down private.webhook_config row.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION private.invoke_weekly_spark_cron()
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
      url := v_url || '/functions/v1/weekly-spark-cron',
      body := '{}'::jsonb,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', v_secret
      ),
      -- Generation fans out over all active users; allow a generous budget.
      timeout_milliseconds := 600000
    );
  EXCEPTION WHEN OTHERS THEN
    -- Never let a delivery failure abort the cron transaction.
    NULL;
  END;
END;
$$;

REVOKE ALL ON FUNCTION private.invoke_weekly_spark_cron() FROM anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- Schedule: weekly, Mondays 06:00 UTC. The function is idempotent per
-- (user_id, week_start), so an accidental re-run within the same week is a no-op.
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'winkly-weekly-spark') THEN
    PERFORM cron.unschedule('winkly-weekly-spark');
  END IF;

  PERFORM cron.schedule(
    'winkly-weekly-spark',
    '0 6 * * 1',
    $cron$ SELECT private.invoke_weekly_spark_cron(); $cron$
  );
END;
$$;
