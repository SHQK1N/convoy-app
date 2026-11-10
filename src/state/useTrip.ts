/**
 * My current trip + my pending trip invites, kept live.
 *
 *   const { trip, invites, loading, error, reload } = useTrip();
 *
 * Live updates come from Supabase Realtime (subscribeToTrips). Realtime can't filter DELETE
 * events (e.g. another member leaving), so we also refresh every TRIP_POLL_MS as a safety net.
 */
import { useCallback, useEffect, useState } from 'react';
import { getMyTrip, Invite, listMyInvites, subscribeToTrips, Trip } from '../services/trips';
import { useAuth } from './AuthProvider';

const TRIP_POLL_MS = 15000;

export function useTrip() {
  const { session } = useAuth();
  const me = session?.user.id;
  const [trip, setTrip] = useState<Trip | null>(null);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const reload = useCallback(async () => {
    if (!me) return;
    try {
      const [t, inv] = await Promise.all([getMyTrip(me), listMyInvites(me)]);
      setTrip(t);
      setInvites(inv);
      setError('');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [me]);

  const tripId = trip?.id ?? null;
  useEffect(() => {
    if (!me) return;
    reload();
    const unsubscribe = subscribeToTrips(me, tripId, reload);
    const timer = setInterval(reload, TRIP_POLL_MS);
    return () => {
      unsubscribe();
      clearInterval(timer);
    };
  }, [me, tripId, reload]);

  return { me, trip, invites, loading, error, reload };
}
