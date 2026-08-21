-- Track the device-calendar event written for each participant's own confirmed planner item.
-- Scoped to planner_participants (not planner_items) because sync is per user/device: an
-- inviter and an invitee each write their own copy to their own phone's calendar, so a single
-- column on the shared planner_items row can't hold both. Nullable; only set when the
-- participant has calendar sync enabled and the OS write succeeds. Best-effort, not authoritative
-- (the device calendar, not this column, is the source of truth for what's on the user's phone).
ALTER TABLE public.planner_participants
  ADD COLUMN IF NOT EXISTS device_calendar_event_id TEXT;

COMMENT ON COLUMN public.planner_participants.device_calendar_event_id IS
  'expo-calendar event id written to this participant''s device calendar, when they have calendar sync enabled. Best-effort; used to avoid duplicate writes on backfill.';
