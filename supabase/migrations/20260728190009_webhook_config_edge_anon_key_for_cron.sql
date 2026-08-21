-- pg_net → Edge Function calls must include Authorization + apikey (anon JWT).
-- Without them the API gateway can respond UNAUTHORIZED_NO_AUTH_HEADER even when
-- verify_jwt = false. Cron secrets (x-cron-secret / x-webhook-secret) stay as the
-- function-level gate; the anon key is only for the platform gateway.

ALTER TABLE private.webhook_config
  ADD COLUMN IF NOT EXISTS edge_anon_key TEXT;

COMMENT ON COLUMN private.webhook_config.edge_anon_key IS
  'Legacy anon JWT for Authorization/apikey headers on pg_net → Edge Function calls. Public publishable key; not a substitute for cron_secret/WEBHOOK_SECRET.';

CREATE OR REPLACE FUNCTION private.invoke_weather_pivot_cron()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, extensions
AS $$
DECLARE
  v_url    TEXT;
  v_secret TEXT;
  v_anon   TEXT;
BEGIN
  SELECT function_base_url, cron_secret, edge_anon_key
    INTO v_url, v_secret, v_anon
  FROM private.webhook_config
  WHERE id
  LIMIT 1;

  IF v_url IS NULL OR v_secret IS NULL OR v_anon IS NULL OR btrim(v_anon) = '' THEN
    RETURN;
  END IF;

  BEGIN
    PERFORM net.http_post(
      url := v_url || '/functions/v1/weather-pivot-cron',
      body := '{}'::jsonb,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || v_anon,
        'apikey', v_anon,
        'x-cron-secret', v_secret
      ),
      timeout_milliseconds := 10000
    );
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
END;
$$;

CREATE OR REPLACE FUNCTION private.invoke_weekly_spark_cron()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, extensions
AS $$
DECLARE
  v_url    TEXT;
  v_secret TEXT;
  v_anon   TEXT;
BEGIN
  SELECT function_base_url, cron_secret, edge_anon_key
    INTO v_url, v_secret, v_anon
  FROM private.webhook_config
  WHERE id
  LIMIT 1;

  IF v_url IS NULL OR v_secret IS NULL OR v_anon IS NULL OR btrim(v_anon) = '' THEN
    RETURN;
  END IF;

  BEGIN
    PERFORM net.http_post(
      url := v_url || '/functions/v1/weekly-spark-cron',
      body := '{}'::jsonb,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || v_anon,
        'apikey', v_anon,
        'x-cron-secret', v_secret
      ),
      timeout_milliseconds := 600000
    );
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
END;
$$;

REVOKE ALL ON FUNCTION private.invoke_weather_pivot_cron() FROM anon, authenticated;
REVOKE ALL ON FUNCTION private.invoke_weekly_spark_cron() FROM anon, authenticated;
