-- Run this against DEV as an authenticated user (set request.jwt.claims to a
-- real user id) AFTER applying the lockdown. It calls every object that used to
-- read the birthday column, to confirm none of them error under the revoke.
-- Any "permission denied for table user_profiles" here means a reader was
-- missed. Replace :uid with a real dev user id that has romance/friends data.
--
--   SET ROLE authenticated;
--   SELECT set_config('request.jwt.claims','{"sub":"<UID>","role":"authenticated"}', true);
--   \i supabase/tests/birthday_lockdown_smoke_dev.sql
SELECT 'public_profile_view' AS obj, count(*) FROM public.public_profile_view;
-- friend_profiles never read birthday and is untouched by the migration; queried
-- here only as a belt-and-braces confirmation that the revoke did not affect it.
SELECT 'friend_profiles' AS obj, count(*) FROM public.friend_profiles;
SELECT 'romance_new_matches' AS obj, count(*) FROM public.romance_new_matches(auth.uid());
SELECT 'romance_liked_profiles' AS obj, count(*) FROM public.romance_liked_profiles(auth.uid());
SELECT 'romance_likes_received' AS obj, count(*) FROM public.romance_likes_received(auth.uid());
SELECT 'romance_pending_chat_invites' AS obj, count(*) FROM public.romance_pending_chat_invites(auth.uid());
SELECT 'get_my_birthday' AS obj, public.get_my_birthday();
