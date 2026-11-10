-- =====================================================================
-- Convoy app — only signed-in users may call the trip functions
-- Run AFTER 0002 (SQL Editor → paste → Run).
--
-- Why: Postgres lets EVERYONE (role "public", which includes the signed-out "anon" role)
-- execute new functions by default. 0001 granted them to "authenticated" but never took
-- them away from "public", so a signed-out request could reach create_trip().
-- It failed only because leader_id was null — this closes it properly.
-- =====================================================================

revoke execute on function public.create_trip()        from public, anon;
revoke execute on function public.accept_invite(uuid)  from public, anon;
revoke execute on function public.leave_trip(uuid)     from public, anon;
revoke execute on function public.is_trip_member(uuid) from public, anon;
revoke execute on function public.handle_new_user()    from public, anon, authenticated;

grant execute on function public.create_trip()        to authenticated;
grant execute on function public.accept_invite(uuid)  to authenticated;
grant execute on function public.leave_trip(uuid)     to authenticated;
grant execute on function public.is_trip_member(uuid) to authenticated;

-- username_available stays open to anon on purpose: the sign-up screen checks names before an account exists.

-- From now on, new functions in this schema are NOT callable by everyone unless granted explicitly.
alter default privileges in schema public revoke execute on functions from public, anon;
