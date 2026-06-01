-- ────────────────────────────────────────────────
-- Winkly — `dates` view (activity-planning differentiator)
--
-- Romance "dates" are stored as planner_items (source_mode = 'romance' with a
-- related_user_id) plus a planner_invitations row carrying the accept/decline
-- status. Rather than introduce a parallel `dates` table that would fragment
-- the planner data model, this view exposes a clean, query-friendly shape over
-- the existing tables for "match → confirmed plan" reads.
--
-- security_invoker = on so the querying user only sees dates they are part of,
-- via the underlying RLS on planner_items / planner_invitations.
-- ────────────────────────────────────────────────

DROP VIEW IF EXISTS public.dates;

CREATE VIEW public.dates AS
SELECT
  pi.id                       AS id,
  pi.created_by               AS proposer_id,
  pi.related_user_id          AS invitee_id,
  pi.title                    AS title,
  pi.starts_at                AS starts_at,
  pi.ends_at                  AS ends_at,
  (pi.meta ->> 'activity')    AS activity,
  (pi.meta ->> 'location')    AS location,
  (pi.meta ->> 'place')       AS place,
  inv.id                      AS invitation_id,
  COALESCE(inv.status, 'pending') AS status,
  pi.created_at               AS created_at,
  pi.updated_at               AS updated_at
FROM public.planner_items pi
LEFT JOIN public.planner_invitations inv
  ON inv.planner_item_id = pi.id
WHERE pi.source_mode = 'romance'
  AND pi.related_user_id IS NOT NULL;

ALTER VIEW public.dates SET (security_invoker = on);
GRANT SELECT ON public.dates TO authenticated;
