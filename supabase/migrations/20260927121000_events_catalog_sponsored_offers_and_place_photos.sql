-- Events catalogue: sponsored venue offers + venue photos.
--
-- 1. sponsored_venue_offers — paid placements from venues, managed by the Winkly team
--    (no business account needed, like sponsored cards in dating apps). Shown in the
--    Events catalogue with a disclosure label, targeted by city/radius and interests.
--    Reuses spark_sponsors as the "who paid" record so Weekly Spark sponsorship and the
--    catalogue share one advertiser list.
--    Writes: service role only (Supabase dashboard / admin scripts). Reads: any signed-in
--    user, only rows that are active and inside their run window.
--
-- 2. sponsored_offer_events — impressions and taps, so the venue can be shown what it got.
--    Users may only insert their own rows; nobody reads them from the client.
--
-- 3. verified_places.photos — Google Places photo references (not image bytes). The
--    place-photo Edge Function turns a reference into an image without exposing the key.
--
-- 4. place_lookup_cache — free-text venue ("Café Luitpold, München") → place_id, so the
--    same lookup is paid for once. Service role only.
--
-- DOWN (manual):
--   DROP TABLE IF EXISTS public.sponsored_offer_events;
--   DROP TABLE IF EXISTS public.sponsored_venue_offers;
--   DROP TABLE IF EXISTS public.place_lookup_cache;
--   ALTER TABLE public.verified_places DROP COLUMN IF EXISTS photos;

-- ── 1. Sponsored venue offers ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.sponsored_venue_offers (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sponsor_id    UUID REFERENCES public.spark_sponsors(id) ON DELETE SET NULL,
  venue_name    TEXT NOT NULL,
  title         TEXT NOT NULL,
  description   TEXT,
  image_url     TEXT,
  link_url      TEXT,
  cta_kind      TEXT NOT NULL DEFAULT 'visit'
                CHECK (cta_kind IN ('visit', 'book', 'menu', 'offer')),
  price_label   TEXT,
  place_id      TEXT,
  address       TEXT,
  city          TEXT NOT NULL,
  latitude      DOUBLE PRECISION,
  longitude     DOUBLE PRECISION,
  radius_km     INT NOT NULL DEFAULT 25 CHECK (radius_km BETWEEN 1 AND 200),
  venue_type    TEXT,
  interest_tags TEXT[] NOT NULL DEFAULT '{}',
  starts_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  ends_at       TIMESTAMPTZ,
  weight        INT NOT NULL DEFAULT 1 CHECK (weight BETWEEN 1 AND 100),
  active        BOOLEAN NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (link_url IS NULL OR link_url ~* '^https://'),
  CHECK (image_url IS NULL OR image_url ~* '^https://')
);

COMMENT ON TABLE public.sponsored_venue_offers IS
  'Paid venue placements in the Events catalogue, managed by Winkly (no business account needed). Always rendered with a "Sponsored" label. Service-role writes only.';

CREATE INDEX IF NOT EXISTS sponsored_venue_offers_live_idx
  ON public.sponsored_venue_offers (lower(city), starts_at)
  WHERE active;

ALTER TABLE public.sponsored_venue_offers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sponsored_venue_offers_read_live ON public.sponsored_venue_offers;
CREATE POLICY sponsored_venue_offers_read_live ON public.sponsored_venue_offers
  FOR SELECT TO authenticated
  USING (active AND starts_at <= now() AND (ends_at IS NULL OR ends_at > now()));

REVOKE ALL ON public.sponsored_venue_offers FROM anon, authenticated;
GRANT SELECT ON public.sponsored_venue_offers TO authenticated;

-- ── 2. Impressions / taps ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.sponsored_offer_events (
  id         BIGSERIAL PRIMARY KEY,
  offer_id   UUID NOT NULL REFERENCES public.sponsored_venue_offers(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL CHECK (kind IN ('impression', 'tap', 'save', 'plan')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.sponsored_offer_events IS
  'Sponsored offer impressions/taps/saves/plans for venue reporting. Insert-own only; read by service role.';

CREATE INDEX IF NOT EXISTS sponsored_offer_events_offer_idx
  ON public.sponsored_offer_events (offer_id, kind, created_at DESC);

ALTER TABLE public.sponsored_offer_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sponsored_offer_events_insert_own ON public.sponsored_offer_events;
CREATE POLICY sponsored_offer_events_insert_own ON public.sponsored_offer_events
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

REVOKE ALL ON public.sponsored_offer_events FROM anon, authenticated;
GRANT INSERT ON public.sponsored_offer_events TO authenticated;
GRANT USAGE ON SEQUENCE public.sponsored_offer_events_id_seq TO authenticated;

-- ── 3. Venue photos ──────────────────────────────────────────────────────────
ALTER TABLE public.verified_places
  ADD COLUMN IF NOT EXISTS photos JSONB;

COMMENT ON COLUMN public.verified_places.photos IS
  'Up to 5 Google Places photo references [{ref, width, height, attribution}]. Rendered through the place-photo Edge Function; the API key never reaches the client.';

-- ── 4. Free-text venue lookup cache ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.place_lookup_cache (
  query_key  TEXT PRIMARY KEY,
  place_id   TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.place_lookup_cache IS
  'Normalised venue text → Google place_id (NULL = no match), so each lookup is paid once. Service role only.';

ALTER TABLE public.place_lookup_cache ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.place_lookup_cache FROM anon, authenticated;
