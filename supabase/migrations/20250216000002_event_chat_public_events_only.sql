-- ─────────────────────────────────────────────────────────────────────────────
-- Event chats: only for public Events-mode events; host opts in
-- Dates/meetings/meetups from Romance/Friends/Business chat keep their original
-- chat; no duplicate event chat. Event chats are group-only, auto-created when
-- host enables "Allow a group chat for this event" and participants join/interested.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Default chat_enabled to false (host must opt in when creating the event)
CREATE OR REPLACE FUNCTION public.ensure_event_chat_settings()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.event_chat_settings (event_id, chat_enabled)
  VALUES (NEW.id, false)
  ON CONFLICT (event_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Only create/add to event chat for public events listed in Events mode
CREATE OR REPLACE FUNCTION public.maybe_create_event_chat()
RETURNS TRIGGER AS $$
DECLARE
  v_event RECORD;
  v_settings RECORD;
  v_exists UUID;
BEGIN
  -- Only consider going / interested (and legacy accepted)
  IF NEW.rsvp_status NOT IN ('accepted', 'going', 'interested') THEN
    RETURN NEW;
  END IF;

  -- Restrict to public events created in Events mode (not dates/meetings/meetups from other modes)
  SELECT e.id, e.visibility, e.mode INTO v_event
  FROM public.events e
  WHERE e.id = NEW.event_id;

  IF v_event.id IS NULL OR v_event.visibility IS DISTINCT FROM 'public' OR v_event.mode IS DISTINCT FROM 'events' THEN
    RETURN NEW;
  END IF;

  -- Check if chat is enabled for this event (host opted in)
  SELECT chat_enabled INTO v_settings
  FROM public.event_chat_settings
  WHERE event_id = NEW.event_id;

  IF v_settings.chat_enabled = false THEN
    RETURN NEW;
  END IF;

  -- Create event chat if not exists, or add this user as member
  SELECT id INTO v_exists
  FROM public.conversations
  WHERE related_event_id = NEW.event_id AND type = 'event'
  LIMIT 1;

  IF v_exists IS NULL THEN
    PERFORM public.create_event_chat(NEW.event_id);
  ELSE
    INSERT INTO public.conversation_members (conversation_id, user_id, role)
    SELECT v_exists, NEW.user_id, 'member'
    WHERE NOT EXISTS (
      SELECT 1 FROM public.conversation_members
      WHERE conversation_id = v_exists AND user_id = NEW.user_id
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. create_event_chat: only for public Events-mode events; include interested in participants
CREATE OR REPLACE FUNCTION public.create_event_chat(p_event_id UUID)
RETURNS UUID AS $$
DECLARE
  v_event RECORD;
  v_chat_id UUID;
  v_participant RECORD;
BEGIN
  SELECT id, created_by, title, mode, visibility INTO v_event
  FROM public.events WHERE id = p_event_id;

  IF v_event.id IS NULL THEN
    RAISE EXCEPTION 'Event not found';
  END IF;

  -- Only allow event group chat for public events in Events mode
  IF v_event.visibility IS DISTINCT FROM 'public' OR v_event.mode IS DISTINCT FROM 'events' THEN
    RAISE EXCEPTION 'Event chat is only allowed for public events in Events mode';
  END IF;

  INSERT INTO public.conversations (
    type, mode, created_by, related_event_id, name, is_system
  ) VALUES (
    'event', v_event.mode, v_event.created_by, p_event_id,
    'Event: ' || v_event.title, false
  ) RETURNING id INTO v_chat_id;

  INSERT INTO public.conversation_members (conversation_id, user_id, role)
  VALUES (v_chat_id, v_event.created_by, 'owner');

  -- Add participants who are going or interested (and legacy accepted)
  FOR v_participant IN
    SELECT user_id FROM public.event_participants
    WHERE event_id = p_event_id AND rsvp_status IN ('accepted', 'going', 'interested')
  LOOP
    INSERT INTO public.conversation_members (conversation_id, user_id, role)
    VALUES (v_chat_id, v_participant.user_id, 'member')
    ON CONFLICT (conversation_id, user_id) DO NOTHING;
  END LOOP;

  RETURN v_chat_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
