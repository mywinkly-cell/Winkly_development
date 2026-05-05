-- Fix "Database error granting user" on login: run handle_new_user only on INSERT, not on UPDATE.
-- On login Supabase updates auth.users (e.g. last_sign_in_at), which was firing this trigger;
-- any failure in the trigger then caused Auth to return 500. Existing users already have a
-- row in public.users from signup, so we only need the trigger on new user creation.

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
