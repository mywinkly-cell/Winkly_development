-- ─────────────────────────────────────────────────────────────────────────────
-- Create Fake Romance Match for Testing
-- Run this in Supabase SQL Editor to add a match + DM for chat testing
-- ─────────────────────────────────────────────────────────────────────────────
--
-- INSTRUCTIONS:
-- 1. Go to Supabase Dashboard → Authentication → Users
-- 2. Copy YOUR user ID (the one you're logged in as)
-- 3. Replace the placeholder below with your ID
-- 4. Run the script
--
-- Note: You need at least 2 users. Create a second test account if needed.
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  my_id UUID;
  other_id UUID;
  chat_id UUID;
BEGIN
  -- ═══════════════════════════════════════════════════════════════════════════
  -- REPLACE THIS with your actual user ID from Supabase Auth → Users
  -- ═══════════════════════════════════════════════════════════════════════════
  my_id := '00000000-0000-0000-0000-000000000000'::UUID;

  -- Find another user to match with (any user except yourself)
  SELECT u.id INTO other_id
  FROM auth.users u
  WHERE u.id != my_id
  LIMIT 1;

  IF other_id IS NULL THEN
    RAISE EXCEPTION 'No other user found. Create a second test account (different email) first, then run this script again.';
  END IF;

  -- Insert mutual likes (idempotent)
  INSERT INTO public.romance_likes (liker_id, liked_id)
  VALUES (my_id, other_id)
  ON CONFLICT (liker_id, liked_id) DO NOTHING;

  INSERT INTO public.romance_likes (liker_id, liked_id)
  VALUES (other_id, my_id)
  ON CONFLICT (liker_id, liked_id) DO NOTHING;

  -- Create the direct chat (match source)
  chat_id := public.create_direct_chat(
    my_id, other_id, 'romance'::app_mode, 'match'::dm_source, my_id
  );

  RAISE NOTICE 'Fake match created. Chat ID: % | Matched with user: %', chat_id, other_id;
END $$;
