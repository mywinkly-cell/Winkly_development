-- Winkly — local/staging seed data
--
-- Loaded automatically by `supabase db reset` (see [db.seed] in config.toml).
-- NEVER run this against production: it inserts fake auth users with known passwords.
-- All inserts are idempotent (ON CONFLICT DO NOTHING) so repeated resets are safe.
--
-- Test users (email / password):
--   alex@winkly.test    / Password123!   (personal, premium)
--   sam@winkly.test     / Password123!   (personal, free)
--   bizowner@winkly.test/ Password123!   (business)

-- ---------------------------------------------------------------------------
-- 1. Auth users. The public.users row is created by the on_auth_user_created
--    trigger (handle_new_user), so we only insert into auth.users here.
-- ---------------------------------------------------------------------------
INSERT INTO auth.users (
  instance_id, id, aud, role, email,
  encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
)
VALUES
  (
    '00000000-0000-0000-0000-000000000000',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'authenticated', 'authenticated', 'alex@winkly.test',
    crypt('Password123!', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}',
    '{"account_type":"personal"}',
    now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    'authenticated', 'authenticated', 'sam@winkly.test',
    crypt('Password123!', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}',
    '{"account_type":"personal"}',
    now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    'authenticated', 'authenticated', 'bizowner@winkly.test',
    crypt('Password123!', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}',
    '{"account_type":"business"}',
    now(), now()
  )
ON CONFLICT (id) DO NOTHING;

-- Email identities (required by GoTrue for email/password sign-in).
INSERT INTO auth.identities (
  id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
)
VALUES
  (
    gen_random_uuid(), 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","email":"alex@winkly.test"}',
    'email', now(), now(), now()
  ),
  (
    gen_random_uuid(), 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    '{"sub":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb","email":"sam@winkly.test"}',
    'email', now(), now(), now()
  ),
  (
    gen_random_uuid(), 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    '{"sub":"cccccccc-cccc-4ccc-8ccc-cccccccccccc","email":"bizowner@winkly.test"}',
    'email', now(), now(), now()
  )
ON CONFLICT (provider, provider_id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2. Tier / account flags on public.users (trigger seeds the base row).
-- ---------------------------------------------------------------------------
UPDATE public.users
SET subscription_tier = 'premium', is_premium = true
WHERE id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

UPDATE public.users
SET subscription_tier = 'free', is_premium = false
WHERE id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

UPDATE public.users
SET account_type = 'business'
WHERE id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

-- ---------------------------------------------------------------------------
-- 3. Personal core profiles.
-- ---------------------------------------------------------------------------
INSERT INTO public.profiles_core (id, first_name, last_name, gender, birthday, city, occupation, bio)
VALUES
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Alex', 'Rivera', 'female', '1995-04-12', 'Lisbon', 'Designer', 'Coffee, hikes, and live music.'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Sam', 'Okafor', 'male', '1993-09-30', 'Lisbon', 'Engineer', 'Always up for a spontaneous plan.')
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 4. Mode sub-profiles (drive the Identity Firewall permissions).
-- ---------------------------------------------------------------------------
INSERT INTO public.sub_profiles (user_id, mode, bio, interests)
VALUES
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'romance', 'Looking for a genuine connection.', ARRAY['music','travel','food']),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'friends', 'New in town, want to meet people.', ARRAY['hiking','board games']),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'romance', 'Engineer who loves the outdoors.', ARRAY['cycling','climbing']),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'friends', 'Down for coffee and code.', ARRAY['coffee','tech'])
ON CONFLICT (user_id, mode) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 5. Business profile.
-- ---------------------------------------------------------------------------
INSERT INTO public.profiles_business (id, business_name, location, bio, tags)
VALUES
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'Rooftop Lounge', 'Lisbon', 'Cocktails with a view.', ARRAY['bar','events','nightlife'])
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 6. A public event + participant.
-- ---------------------------------------------------------------------------
INSERT INTO public.events (id, created_by, title, description, location, starts_at, visibility, mode)
VALUES
  (
    'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    'Sunset Rooftop Mixer',
    'Casual drinks and meet new people downtown.',
    'Rooftop Lounge, Lisbon',
    now() + interval '7 days',
    'public', 'events'
  )
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.event_participants (event_id, user_id, role, rsvp_status)
VALUES
  ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'attendee', 'going')
ON CONFLICT (event_id, user_id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 7. A planner item owned by Alex, linked to the event.
-- ---------------------------------------------------------------------------
INSERT INTO public.planner_items (created_by, source_mode, title, description, starts_at, related_event_id)
SELECT
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'events', 'Sunset Rooftop Mixer',
  'RSVP confirmed — bring a friend.', now() + interval '7 days',
  'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
WHERE NOT EXISTS (
  SELECT 1 FROM public.planner_items
  WHERE created_by = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    AND related_event_id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
);
