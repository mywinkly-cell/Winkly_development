-- Wishlist sharing — let the people you plan with (and Winkly AI planning for you both)
-- see the places you saved.
--
-- Model
--   • Per item: wishlist_items.shared_modes — the modes this item is shared in
--     ('romance' = dates, 'friends' = meetups, 'business'). Empty = private (default).
--   • Whole list: wishlist_sharing_settings.share_all_modes — every current AND future
--     item is shared in these modes.
--   An item is visible to another user in mode M when M is in either list.
--
-- Who can see a shared item
--   Only someone who shares an active conversation in that SAME mode with the owner
--   (a romance match sees romance-shared items, a friend sees friends-shared items), and
--   neither has blocked the other. That keeps the Identity Firewall: a business contact
--   never sees the places you shared for dates.
--
-- Access path
--   Never a broad SELECT policy. The only read path for someone else's items is the
--   SECURITY DEFINER RPC get_shared_wishlist_items(p_owner_ids, p_mode), which re-checks
--   the relationship per owner and returns only display fields (no timestamps, no ids of
--   other rows). ai-gateway (service role) runs the same relationship check itself.
--
-- DOWN (manual):
--   DROP FUNCTION IF EXISTS public.get_shared_wishlist_items(uuid[], public.app_mode);
--   DROP FUNCTION IF EXISTS private.wishlist_share_visible(uuid, uuid, public.app_mode);
--   DROP TABLE IF EXISTS public.wishlist_sharing_settings;
--   ALTER TABLE public.wishlist_items DROP COLUMN IF EXISTS shared_modes;

ALTER TABLE public.wishlist_items
  ADD COLUMN IF NOT EXISTS shared_modes public.app_mode[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.wishlist_items.shared_modes IS
  'Modes this saved place is shared in. Visible only to people the owner has an active conversation with in that mode (see get_shared_wishlist_items). Empty = private.';

CREATE INDEX IF NOT EXISTS wishlist_items_shared_idx
  ON public.wishlist_items (user_id)
  WHERE shared_modes <> '{}' AND archived_at IS NULL AND visited_at IS NULL;

CREATE TABLE IF NOT EXISTS public.wishlist_sharing_settings (
  user_id         UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  share_all_modes public.app_mode[] NOT NULL DEFAULT '{}',
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.wishlist_sharing_settings IS
  'Whole-list wishlist sharing: every saved place is shared in share_all_modes. Owner-only via RLS.';

ALTER TABLE public.wishlist_sharing_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS wishlist_sharing_settings_own ON public.wishlist_sharing_settings;
CREATE POLICY wishlist_sharing_settings_own ON public.wishlist_sharing_settings
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.wishlist_sharing_settings TO authenticated;

CREATE SCHEMA IF NOT EXISTS private;

-- True when p_viewer may see p_owner's items shared in p_mode.
CREATE OR REPLACE FUNCTION private.wishlist_share_visible(
  p_viewer UUID,
  p_owner  UUID,
  p_mode   public.app_mode
) RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p_viewer IS NOT NULL
     AND p_owner IS NOT NULL
     AND p_viewer <> p_owner
     AND NOT EXISTS (
       SELECT 1 FROM public.user_blocks b
       WHERE (b.blocker_id = p_viewer AND b.blocked_id = p_owner)
          OR (b.blocker_id = p_owner AND b.blocked_id = p_viewer)
     )
     AND EXISTS (
       SELECT 1
       FROM public.conversation_members me
       JOIN public.conversation_members them
         ON them.conversation_id = me.conversation_id
       JOIN public.conversations c
         ON c.id = me.conversation_id
       WHERE me.user_id = p_viewer
         AND them.user_id = p_owner
         AND me.left_at IS NULL
         AND them.left_at IS NULL
         AND c.mode = p_mode
     );
$$;

REVOKE ALL ON FUNCTION private.wishlist_share_visible(UUID, UUID, public.app_mode) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.wishlist_share_visible(UUID, UUID, public.app_mode) TO service_role;

-- Shared, still-open wishes of up to 8 other users, for the caller, in one mode.
CREATE OR REPLACE FUNCTION public.get_shared_wishlist_items(
  p_owner_ids UUID[],
  p_mode      public.app_mode
) RETURNS TABLE (
  owner_id    UUID,
  item_id     UUID,
  title       TEXT,
  description TEXT,
  address     TEXT,
  city        TEXT,
  place_id    TEXT,
  latitude    DOUBLE PRECISION,
  longitude   DOUBLE PRECISION,
  image_url   TEXT,
  url         TEXT,
  price       TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT w.user_id, w.id, w.title, w.description, w.address, w.city, w.place_id,
         w.latitude, w.longitude, w.image_url, w.url, w.price
  FROM public.wishlist_items w
  LEFT JOIN public.wishlist_sharing_settings s ON s.user_id = w.user_id
  WHERE auth.uid() IS NOT NULL
    AND w.user_id = ANY ((p_owner_ids)[1:8])
    AND w.archived_at IS NULL
    AND w.visited_at IS NULL
    AND (p_mode = ANY (w.shared_modes) OR p_mode = ANY (COALESCE(s.share_all_modes, '{}')))
    AND private.wishlist_share_visible(auth.uid(), w.user_id, p_mode)
  ORDER BY w.updated_at DESC
  LIMIT 60;
$$;

REVOKE ALL ON FUNCTION public.get_shared_wishlist_items(UUID[], public.app_mode) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_shared_wishlist_items(UUID[], public.app_mode) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_shared_wishlist_items(UUID[], public.app_mode) TO authenticated, service_role;
