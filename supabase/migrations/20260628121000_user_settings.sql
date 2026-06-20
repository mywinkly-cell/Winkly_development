-- ────────────────────────────────────────────────
-- Winkly — user_settings
-- One row per user holding app preferences as JSON (extensible: add new keys
-- without a migration). First consumer: planner "Filters" view toggles
-- (settings -> 'planner' = { onlyUpcoming, showCompleted, aiSuggestions }).
-- Owner-only via RLS.
-- ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.user_settings (
  user_id    UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  settings   JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.user_settings IS
  'Per-user app preferences (JSON). Owner-only via RLS. First use: planner filter toggles under the "planner" key.';

ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;

-- Owner-only: a user may read and write only their own settings row.
DROP POLICY IF EXISTS user_settings_all ON public.user_settings;
CREATE POLICY user_settings_all ON public.user_settings
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_settings TO authenticated;

-- ────────────────────────────────────────────────
-- Trigger: keep updated_at fresh on every write
-- ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.update_user_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_user_settings_updated_at ON public.user_settings;

CREATE TRIGGER trg_update_user_settings_updated_at
  BEFORE UPDATE ON public.user_settings
  FOR EACH ROW EXECUTE PROCEDURE public.update_user_settings_updated_at();
