/**
 * Live car positions, phone-to-phone, over Supabase Realtime BROADCAST.
 *
 * One private channel per trip:  trip:<trip id>
 * Only members of that trip may join it (policies in 0005_live_positions.sql).
 * Messages are not stored anywhere — cheap and fast. The last position is ALSO saved to the
 * database every ~30 s by the location service, for phones that open the map later.
 *
 *   const live = await joinTripChannel(tripId, onPosition);
 *   live.send(fix);       // share my position
 *   live.leave();         // stop listening
 */
import { supabase } from './supabase';

/** One position report. Same shape everywhere (live messages, DB, simulator). */
export type PositionMessage = {
  userId: string;
  lat: number;
  lng: number;
  /** metres per second, null if unknown */
  speed: number | null;
  /** degrees, null if unknown */
  heading: number | null;
  /** epoch ms when the GPS fix was taken */
  at: number;
};

const EVENT = 'pos';

export async function joinTripChannel(
  tripId: string,
  onPosition: (p: PositionMessage) => void,
): Promise<{ send: (p: PositionMessage) => void; leave: () => void }> {
  // Private channels authorise with the user's login token.
  await supabase.realtime.setAuth();

  const channel = supabase
    .channel(`trip:${tripId}`, { config: { private: true, broadcast: { self: false } } })
    .on('broadcast', { event: EVENT }, ({ payload }) => {
      const p = payload as PositionMessage;
      if (typeof p?.lat === 'number' && typeof p?.lng === 'number' && p.userId) onPosition(p);
    });

  let joined = false;
  channel.subscribe((status) => {
    joined = status === 'SUBSCRIBED';
    if (__DEV__ && status !== 'SUBSCRIBED') console.log('[live] channel status:', status);
  });

  return {
    send: (p) => {
      if (joined) channel.send({ type: 'broadcast', event: EVENT, payload: p });
    },
    leave: () => {
      supabase.removeChannel(channel);
    },
  };
}
