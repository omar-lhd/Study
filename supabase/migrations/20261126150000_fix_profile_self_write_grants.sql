-- Allow authenticated users to create and edit only their own profile fields.
-- Existing RLS policies still enforce id = auth.uid() for INSERT/UPDATE.
-- Column grants intentionally exclude avatar_url and profile_metadata.
grant insert (id, display_name, username, bio) on table public.profiles to authenticated;
grant update (id, display_name, username, bio) on table public.profiles to authenticated;
