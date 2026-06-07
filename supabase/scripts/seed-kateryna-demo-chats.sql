-- Seed demo chat partners + 6 conversations for kateryna.my.wellness@gmail.com
-- Safe to re-run (fixed UUIDs, ON CONFLICT, create_direct_chat is idempotent).
-- Run via Supabase SQL editor or: supabase db execute (with service role).

DO $$
DECLARE
  v_kate UUID := 'de2f35cb-b0c3-47c5-8a7a-ad4b0a305332';
  v_sofia UUID := 'f1111111-1111-4111-8111-111111111101';
  v_marco UUID := 'f1111111-1111-4111-8111-111111111102';
  v_petra UUID := 'f1111111-1111-4111-8111-111111111103';
  v_lisa UUID := 'f1111111-1111-4111-8111-111111111104';
  v_hiker UUID := 'f1111111-1111-4111-8111-111111111105';
  v_group_id UUID := 'f2222222-2222-4222-8222-222222222201';
  v_event_id UUID := 'f2222222-2222-4222-8222-222222222202';
  v_chat UUID;
  v_now TIMESTAMPTZ := now();
BEGIN
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = v_kate) THEN
    RAISE EXCEPTION 'Kateryna account not found — sign in once with kateryna.my.wellness@gmail.com';
  END IF;

  -- ── Demo auth users ───────────────────────────────────────────────────────
  INSERT INTO auth.users (
    instance_id, id, aud, role, email,
    encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at
  ) VALUES
    ('00000000-0000-0000-0000-000000000000', v_sofia, 'authenticated', 'authenticated', 'sofia.demo@winkly-test.local', crypt('TestPassword123!', gen_salt('bf')), v_now, '{"provider":"email","providers":["email"]}', '{"account_type":"personal"}', v_now, v_now),
    ('00000000-0000-0000-0000-000000000000', v_marco, 'authenticated', 'authenticated', 'marco.demo@winkly-test.local', crypt('TestPassword123!', gen_salt('bf')), v_now, '{"provider":"email","providers":["email"]}', '{"account_type":"personal"}', v_now, v_now),
    ('00000000-0000-0000-0000-000000000000', v_petra, 'authenticated', 'authenticated', 'petra.demo@winkly-test.local', crypt('TestPassword123!', gen_salt('bf')), v_now, '{"provider":"email","providers":["email"]}', '{"account_type":"personal"}', v_now, v_now),
    ('00000000-0000-0000-0000-000000000000', v_lisa, 'authenticated', 'authenticated', 'lisa.demo@winkly-test.local', crypt('TestPassword123!', gen_salt('bf')), v_now, '{"provider":"email","providers":["email"]}', '{"account_type":"personal"}', v_now, v_now),
    ('00000000-0000-0000-0000-000000000000', v_hiker, 'authenticated', 'authenticated', 'hiker.demo@winkly-test.local', crypt('TestPassword123!', gen_salt('bf')), v_now, '{"provider":"email","providers":["email"]}', '{"account_type":"personal"}', v_now, v_now)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO auth.identities (id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  SELECT gen_random_uuid(), u.id::text, u.id,
    jsonb_build_object('sub', u.id::text, 'email', u.email),
    'email', v_now, v_now, v_now
  FROM auth.users u
  WHERE u.id IN (v_sofia, v_marco, v_petra, v_lisa, v_hiker)
    AND NOT EXISTS (
      SELECT 1 FROM auth.identities i WHERE i.user_id = u.id AND i.provider = 'email'
    );

  INSERT INTO public.user_profiles (id, first_name, last_name, city)
  VALUES
    (v_sofia, 'Sofia', 'Müller', 'Munich'),
    (v_marco, 'Marco', 'Rossi', 'Munich'),
    (v_petra, 'Petra', 'Müller', 'Munich'),
    (v_lisa, 'Lisa', 'Weber', 'Munich'),
    (v_hiker, 'Alex', 'Berg', 'Munich')
  ON CONFLICT (id) DO UPDATE SET
    first_name = EXCLUDED.first_name,
    last_name = EXCLUDED.last_name,
    city = EXCLUDED.city;

  INSERT INTO public.profiles_mode (user_id, mode, photos, interests, meta)
  SELECT u.id, m.mode, '{}'::text[], '{}'::text[], '{}'::jsonb
  FROM (VALUES (v_sofia), (v_marco), (v_petra), (v_lisa), (v_hiker)) AS u(id)
  CROSS JOIN (VALUES ('romance'::app_mode), ('friends'::app_mode), ('business'::app_mode)) AS m(mode)
  ON CONFLICT (user_id, mode) DO NOTHING;

  -- ── 1. Romance invite — Sofia ───────────────────────────────────────────
  v_chat := public.create_direct_chat(v_sofia, v_kate, 'romance'::app_mode, 'invite'::dm_source, v_sofia);
  UPDATE public.conversations
  SET romance_invite_status = 'pending', last_message_at = v_now - interval '25 minutes'
  WHERE id = v_chat;

  INSERT INTO public.romance_likes (liker_id, liked_id, super_like, super_like_message)
  VALUES (v_sofia, v_kate, true, 'Would love to chat!')
  ON CONFLICT (liker_id, liked_id) DO NOTHING;

  IF NOT EXISTS (SELECT 1 FROM public.messages WHERE conversation_id = v_chat LIMIT 1) THEN
    INSERT INTO public.messages (conversation_id, sender_id, content, message_type, created_at) VALUES
      (v_chat, v_sofia, 'Hey! I saw we have jazz in common 🎵', 'text', v_now - interval '2 hours'),
      (v_chat, v_sofia, 'Did you see that jazz event? 🎵', 'text', v_now - interval '25 minutes');
  END IF;

  -- ── 2. Friends DM — Marco ─────────────────────────────────────────────────
  INSERT INTO public.follows (follower_id, followee_id)
  VALUES (v_kate, v_marco), (v_marco, v_kate)
  ON CONFLICT DO NOTHING;

  v_chat := public.create_direct_chat(v_marco, v_kate, 'friends'::app_mode, 'connection'::dm_source, v_marco);
  UPDATE public.conversations SET last_message_at = v_now - interval '70 minutes' WHERE id = v_chat;

  IF NOT EXISTS (SELECT 1 FROM public.messages WHERE conversation_id = v_chat LIMIT 1) THEN
    INSERT INTO public.messages (conversation_id, sender_id, content, message_type, created_at) VALUES
      (v_chat, v_marco, 'Hike this Sunday? Count me in!', 'text', v_now - interval '70 minutes');
  END IF;

  -- ── 3. Friends group — Munich Hikers ─────────────────────────────────────
  INSERT INTO public.groups (id, created_by, name, mode)
  VALUES (v_group_id, v_kate, 'Group: Munich Hikers', 'friends'::app_mode)
  ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;

  INSERT INTO public.group_members (group_id, user_id, role)
  VALUES
    (v_group_id, v_kate, 'owner'),
    (v_group_id, v_marco, 'member'),
    (v_group_id, v_hiker, 'member')
  ON CONFLICT (group_id, user_id) DO NOTHING;

  SELECT c.id INTO v_chat FROM public.conversations c
  WHERE c.type = 'group' AND c.related_group_id = v_group_id LIMIT 1;

  IF v_chat IS NULL THEN
    INSERT INTO public.conversations (type, mode, created_by, related_group_id, name, last_message_at)
    VALUES ('group', 'friends', v_kate, v_group_id, 'Group: Munich Hikers', v_now - interval '1 day')
    RETURNING id INTO v_chat;
  END IF;

  INSERT INTO public.conversation_members (conversation_id, user_id, role)
  VALUES
    (v_chat, v_kate, 'owner'),
    (v_chat, v_marco, 'member'),
    (v_chat, v_hiker, 'member')
  ON CONFLICT (conversation_id, user_id) DO UPDATE SET left_at = NULL;

  IF NOT EXISTS (SELECT 1 FROM public.messages WHERE conversation_id = v_chat LIMIT 1) THEN
    INSERT INTO public.messages (conversation_id, sender_id, content, message_type, created_at) VALUES
      (v_chat, v_hiker, 'Trail looks great this weekend!', 'text', v_now - interval '1 day 2 hours'),
      (v_chat, v_kate, 'Looking forward to it!', 'text', v_now - interval '1 day');
    UPDATE public.conversations SET last_message_at = v_now - interval '1 day' WHERE id = v_chat;
  END IF;

  INSERT INTO public.conversation_member_settings (conversation_id, user_id, last_read_at)
  VALUES (v_chat, v_kate, v_now - interval '1 day')
  ON CONFLICT (conversation_id, user_id) DO UPDATE SET last_read_at = EXCLUDED.last_read_at;

  -- ── 4. Business DM — Petra ───────────────────────────────────────────────
  INSERT INTO public.follows (follower_id, followee_id)
  VALUES (v_kate, v_petra), (v_petra, v_kate)
  ON CONFLICT DO NOTHING;

  v_chat := public.create_direct_chat(v_petra, v_kate, 'business'::app_mode, 'connection'::dm_source, v_petra);
  UPDATE public.conversations SET last_message_at = v_now - interval '3 days' WHERE id = v_chat;

  IF NOT EXISTS (SELECT 1 FROM public.messages WHERE conversation_id = v_chat LIMIT 1) THEN
    INSERT INTO public.messages (conversation_id, sender_id, content, message_type, created_at) VALUES
      (v_chat, v_petra, 'Great meeting you at the event', 'text', v_now - interval '3 days');
  END IF;

  INSERT INTO public.conversation_member_settings (conversation_id, user_id, last_read_at)
  VALUES (v_chat, v_kate, v_now)
  ON CONFLICT (conversation_id, user_id) DO UPDATE SET last_read_at = EXCLUDED.last_read_at;

  -- ── 5. Romance match — Lisa ──────────────────────────────────────────────
  INSERT INTO public.romance_likes (liker_id, liked_id)
  VALUES (v_kate, v_lisa), (v_lisa, v_kate)
  ON CONFLICT (liker_id, liked_id) DO NOTHING;

  v_chat := public.create_direct_chat(v_lisa, v_kate, 'romance'::app_mode, 'match'::dm_source, v_lisa);
  UPDATE public.conversations
  SET romance_invite_status = 'accepted', dm_source = 'match'::dm_source,
      last_message_at = v_now - interval '5 days'
  WHERE id = v_chat;

  IF NOT EXISTS (SELECT 1 FROM public.messages WHERE conversation_id = v_chat LIMIT 1) THEN
    INSERT INTO public.messages (conversation_id, sender_id, content, message_type, created_at) VALUES
      (v_chat, v_lisa, 'Super liked you ⭐', 'text', v_now - interval '5 days 2 hours'),
      (v_chat, v_lisa, 'Your profile made me smile 😊', 'text', v_now - interval '5 days 1 hour'),
      (v_chat, v_lisa, 'Coffee sometime?', 'text', v_now - interval '5 days');
  END IF;

  -- ── 6. Event chat — Jazz Night ───────────────────────────────────────────
  INSERT INTO public.events (id, created_by, title, description, city, start_at, visibility, mode)
  VALUES (
    v_event_id, v_kate, 'Jazz Night', 'Live jazz at the Kulturzentrum',
    'Munich', '2026-06-12 20:30:00+02', 'public', 'events'
  )
  ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, visibility = 'public', mode = 'events';

  INSERT INTO public.event_participants (event_id, user_id, rsvp_status)
  VALUES (v_event_id, v_kate, 'going'), (v_event_id, v_sofia, 'going')
  ON CONFLICT (event_id, user_id) DO NOTHING;

  IF NOT EXISTS (SELECT 1 FROM public.conversations WHERE related_event_id = v_event_id) THEN
    v_chat := public.create_event_chat(v_event_id);
  ELSE
    SELECT id INTO v_chat FROM public.conversations WHERE related_event_id = v_event_id LIMIT 1;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.messages WHERE conversation_id = v_chat LIMIT 1) THEN
    INSERT INTO public.messages (conversation_id, sender_id, content, message_type, created_at) VALUES
      (v_chat, v_kate, 'Doors open at 20:30', 'text', v_now - interval '10 days');
    UPDATE public.conversations SET last_message_at = v_now - interval '10 days' WHERE id = v_chat;
  END IF;

  INSERT INTO public.conversation_member_settings (conversation_id, user_id, last_read_at)
  VALUES (v_chat, v_kate, v_now - interval '10 days')
  ON CONFLICT (conversation_id, user_id) DO UPDATE SET last_read_at = EXCLUDED.last_read_at;

  RAISE NOTICE 'Demo chats seeded for Kateryna. Pull-to-refresh Chats in the app.';
END $$;
