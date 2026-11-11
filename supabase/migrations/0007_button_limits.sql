-- =====================================================================
-- Convoy app — stop people spamming breaks
-- Run AFTER 0006 (SQL Editor → paste → Run).
--
-- The app already disables the buttons for a while after use (src/config.ts → cooldowns), but a
-- modified app could ignore that. The database is the real referee for breaks:
--   * no new break while one is running
--   * no new break within 5 minutes of the last one ending (BREAK_COOLDOWN below)
--   * ending a break that isn't running does nothing
-- ("Slow down" / "I'm OK" are never stored; every phone ignores repeats from the same person.)
-- =====================================================================

alter table public.trips add column if not exists halt_ended_at timestamptz;

create or replace function public.set_halt(t uuid, h jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare cur jsonb; ended timestamptz;
  BREAK_COOLDOWN constant interval := interval '5 minutes';
begin
  if not exists (select 1 from trip_members where trip_id = t and user_id = auth.uid()) then
    raise exception 'You are not in this trip.';
  end if;

  select halt, halt_ended_at into cur, ended from trips where id = t for update;

  if h is null then
    if cur is not null then
      update trips set halt = null, halt_ended_at = now() where id = t;
    end if;
    return;
  end if;

  if cur is not null then
    raise exception 'A break is already on.';
  end if;
  if ended is not null and now() - ended < BREAK_COOLDOWN then
    raise exception 'The last break just ended. Next break possible in % min.',
      ceil(extract(epoch from (BREAK_COOLDOWN - (now() - ended))) / 60)::int;
  end if;

  update trips set halt = h where id = t;
end $$;

revoke execute on function public.set_halt(uuid, jsonb) from public, anon;
grant  execute on function public.set_halt(uuid, jsonb) to authenticated;
