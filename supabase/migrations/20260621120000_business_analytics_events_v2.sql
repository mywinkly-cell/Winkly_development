-- business_analytics_events v2: canonical event types + metadata JSONB
-- event_type: offer_impression | offer_tap | profile_view | add_to_planner

ALTER TABLE public.business_analytics_events
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

UPDATE public.business_analytics_events
SET metadata =
  COALESCE(meta, '{}'::jsonb)
  || CASE WHEN viewer_id IS NOT NULL THEN jsonb_build_object('viewer_id', viewer_id) ELSE '{}'::jsonb END
  || CASE WHEN offer_id IS NOT NULL THEN jsonb_build_object('offer_id', offer_id) ELSE '{}'::jsonb END
WHERE metadata = '{}'::jsonb
   OR metadata IS NULL;

UPDATE public.business_analytics_events
SET event_type = 'offer_tap'
WHERE event_type = 'offer_click';

DELETE FROM public.business_analytics_events
WHERE event_type NOT IN ('offer_impression', 'offer_tap', 'profile_view', 'add_to_planner');

ALTER TABLE public.business_analytics_events DROP COLUMN IF EXISTS meta;
ALTER TABLE public.business_analytics_events DROP COLUMN IF EXISTS viewer_id;
ALTER TABLE public.business_analytics_events DROP COLUMN IF EXISTS offer_id;

ALTER TABLE public.business_analytics_events
  DROP CONSTRAINT IF EXISTS business_analytics_events_event_type_check;

ALTER TABLE public.business_analytics_events
  ADD CONSTRAINT business_analytics_events_event_type_check
  CHECK (event_type IN ('offer_impression', 'offer_tap', 'profile_view', 'add_to_planner'));

COMMENT ON TABLE public.business_analytics_events IS
  'Per-business engagement: profile views, offer impressions/taps, add-to-planner conversions.';
COMMENT ON COLUMN public.business_analytics_events.metadata IS
  'Optional context: viewer_id, offer_id, source, planner_item_id, etc.';

CREATE OR REPLACE FUNCTION public.record_business_analytics_event(
  p_business_id UUID,
  p_event_type TEXT,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
  v_viewer_id UUID := auth.uid();
  v_meta JSONB;
BEGIN
  IF v_viewer_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_event_type NOT IN ('offer_impression', 'offer_tap', 'profile_view', 'add_to_planner') THEN
    RAISE EXCEPTION 'Invalid event_type: %', p_event_type;
  END IF;

  v_meta := COALESCE(p_metadata, '{}'::jsonb);
  IF NOT (v_meta ? 'viewer_id') THEN
    v_meta := v_meta || jsonb_build_object('viewer_id', v_viewer_id);
  END IF;

  INSERT INTO public.business_analytics_events (business_id, event_type, metadata)
  VALUES (p_business_id, p_event_type, v_meta)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.record_business_analytics_event(UUID, TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_business_analytics_event(UUID, TEXT, JSONB) TO authenticated;
