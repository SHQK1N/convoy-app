-- =====================================================================
-- Convoy app — group breaks ("halt")
-- Run AFTER 0005 (SQL Editor → paste → Run).
--
-- Anyone in the trip can call a break; it's stored on the trip so every phone — including one
-- that was offline when it was called — sees the same break and the same stop.
-- Shape of trips.halt (set by the app, src/services/trips.ts → setHalt):
--   { id, by, byName, reason: 'toilet'|'fuel'|'food'|'rest', stop: {lat,lng,label,alongM}, at }
--   null = no break, keep driving.
-- =====================================================================

alter table public.trips add column if not exists halt jsonb;

-- Members (not just the leader) may start or end a break. Nobody has authority here (SPEC §4).
create or replace function public.set_halt(t uuid, h jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from trip_members where trip_id = t and user_id = auth.uid()) then
    raise exception 'You are not in this trip.';
  end if;
  update trips set halt = h where id = t;
end $$;

revoke execute on function public.set_halt(uuid, jsonb) from public, anon;
grant  execute on function public.set_halt(uuid, jsonb) to authenticated;
