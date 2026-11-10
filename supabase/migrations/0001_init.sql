-- =====================================================================
-- Convoy app — initial schema
-- Run in Supabase: Dashboard → SQL Editor → paste → Run.
-- See docs/ARCHITECTURE.md §Database for the overview.
-- =====================================================================

-- ---------- profiles ------------------------------------------------
-- One row per account. id matches auth.users.id.
create table public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  username     text unique not null check (username ~ '^[a-z0-9_]{3,20}$'),
  display_name text not null,
  colour       text not null default '#FF4F28',   -- dot colour on the map
  created_at   timestamptz not null default now()
);

-- ---------- friendships ---------------------------------------------
-- One row per pair. user_a < user_b keeps the pair unique regardless of who asked.
create table public.friendships (
  user_a       uuid not null references public.profiles(id) on delete cascade,
  user_b       uuid not null references public.profiles(id) on delete cascade,
  requested_by uuid not null references public.profiles(id) on delete cascade,
  status       text not null default 'pending' check (status in ('pending','accepted')),
  created_at   timestamptz not null default now(),
  primary key (user_a, user_b),
  check (user_a < user_b)
);

-- ---------- trips ----------------------------------------------------
create table public.trips (
  id            uuid primary key default gen_random_uuid(),
  leader_id     uuid not null references public.profiles(id),
  dest_lat      double precision,
  dest_lng      double precision,
  dest_label    text,
  route_geojson jsonb,             -- shared route line, set when destination/stops change
  -- Per-trip thresholds; defaults mirror src/config.ts
  settings      jsonb not null default
    '{"maxCars":5,"behindKm":5,"behindMinutes":10,"offRouteMeters":300}'::jsonb,
  created_at    timestamptz not null default now()
);

create table public.trip_members (
  trip_id      uuid not null references public.trips(id) on delete cascade,
  user_id      uuid not null references public.profiles(id) on delete cascade,
  joined_at    timestamptz not null default now(),
  -- Last known position, written every ~30 s (live positions go over Realtime, not here)
  last_lat     double precision,
  last_lng     double precision,
  last_speed   double precision,   -- metres / second
  last_heading double precision,   -- degrees
  last_seen_at timestamptz,
  primary key (trip_id, user_id)
);

create table public.trip_invites (
  id         uuid primary key default gen_random_uuid(),
  trip_id    uuid not null references public.trips(id) on delete cascade,
  from_user  uuid not null references public.profiles(id) on delete cascade,
  to_user    uuid not null references public.profiles(id) on delete cascade,
  status     text not null default 'pending' check (status in ('pending','accepted','declined')),
  created_at timestamptz not null default now(),
  unique (trip_id, to_user)
);

create table public.trip_stops (
  id         uuid primary key default gen_random_uuid(),
  trip_id    uuid not null references public.trips(id) on delete cascade,
  added_by   uuid not null references public.profiles(id),
  lat        double precision not null,
  lng        double precision not null,
  label      text,
  kind       text not null check (kind in ('halt','waypoint')),
  created_at timestamptz not null default now()
);

-- ---------- helper ---------------------------------------------------
create or replace function public.is_trip_member(t uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from trip_members where trip_id = t and user_id = auth.uid());
$$;

-- ---------- row-level security ---------------------------------------
alter table public.profiles     enable row level security;
alter table public.friendships  enable row level security;
alter table public.trips        enable row level security;
alter table public.trip_members enable row level security;
alter table public.trip_invites enable row level security;
alter table public.trip_stops   enable row level security;

-- Profiles: any signed-in user can read (needed for username search); you edit only your own.
create policy profiles_read   on public.profiles for select to authenticated using (true);
create policy profiles_insert on public.profiles for insert to authenticated with check (id = auth.uid());
create policy profiles_update on public.profiles for update to authenticated using (id = auth.uid());

-- Friendships: you see and change only pairs you are part of.
create policy friendships_rw on public.friendships for all to authenticated
  using (auth.uid() in (user_a, user_b)) with check (auth.uid() in (user_a, user_b));

-- Trips: members read; anyone creates (as leader); only the leader updates (destination).
create policy trips_read   on public.trips for select to authenticated using (public.is_trip_member(id) or leader_id = auth.uid());
create policy trips_insert on public.trips for insert to authenticated with check (leader_id = auth.uid());
create policy trips_update on public.trips for update to authenticated using (leader_id = auth.uid());

-- Members: members see each other; you update only your own row (last position).
create policy members_read   on public.trip_members for select to authenticated using (public.is_trip_member(trip_id));
create policy members_update on public.trip_members for update to authenticated using (user_id = auth.uid());
-- Joining and leaving go through the functions below, not direct inserts/deletes.

-- Invites: sender and receiver see them; members send; receiver answers.
create policy invites_read   on public.trip_invites for select to authenticated using (auth.uid() in (from_user, to_user));
create policy invites_insert on public.trip_invites for insert to authenticated
  with check (from_user = auth.uid() and public.is_trip_member(trip_id));
create policy invites_update on public.trip_invites for update to authenticated using (to_user = auth.uid());

-- Stops: any member reads and adds.
create policy stops_read   on public.trip_stops for select to authenticated using (public.is_trip_member(trip_id));
create policy stops_insert on public.trip_stops for insert to authenticated
  with check (added_by = auth.uid() and public.is_trip_member(trip_id));

-- ---------- functions (atomic trip actions) --------------------------

-- Create a trip and add the creator as first member.
create or replace function public.create_trip()
returns uuid language plpgsql security definer set search_path = public as $$
declare new_id uuid;
begin
  insert into trips (leader_id) values (auth.uid()) returning id into new_id;
  insert into trip_members (trip_id, user_id) values (new_id, auth.uid());
  return new_id;
end $$;

-- Accept an invite: checks the car cap, then joins.
create or replace function public.accept_invite(invite uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare inv trip_invites; cap int; n int;
begin
  select * into inv from trip_invites where id = invite and to_user = auth.uid() and status = 'pending' for update;
  if not found then raise exception 'invite not found'; end if;

  select (settings->>'maxCars')::int into cap from trips where id = inv.trip_id for update;
  if cap is null then raise exception 'trip no longer exists'; end if;
  select count(*) into n from trip_members where trip_id = inv.trip_id;
  if n >= cap then raise exception 'trip is full (% cars)', cap; end if;

  update trip_invites set status = 'accepted' where id = invite;
  insert into trip_members (trip_id, user_id) values (inv.trip_id, auth.uid()) on conflict do nothing;
  return inv.trip_id;
end $$;

-- Leave a trip.
--  * Last member out → the trip is deleted ("lobby dies").
--  * Leader leaves with others still in → earliest-joined remaining member becomes leader.
create or replace function public.leave_trip(t uuid)
returns void language plpgsql security definer set search_path = public as $$
declare next_leader uuid;
begin
  perform 1 from trips where id = t for update;          -- lock the trip row
  delete from trip_members where trip_id = t and user_id = auth.uid();

  select user_id into next_leader from trip_members
    where trip_id = t order by joined_at asc limit 1;

  if next_leader is null then
    delete from trips where id = t;
  else
    update trips set leader_id = next_leader
      where id = t and leader_id = auth.uid();
  end if;
end $$;

grant execute on function public.create_trip()      to authenticated;
grant execute on function public.accept_invite(uuid) to authenticated;
grant execute on function public.leave_trip(uuid)    to authenticated;

-- Realtime: let phones get notified of changes to these tables.
alter publication supabase_realtime add table public.trips, public.trip_members, public.trip_stops, public.trip_invites;
