-- ─────────────────────────────────────────────────────────────────────────────
-- Winkly Trust & Safety — DSA notice-and-action fan-out (DB triggers → Edge Fn)
-- v1.0 – September 2026  (LEG-3)
-- ─────────────────────────────────────────────────────────────────────────────
-- The Digital Services Act requires that a report of illegal / infringing
-- content actually reaches the provider. Reports are already persisted in
-- public.user_reports / public.message_reports (INSERT-only RLS). This migration
-- adds AFTER INSERT triggers that notify a moderation inbox the moment a report
-- lands, reusing the existing pg_net → Edge Function webhook pattern
-- (see 20260612130000_push_notification_triggers.sql for notify-fanout).
--
-- Configuration (run once per environment, AFTER deploying the function):
--   1. Deploy:  npx supabase functions deploy report-notify
--   2. Secret (reuses the notify-fanout shared secret — already set in prod):
--        npx supabase secrets set WEBHOOK_SECRET=<same value as private.webhook_config.secret>
--   3. Moderation inbox — a Slack / Discord / email-relay incoming webhook URL:
--        npx supabase secrets set REPORT_WEBHOOK_URL=<incoming-webhook-url>
--        # optional, defaults to "slack": npx supabase secrets set REPORT_WEBHOOK_FORMAT=slack
--   4. private.webhook_config must already hold function_base_url + secret
--      (populated by 20260612130000_push_notification_triggers.sql).
--
-- Until REPORT_WEBHOOK_URL is set the function no-ops (the report still lands in
-- the table); until webhook_config is populated the triggers no-op. Safe to
-- apply before the function is configured.
--
-- Note: the app writes reports with upsert(on_conflict), so a *re-report* of the
-- same target updates the existing row and does NOT re-fire these AFTER INSERT
-- triggers. The first report of each target always notifies.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE OR REPLACE FUNCTION public.notify_report_received()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, extensions
AS $$
DECLARE
  v_url    TEXT;
  v_secret TEXT;
  v_type   TEXT;
  v_record JSONB;
BEGIN
  SELECT function_base_url, secret INTO v_url, v_secret
  FROM private.webhook_config
  WHERE id
  LIMIT 1;

  -- Not configured yet → silently skip (the report row is already committed).
  IF v_url IS NULL OR v_secret IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'message_reports' THEN
    v_type := 'message_report';
    v_record := jsonb_build_object(
      'message_id',  NEW.message_id,
      'reporter_id', NEW.reporter_id,
      'reason',      NEW.reason,
      'details',     NEW.details,
      'created_at',  NEW.created_at
    );
  ELSE
    v_type := 'user_report';
    v_record := jsonb_build_object(
      'reported_id', NEW.reported_id,
      'reporter_id', NEW.reporter_id,
      'reason',      NEW.reason,
      'details',     NEW.details,
      'created_at',  NEW.created_at
    );
  END IF;

  BEGIN
    PERFORM net.http_post(
      url := v_url || '/functions/v1/report-notify',
      body := jsonb_build_object('type', v_type, 'record', v_record),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-webhook-secret', v_secret
      ),
      timeout_milliseconds := 5000
    );
  EXCEPTION WHEN OTHERS THEN
    -- Never block (or roll back) the report write on notification delivery.
    NULL;
  END;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_user_report ON public.user_reports;
CREATE TRIGGER trg_notify_user_report
  AFTER INSERT ON public.user_reports
  FOR EACH ROW EXECUTE FUNCTION public.notify_report_received();

DROP TRIGGER IF EXISTS trg_notify_message_report ON public.message_reports;
CREATE TRIGGER trg_notify_message_report
  AFTER INSERT ON public.message_reports
  FOR EACH ROW EXECUTE FUNCTION public.notify_report_received();
