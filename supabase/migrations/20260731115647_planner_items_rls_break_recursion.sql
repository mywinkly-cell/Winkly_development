-- Break mutual RLS recursion between planner_items ↔ planner_participants.
-- createPlannerInvite inserts the invitee participant row, which previously
-- evaluated EXISTS(...planner_items...) under planner_items_select → infinite recursion.

CREATE OR REPLACE FUNCTION public.is_planner_participant(p_item_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.planner_participants
    WHERE planner_item_id = p_item_id AND user_id = p_user_id
  );
$$;

CREATE OR REPLACE FUNCTION public.is_planner_item_creator(p_item_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.planner_items
    WHERE id = p_item_id AND created_by = p_user_id
  );
$$;

CREATE OR REPLACE FUNCTION public.is_planner_invitee(p_item_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.planner_invitations
    WHERE planner_item_id = p_item_id AND invitee_id = p_user_id
  );
$$;

REVOKE ALL ON FUNCTION public.is_planner_participant(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_planner_item_creator(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_planner_invitee(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_planner_participant(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_planner_item_creator(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_planner_invitee(uuid, uuid) TO authenticated;

DROP POLICY IF EXISTS planner_items_select ON public.planner_items;
CREATE POLICY planner_items_select ON public.planner_items FOR SELECT USING (
  auth.uid() = created_by
  OR public.is_planner_participant(id, auth.uid())
  OR public.is_planner_invitee(id, auth.uid())
);

DROP POLICY IF EXISTS planner_participants_all ON public.planner_participants;
CREATE POLICY planner_participants_all ON public.planner_participants FOR ALL USING (
  auth.uid() = user_id
  OR public.is_planner_item_creator(planner_item_id, auth.uid())
)
WITH CHECK (
  auth.uid() = user_id
  OR public.is_planner_item_creator(planner_item_id, auth.uid())
);
