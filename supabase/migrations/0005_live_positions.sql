-- =====================================================================
-- Convoy app — private live channel per trip
-- Run AFTER 0004 (SQL Editor → paste → Run).
--
-- Live car positions are sent phone-to-phone over Supabase Realtime "broadcast" on a channel
-- named  trip:<trip id>  (src/services/live.ts). Without these rules anyone holding the public
-- app key who guessed a trip id could listen in. With them, only members of that trip can
-- send or receive on its channel ("private channel").
-- =====================================================================

-- Receive (and see presence = who is online)
create policy trip_channel_read on realtime.messages for select to authenticated
  using (
    realtime.topic() like 'trip:%'
    and public.is_trip_member((split_part(realtime.topic(), ':', 2))::uuid)
  );

-- Send (positions, presence)
create policy trip_channel_write on realtime.messages for insert to authenticated
  with check (
    realtime.topic() like 'trip:%'
    and public.is_trip_member((split_part(realtime.topic(), ':', 2))::uuid)
  );

-- Members save their last known position every ~30 s (for people who open the map later,
-- and to draw offline cars). They may only update their OWN position columns — this
-- already holds via members_update in 0001 (user_id = auth.uid()).

-- Leader saves the shared route line (trips.route_geojson) — already allowed by trips_update (leader only).
