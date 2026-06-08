-- Business ecosystem v1: business_type taxonomy, business_offers self-serve columns, RLS tightening

-- ─── profiles_business.business_type (expanded taxonomy) ───────────────────────
ALTER TABLE public.profiles_business
  DROP CONSTRAINT IF EXISTS profiles_business_business_type_check;

UPDATE public.profiles_business
  SET business_type = 'individual_professional'
  WHERE business_type = 'professional';

ALTER TABLE public.profiles_business
  ADD CONSTRAINT profiles_business_business_type_check
  CHECK (business_type IN ('individual_professional', 'venue', 'event_host', 'brand'));

COMMENT ON COLUMN public.profiles_business.business_type IS
  'Drives UI, discovery, and ad products: individual_professional | venue | event_host | brand.';

-- ─── business_offers — self-serve offer columns ─────────────────────────────
ALTER TABLE public.business_offers
  ADD COLUMN IF NOT EXISTS image_url     TEXT,
  ADD COLUMN IF NOT EXISTS booking_url   TEXT,
  ADD COLUMN IF NOT EXISTS category_tags TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS budget_cents  INTEGER NOT NULL DEFAULT 0 CHECK (budget_cents >= 0),
  ADD COLUMN IF NOT EXISTS is_active     BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS radius_km     INTEGER CHECK (radius_km IS NULL OR radius_km > 0);

CREATE INDEX IF NOT EXISTS idx_business_offers_active_dates
  ON public.business_offers (is_active, valid_from, valid_to)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_business_offers_category_tags
  ON public.business_offers USING GIN (category_tags);

COMMENT ON COLUMN public.business_offers.category_tags IS
  'Activity preference keys (overlap with user activity_preferences) for AI relevance gate.';
COMMENT ON COLUMN public.business_offers.radius_km IS
  'Max distance from user location (km) for sponsored injection; NULL = no radius cap.';
COMMENT ON COLUMN public.business_offers.budget_cents IS
  'Self-serve ad budget in cents (v1 placeholder until billing wired).';

-- ─── RLS: owner read/write all own rows; others read active + in-window only ─
DROP POLICY IF EXISTS business_offers_select ON public.business_offers;
CREATE POLICY business_offers_select ON public.business_offers
  FOR SELECT TO authenticated
  USING (
    auth.uid() = business_id
    OR (
      is_active = true
      AND (valid_from IS NULL OR valid_from <= now())
      AND (valid_to IS NULL OR valid_to >= now())
    )
  );

-- ─── business_profiles view triggers (default business_type) ───────────────
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
