-- Wishlist: share with SPECIFIC connections (not only "everyone I chat with in a mode"),
-- per place or the whole list, and let people see what was shared with them.
--
-- A "connection" = someone you have an active 1:1 chat with (a match, a friend, a business
-- contact), neither of you having blocked the other. That is the same relationship the
-- per-mode sharing (20260927120000) uses.
--
--   wishlist_item_viewers(owner_id, item_id, viewer_id)
--     item_id NULL  → the viewer sees the owner's WHOLE list
--     item_id set   → the viewer sees that one place
--   Written only through set_wishlist_viewers() (validates every viewer is a connection);
--   the owner can read their own rows; viewers never read the table.
--
-- RPCs
--   list_wishlist_share_candidates()      people I can share with (my connections)
--   set_wishlist_viewers(item_id, ids[])  replace who sees one place (NULL = whole list)
--   get_wishlist_shared_with_me()         everything others shared with me, with who shared it
--   get_shared_wishlist_items(ids, mode)  now also returns places shared with me personally
--
-- DOWN (manual):
--   DROP FUNCTION IF EXISTS public.get_wishlist_shared_with_me();
--   DROP FUNCTION IF EXISTS public.set_wishlist_viewers(uuid, uuid[]);
--   DROP FUNCTION IF EXISTS public.list_wishlist_share_candidates();
--   DROP FUNCTION IF EXISTS private.wishlist_are_connected(uuid, uuid);
--   DROP TABLE IF EXISTS public.wishlist_item_viewers;
--   (re-run 20260927120000 to restore the previous get_shared_wishlist_items)

CREATE TABLE IF NOT EXISTS public.wishlist_item_viewers (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  item_id    UUID REFERENCES public.wishlist_items(id) ON DELETE CASCADE,
  viewer_id  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (owner_id <> viewer_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS wishlist_item_viewers_item_uq
  ON public.wishlist_item_viewers (item_id, viewer_id) WHERE item_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS wishlist_item_viewers_list_uq
  ON public.wishlist_item_viewers (owner_id, viewer_id) WHERE item_id IS NULL;
CREATE INDEX IF NOT EXISTS wishlist_item_viewers_viewer_idx
  ON public.wishlist_item_viewers (viewer_id);

COMMENT ON TABLE public.wishlist_item_viewers IS
  'Wishlist places (item_id) or whole lists (item_id NULL) shared with specific connections. Write via set_wishlist_viewers(); owner-read only.';

ALTER TABLE public.wishlist_item_viewers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS wishlist_item_viewers_owner_read ON public.wishlist_item_viewers;
CREATE POLICY wishlist_item_viewers_owner_read ON public.wishlist_item_viewers
  FOR SELECT TO authenticated
  USING (owner_id = auth.uid());

REVOKE ALL ON public.wishlist_item_viewers FROM anon, authenticated;
GRANT SELECT ON public.wishlist_item_viewers TO authenticated;

CREATE SCHEMA IF NOT EXISTS private;

-- True when a and b share an active 1:1 chat (any mode) and neither blocked the other.
CREATE OR REPLACE FUNCTION private.wishlist_are_connected(p_a UUID, p_b UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p_a IS NOT NULL AND p_b IS NOT NULL AND p_a <> p_b
     AND NOT EXISTS (
       SELECT 1 FROM public.user_blocks b
       WHERE (b.blocker_id = p_a AND b.blocked_id = p_b)
          OR (b.blocker_id = p_b AND b.blocked_id = p_a)
     )
     AND EXISTS (
       SELECT 1
       FROM public.conversation_members me
       JOIN public.conversation_members them ON them.conversation_id = me.conversation_id
       JOIN public.conversations c ON c.id = me.conversation_id
       WHERE me.user_id = p_a AND them.user_id = p_b
         AND me.left_at IS NULL AND them.left_at IS NULL
         AND c.type = 'dm'
     );
$$;

REVOKE ALL ON FUNCTION private.wishlist_are_connected(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.wishlist_are_connected(UUID, UUID) TO service_role;

-- ── People I can share with ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.list_wishlist_share_candidates()
RETURNS TABLE (user_id UUID, first_name TEXT, photo_url TEXT, modes public.app_mode[])
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT them.user_id,
         max(p.first_name) AS first_name,
         max(p.main_photo_url) AS photo_url,
         array_agg(DISTINCT c.mode) AS modes
  FROM public.conversation_members me
  JOIN public.conversation_members them
    ON them.conversation_id = me.conversation_id AND them.user_id <> me.user_id
  JOIN public.conversations c ON c.id = me.conversation_id
  LEFT JOIN public.user_profiles p ON p.id = them.user_id
  WHERE auth.uid() IS NOT NULL
    AND me.user_id = auth.uid()
    AND me.left_at IS NULL AND them.left_at IS NULL
    AND c.type = 'dm'
    AND NOT EXISTS (
      SELECT 1 FROM public.user_blocks b
      WHERE (b.blocker_id = auth.uid() AND b.blocked_id = them.user_id)
         OR (b.blocker_id = them.user_id AND b.blocked_id = auth.uid())
    )
  GROUP BY them.user_id
  ORDER BY max(p.first_name) NULLS LAST
  LIMIT 300;
$$;

REVOKE ALL ON FUNCTION public.list_wishlist_share_candidates() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_wishlist_share_candidates() TO authenticated;

-- ── Replace who sees one place (or the whole list when p_item_id IS NULL) ────
CREATE OR REPLACE FUNCTION public.set_wishlist_viewers(p_item_id UUID, p_viewer_ids UUID[])
RETURNS INTEGER
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_id UUID;
  v_count INTEGER := 0;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'set_wishlist_viewers: not signed in' USING ERRCODE = '28000';
  END IF;
  IF p_item_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.wishlist_items WHERE id = p_item_id AND user_id = v_uid
  ) THEN
    RAISE EXCEPTION 'set_wishlist_viewers: not your wishlist item' USING ERRCODE = '42501';
  END IF;
  IF coalesce(array_length(p_viewer_ids, 1), 0) > 100 THEN
    RAISE EXCEPTION 'set_wishlist_viewers: too many people' USING ERRCODE = '22023';
  END IF;

  DELETE FROM public.wishlist_item_viewers
  WHERE owner_id = v_uid AND item_id IS NOT DISTINCT FROM p_item_id;

  FOREACH v_id IN ARRAY coalesce(p_viewer_ids, '{}') LOOP
    -- Only real connections; anyone else is silently skipped.
    IF private.wishlist_are_connected(v_uid, v_id) THEN
      INSERT INTO public.wishlist_item_viewers (owner_id, item_id, viewer_id)
      VALUES (v_uid, p_item_id, v_id)
      ON CONFLICT DO NOTHING;
      v_count := v_count + 1;
    END IF;
  END LOOP;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.set_wishlist_viewers(UUID, UUID[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_wishlist_viewers(UUID, UUID[]) TO authenticated;

-- ── Visibility of one item to one viewer (all three routes) ─────────────────────
-- (a) shared in a mode where both have an active chat, (b) whole list shared with the
-- viewer, (c) this item shared with the viewer. (b)/(c) still require a live connection.
CREATE OR REPLACE FUNCTION private.wishlist_item_visible_to(p_item_id UUID, p_viewer UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.wishlist_items w
    LEFT JOIN public.wishlist_sharing_settings s ON s.user_id = w.user_id
    WHERE w.id = p_item_id
      AND w.user_id <> p_viewer
      AND (
        EXISTS (
          SELECT 1 FROM unnest(w.shared_modes || coalesce(s.share_all_modes, '{}')) AS m(mode)
          WHERE private.wishlist_share_visible(p_viewer, w.user_id, m.mode)
        )
        OR (
          EXISTS (
            SELECT 1 FROM public.wishlist_item_viewers v
            WHERE v.owner_id = w.user_id AND v.viewer_id = p_viewer
              AND (v.item_id = w.id OR v.item_id IS NULL)
          )
          AND private.wishlist_are_connected(w.user_id, p_viewer)
        )
      )
  );
$$;

REVOKE ALL ON FUNCTION private.wishlist_item_visible_to(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.wishlist_item_visible_to(UUID, UUID) TO service_role;

-- ── For AI planning with specific people (mode-shared + personally shared) ─────
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
    AND (
      (
        (p_mode = ANY (w.shared_modes) OR p_mode = ANY (COALESCE(s.share_all_modes, '{}')))
        AND private.wishlist_share_visible(auth.uid(), w.user_id, p_mode)
      )
      OR (
        EXISTS (
          SELECT 1 FROM public.wishlist_item_viewers v
          WHERE v.owner_id = w.user_id AND v.viewer_id = auth.uid()
            AND (v.item_id = w.id OR v.item_id IS NULL)
        )
        AND private.wishlist_are_connected(w.user_id, auth.uid())
      )
    )
  ORDER BY w.updated_at DESC
  LIMIT 60;
$$;

REVOKE ALL ON FUNCTION public.get_shared_wishlist_items(UUID[], public.app_mode) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_shared_wishlist_items(UUID[], public.app_mode) TO authenticated, service_role;

-- ── Everything shared with me ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_wishlist_shared_with_me()
RETURNS TABLE (
  owner_id        UUID,
  owner_first_name TEXT,
  owner_photo_url TEXT,
  item_id         UUID,
  title           TEXT,
  description     TEXT,
  address         TEXT,
  city            TEXT,
  place_id        TEXT,
  latitude        DOUBLE PRECISION,
  longitude       DOUBLE PRECISION,
  image_url       TEXT,
  url             TEXT,
  price           TEXT,
  updated_at      TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH connections AS (
    SELECT DISTINCT them.user_id
    FROM public.conversation_members me
    JOIN public.conversation_members them
      ON them.conversation_id = me.conversation_id AND them.user_id <> me.user_id
    WHERE me.user_id = auth.uid() AND me.left_at IS NULL AND them.left_at IS NULL
  )
  SELECT w.user_id, p.first_name, p.main_photo_url, w.id, w.title, w.description, w.address,
         w.city, w.place_id, w.latitude, w.longitude, w.image_url, w.url, w.price, w.updated_at
  FROM connections c
  JOIN public.wishlist_items w ON w.user_id = c.user_id
  LEFT JOIN public.user_profiles p ON p.id = w.user_id
  WHERE auth.uid() IS NOT NULL
    AND w.archived_at IS NULL
    AND w.visited_at IS NULL
    AND private.wishlist_item_visible_to(w.id, auth.uid())
  ORDER BY w.updated_at DESC
  LIMIT 200;
$$;

REVOKE ALL ON FUNCTION public.get_wishlist_shared_with_me() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_wishlist_shared_with_me() TO authenticated;
