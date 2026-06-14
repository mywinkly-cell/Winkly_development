-- ─────────────────────────────────────────────────────────────────────────────
-- Winkly Concierge — schedule the weather-pivot re-check (pg_cron → Edge Function)
-- v1.0 – June 2026
-- ─────────────────────────────────────────────────────────────────────────────
-- The `weather-pivot-cron` Edge Function re-checks the weather ~24h before each
-- confirmed plan and, when severe, creates an indoor `pending_plans` row with
-- status = 'pivot_pending'. It was fully built but nothing scheduled it, so it
-- never ran. This migration runs it hourly via pg_cron + pg_net.
--
-- The function authenticates the caller with the `x-cron-secret` header compared
-- against its CRON_SECRET env var. We reuse the existing private.webhook_config
-- singleton (function_base_url) and add a dedicated `cron_secret` column.
--
-- Configuration (run once per environment, AFTER deploying the function):
--   1. Deploy: supabase functions deploy weather-pivot-cron
--   2. Set the function secret (must match private.webhook_config.cron_secret below):
--        supabase secrets set CRON_SECRET=<random-strong-secret>
--      (optionally) supabase secrets set GOOGLE_PLACES_API_KEY=<key>  -- for indoor venue grounding
--   3. Point the schedule at the project + secret:
--        INSERT INTO private.webhook_config (id, function_base_url, cron_secret)
--        VALUES (true, 'https://<project-ref>.supabase.co', '<random-strong-secret>')
--        ON CONFLICT (id) DO UPDATE
--          SET function_base_url = COALESCE(EXCLUDED.function_base_url, private.webhook_config.function_base_url),
--              cron_secret       = EXCLUDED.cron_secret;
--
-- Until function_base_url + cron_secret are populated, the job no-ops (no errors),
-- so this migration is safe to apply before the function is configured.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Reuse the singleton webhook config; add a cron-specific secret so it stays
-- independent of the notify-fanout webhook secret.
CREATE SCHEMA IF NOT EXISTS private;

ALTER TABLE private.webhook_config
  ADD COLUMN IF NOT EXISTS cron_secret TEXT;

COMMENT ON COLUMN private.webhook_config.cron_secret IS
  'Shared secret for pg_cron-invoked Edge Functions (weather-pivot-cron). Must equal that function''s CRON_SECRET env var.';

-- ─────────────────────────────────────────────────────────────────────────────
-- Invoker: read config + POST to the function. SECURITY DEFINER so the cron role
-- can read the locked-down private.webhook_config row.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION private.invoke_weather_pivot_cron()
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
      url := v_url || '/functions/v1/weather-pivot-cron',
      body := '{}'::jsonb,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', v_secret
      ),
      timeout_milliseconds := 10000
    );
  EXCEPTION WHEN OTHERS THEN
    -- Never let a delivery failure abort the cron transaction.
    NULL;
  END;
END;
$$;

REVOKE ALL ON FUNCTION private.invoke_weather_pivot_cron() FROM anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- Schedule: hourly. The function keeps plans starting 23–27h ahead, so an hourly
-- cadence reliably catches each plan once inside that window. Idempotent re-run.
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'winkly-weather-pivot-hourly') THEN
    PERFORM cron.unschedule('winkly-weather-pivot-hourly');
  END IF;

  PERFORM cron.schedule(
    'winkly-weather-pivot-hourly',
    '7 * * * *',
    $cron$ SELECT private.invoke_weather_pivot_cron(); $cron$
  );
END;
$$;
