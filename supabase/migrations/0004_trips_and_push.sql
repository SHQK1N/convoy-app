-- =====================================================================
-- Convoy app — trips milestone + push notifications
-- Run AFTER 0003 (SQL Editor → paste → Run).
--
--  1. One active trip per person.
--  2. invite_to_trip(): only trip members can invite, only their friends; re-inviting works.
--  3. Invitees can see the trip they're invited to (leader, destination).
--  4. accept_invite(): refuses if you're already in a trip; clears your other pending invites.
--  5. leave_trip(): also removes your old invite so you can be invited again later.
--  6. Push notifications: phones save their Expo push token; the database sends a push
--     (via Expo's free push service) for new trip invites and friend requests.
-- =====================================================================

-- ---------- 1. one trip at a time ------------------------------------
create unique index if not exists trip_members_one_trip on public.trip_members (user_id);

-- ---------- 2. inviting ----------------------------------------------
-- Direct inserts are replaced by this function (it can also re-open a declined invite).
drop policy if exists invites_insert on public.trip_invites;

create or replace function public.invite_to_trip(t uuid, friend uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from trip_members where trip_id = t and user_id = auth.uid()) then
    raise exception 'You are not in this trip.';
  end if;
  if not exists (
    select 1 from friendships
    where status = 'accepted'
      and user_a = least(auth.uid(), friend) and user_b = greatest(auth.uid(), friend)
  ) then
    raise exception 'You can only invite friends.';
  end if;
  if exists (select 1 from trip_members where trip_id = t and user_id = friend) then
    raise exception 'They are already in this trip.';
  end if;

  insert into trip_invites (trip_id, from_user, to_user, status)
  values (t, auth.uid(), friend, 'pending')
  on conflict (trip_id, to_user)
    do update set status = 'pending', from_user = excluded.from_user, created_at = now();
end $$;

-- ---------- 3. invitees can read the trip ----------------------------
create policy trips_read_invited on public.trips for select to authenticated
  using (exists (
    select 1 from trip_invites i
    where i.trip_id = trips.id and i.to_user = auth.uid() and i.status = 'pending'
  ));

-- ---------- 4. accepting ---------------------------------------------
create or replace function public.create_trip()
returns uuid language plpgsql security definer set search_path = public as $$
declare new_id uuid;
begin
  if exists (select 1 from trip_members where user_id = auth.uid()) then
    raise exception 'You are already in a trip. Leave it first.';
  end if;
  insert into trips (leader_id) values (auth.uid()) returning id into new_id;
  insert into trip_members (trip_id, user_id) values (new_id, auth.uid());
  return new_id;
end $$;

create or replace function public.accept_invite(invite uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare inv trip_invites; cap int; n int;
begin
  select * into inv from trip_invites where id = invite and to_user = auth.uid() and status = 'pending' for update;
  if not found then raise exception 'This invite is no longer valid.'; end if;

  if exists (select 1 from trip_members where user_id = auth.uid()) then
    raise exception 'You are already in a trip. Leave it first.';
  end if;

  select (settings->>'maxCars')::int into cap from trips where id = inv.trip_id for update;
  if cap is null then raise exception 'That trip has ended.'; end if;
  select count(*) into n from trip_members where trip_id = inv.trip_id;
  if n >= cap then raise exception 'That trip is full (% cars).', cap; end if;

  update trip_invites set status = 'accepted' where id = invite;
  -- You can only be in one trip, so any other open invites are declined.
  update trip_invites set status = 'declined'
    where to_user = auth.uid() and status = 'pending' and id <> invite;
  insert into trip_members (trip_id, user_id) values (inv.trip_id, auth.uid());
  return inv.trip_id;
end $$;

-- ---------- 5. leaving -----------------------------------------------
create or replace function public.leave_trip(t uuid)
returns void language plpgsql security definer set search_path = public as $$
declare next_leader uuid;
begin
  perform 1 from trips where id = t for update;
  delete from trip_members where trip_id = t and user_id = auth.uid();
  delete from trip_invites where trip_id = t and to_user = auth.uid();

  select user_id into next_leader from trip_members
    where trip_id = t order by joined_at asc limit 1;

  if next_leader is null then
    delete from trips where id = t;            -- last one out: lobby dies
  else
    update trips set leader_id = next_leader   -- leader left: hand over
      where id = t and leader_id = auth.uid();
  end if;
end $$;

-- ---------- 6. push notifications ------------------------------------
create extension if not exists pg_net with schema extensions;

-- Kept out of `profiles` on purpose: profiles are readable by every user, tokens must not be.
create table if not exists public.push_tokens (
  user_id    uuid primary key references public.profiles(id) on delete cascade,
  token      text not null,
  updated_at timestamptz not null default now()
);
alter table public.push_tokens enable row level security;
create policy push_tokens_own on public.push_tokens for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Send one push via Expo's push service. Fire-and-forget (pg_net is async; never blocks the insert).
create or replace function public.notify_user(uid uuid, title text, body text, data jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare t text;
begin
  select token into t from push_tokens where user_id = uid;
  if t is null then return; end if;   -- no token (Expo Go, web, or notifications off)
  perform net.http_post(
    url     := 'https://exp.host/--/api/v2/push/send',
    body    := jsonb_build_object('to', t, 'title', title, 'body', body, 'data', data, 'sound', 'default'),
    headers := '{"Content-Type": "application/json"}'::jsonb
  );
end $$;

-- New (or re-opened) trip invite → push to the invitee.
create or replace function public.on_trip_invite()
returns trigger language plpgsql security definer set search_path = public as $$
declare who text; dest text;
begin
  if new.status <> 'pending' or (tg_op = 'UPDATE' and old.status = 'pending') then return new; end if;
  select display_name into who from profiles where id = new.from_user;
  select dest_label into dest from trips where id = new.trip_id;
  perform notify_user(
    new.to_user,
    'Trip invite',
    who || ' invited you to a trip' || coalesce(' to ' || dest, '') || '.',
    jsonb_build_object('type', 'trip_invite', 'tripId', new.trip_id)
  );
  return new;
end $$;

drop trigger if exists trip_invite_push on public.trip_invites;
create trigger trip_invite_push after insert or update of status on public.trip_invites
  for each row execute function public.on_trip_invite();

-- New friend request → push to the other person.
create or replace function public.on_friend_request()
returns trigger language plpgsql security definer set search_path = public as $$
declare who text; other uuid;
begin
  other := case when new.requested_by = new.user_a then new.user_b else new.user_a end;
  select display_name into who from profiles where id = new.requested_by;
  perform notify_user(other, 'Friend request', who || ' wants to add you as a friend.',
                      jsonb_build_object('type', 'friend_request'));
  return new;
end $$;

drop trigger if exists friend_request_push on public.friendships;
create trigger friend_request_push after insert on public.friendships
  for each row execute function public.on_friend_request();

-- ---------- permissions ------------------------------------------------
revoke execute on function public.invite_to_trip(uuid, uuid) from public, anon;
grant  execute on function public.invite_to_trip(uuid, uuid) to authenticated;
revoke execute on function public.create_trip()       from public, anon;
revoke execute on function public.accept_invite(uuid) from public, anon;
revoke execute on function public.leave_trip(uuid)   from public, anon;
grant  execute on function public.create_trip()       to authenticated;
grant  execute on function public.accept_invite(uuid) to authenticated;
grant  execute on function public.leave_trip(uuid)    to authenticated;
-- Internal only: nobody calls these directly.
revoke execute on function public.notify_user(uuid, text, text, jsonb) from public, anon, authenticated;
revoke execute on function public.on_trip_invite()    from public, anon, authenticated;
revoke execute on function public.on_friend_request() from public, anon, authenticated;
