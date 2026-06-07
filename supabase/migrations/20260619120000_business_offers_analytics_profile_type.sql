-- Business profile type, sponsored offers, event allow_group_chat, business analytics events

-- ─── profiles_business.business_type ─────────────────────────────────────────
ALTER TABLE public.profiles_business
  ADD COLUMN IF NOT EXISTS business_type TEXT NOT NULL DEFAULT 'brand'
    CHECK (business_type IN ('professional', 'venue', 'brand'));

COMMENT ON COLUMN public.profiles_business.business_type IS
  'Distinguishes individual professionals, physical venues, and brand/company accounts.';

-- ─── events.allow_group_chat (denormalized; event_chat_settings remains canonical) ─
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS allow_group_chat BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.events.allow_group_chat IS
  'Host opt-in for event group chat. Mirrored to event_chat_settings.chat_enabled on create.';

-- ─── business_offers (sponsored placements + partner offers) ─────────────────
CREATE TABLE IF NOT EXISTS public.business_offers (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title           TEXT NOT NULL,
  description     TEXT,
  offer_type      TEXT,
  location        TEXT,
  city            TEXT,
  valid_from      TIMESTAMPTZ,
  valid_to        TIMESTAMPTZ,
  is_sponsored    BOOLEAN NOT NULL DEFAULT false,
  sponsored_until TIMESTAMPTZ,
  meta            JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_business_offers_business ON public.business_offers(business_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_business_offers_sponsored ON public.business_offers(is_sponsored, sponsored_until)
  WHERE is_sponsored = true;

ALTER TABLE public.business_offers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS business_offers_select ON public.business_offers;
CREATE POLICY business_offers_select ON public.business_offers
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS business_offers_insert ON public.business_offers;
CREATE POLICY business_offers_insert ON public.business_offers
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = business_id);

DROP POLICY IF EXISTS business_offers_update ON public.business_offers;
CREATE POLICY business_offers_update ON public.business_offers
  FOR UPDATE TO authenticated USING (auth.uid() = business_id);

DROP POLICY IF EXISTS business_offers_delete ON public.business_offers;
CREATE POLICY business_offers_delete ON public.business_offers
  FOR DELETE TO authenticated USING (auth.uid() = business_id);

-- ─── business_analytics_events ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.business_analytics_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type  TEXT NOT NULL,
  viewer_id   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  offer_id    UUID REFERENCES public.business_offers(id) ON DELETE SET NULL,
  meta        JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bae_business_created ON public.business_analytics_events(business_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bae_business_type ON public.business_analytics_events(business_id, event_type);

ALTER TABLE public.business_analytics_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS business_analytics_events_select ON public.business_analytics_events;
CREATE POLICY business_analytics_events_select ON public.business_analytics_events
  FOR SELECT TO authenticated USING (auth.uid() = business_id);

DROP POLICY IF EXISTS business_analytics_events_insert ON public.business_analytics_events;
CREATE POLICY business_analytics_events_insert ON public.business_analytics_events
  FOR INSERT TO authenticated WITH CHECK (true);

-- ─── business_profiles view + INSTEAD OF triggers (business_type) ────────────
CREATE OR REPLACE FUNCTION public.business_profiles_instead_of_insert()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles_business (
    id, business_name, business_type, location, area, bio, tags,
    website, instagram, facebook, linkedin, logo_uri
  )
  VALUES (
    COALESCE(NEW.id, NEW.user_id),
    COALESCE(NEW.business_name, NEW.display_name, ''),
    COALESCE(NEW.business_type, 'brand'),
    NEW.city,
    NEW.area,
    NEW.bio,
    NEW.tags,
    NEW.website,
    NEW.instagram,
    NEW.facebook,
    NEW.linkedin,
    COALESCE(NEW.logo_uri, NEW.main_photo_url, NEW.avatar_url)
  )
  ON CONFLICT (id) DO UPDATE SET
    business_name = EXCLUDED.business_name,
    business_type = EXCLUDED.business_type,
    location = EXCLUDED.location,
    area = EXCLUDED.area,
    bio = EXCLUDED.bio,
    tags = EXCLUDED.tags,
    website = EXCLUDED.website,
    instagram = EXCLUDED.instagram,
    facebook = EXCLUDED.facebook,
    linkedin = EXCLUDED.linkedin,
    logo_uri = EXCLUDED.logo_uri,
    updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.business_profiles_instead_of_update()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.profiles_business SET
    business_name = COALESCE(NEW.business_name, business_name),
    business_type = COALESCE(NEW.business_type, business_type),
    location = COALESCE(NEW.city, location),
    area = COALESCE(NEW.area, area),
    bio = COALESCE(NEW.bio, bio),
    tags = COALESCE(NEW.tags, tags),
    website = COALESCE(NEW.website, website),
    instagram = COALESCE(NEW.instagram, instagram),
    facebook = COALESCE(NEW.facebook, facebook),
    linkedin = COALESCE(NEW.linkedin, linkedin),
    logo_uri = COALESCE(NEW.logo_uri, NEW.main_photo_url, NEW.avatar_url, logo_uri),
    updated_at = now()
  WHERE id = OLD.id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'business_profiles' AND c.relkind = 'r'
  ) THEN
    RETURN;
  END IF;
  DROP VIEW IF EXISTS public.business_profiles;
  CREATE VIEW public.business_profiles AS
  SELECT
    id,
    id AS user_id,
    business_name,
    business_type,
    business_name AS display_name,
    location AS city,
    business_name AS company_name,
    logo_uri AS main_photo_url,
    logo_uri AS avatar_url,
    area,
    bio,
    tags,
    website,
    instagram,
    facebook,
    linkedin,
    logo_uri,
    created_at,
    updated_at
  FROM public.profiles_business;
  ALTER VIEW public.business_profiles SET (security_invoker = on);
  GRANT SELECT, INSERT, UPDATE ON public.business_profiles TO authenticated;
END $$;

-- Sync allow_group_chat when host toggles event_chat_settings
CREATE OR REPLACE FUNCTION public.sync_event_allow_group_chat()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.events
  SET allow_group_chat = NEW.chat_enabled, updated_at = now()
  WHERE id = NEW.event_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_sync_event_allow_group_chat ON public.event_chat_settings;
CREATE TRIGGER trg_sync_event_allow_group_chat
  AFTER INSERT OR UPDATE OF chat_enabled ON public.event_chat_settings
  FOR EACH ROW EXECUTE FUNCTION public.sync_event_allow_group_chat();

COMMENT ON TABLE public.business_offers IS 'Partner/sponsored offers for AI concierge and business discover.';
COMMENT ON TABLE public.business_analytics_events IS 'Per-business engagement metrics (profile views, offer clicks, etc.).';
