/**
 * Friends list for the signed-in user, kept live.
 *
 *   const { entries, loading, error, reload } = useFriends();
 *
 * Reloads automatically when any of my friendships change (Supabase Realtime).
 */
import { useCallback, useEffect, useState } from 'react';
import { FriendEntry, listFriends, subscribeToFriendships } from '../services/friends';
import { useAuth } from './AuthProvider';

export function useFriends() {
  const { session } = useAuth();
  const me = session?.user.id;
  const [entries, setEntries] = useState<FriendEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const reload = useCallback(async () => {
    if (!me) return;
    try {
      setEntries(await listFriends(me));
      setError('');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [me]);

  useEffect(() => {
    if (!me) return;
    reload();
    return subscribeToFriendships(me, reload);
  }, [me, reload]);

  return { me, entries, loading, error, reload };
}
