-- =====================================================================
-- Convoy app — sign-up profile creation + safer friend rules
-- Run AFTER 0001_init.sql (SQL Editor → paste → Run).
-- =====================================================================

-- ---------- profile is created automatically on sign-up ---------------
-- The app passes username + display name as sign-up metadata
-- (src/services/auth.ts → signUp). This trigger turns that into a profiles row,
-- in the same transaction as the account, so there is never an account without a profile.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, username, display_name)
  values (
    new.id,
    lower(new.raw_user_meta_data->>'username'),
    coalesce(nullif(trim(new.raw_user_meta_data->>'display_name'), ''), new.raw_user_meta_data->>'username')
  );
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- The app no longer inserts profiles itself.
drop policy if exists profiles_insert on public.profiles;

-- ---------- username availability (callable before signing in) -------
create or replace function public.username_available(name text)
returns boolean language sql security definer stable set search_path = public as $$
  select not exists (select 1 from profiles where username = lower(name));
$$;
grant execute on function public.username_available(text) to anon, authenticated;

-- ---------- friendships: split the catch-all policy -------------------
-- Before: either person could do anything. Now:
--   * read:   either person
--   * create: only as the requester, only as 'pending'
--   * accept: only the person who did NOT send the request
--   * delete: either person (decline, cancel, or unfriend)
drop policy if exists friendships_rw on public.friendships;

create policy friendships_read on public.friendships for select to authenticated
  using (auth.uid() in (user_a, user_b));

create policy friendships_insert on public.friendships for insert to authenticated
  with check (requested_by = auth.uid() and auth.uid() in (user_a, user_b) and status = 'pending');

create policy friendships_accept on public.friendships for update to authenticated
  using (auth.uid() in (user_a, user_b) and requested_by <> auth.uid())
  with check (status = 'accepted');

create policy friendships_delete on public.friendships for delete to authenticated
  using (auth.uid() in (user_a, user_b));

-- Live updates on the friends screen (new requests appear without refreshing).
alter publication supabase_realtime add table public.friendships;
