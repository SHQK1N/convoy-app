/**
 * Pure friendship helpers (no network) — used by src/services/friends.ts, unit-tested in friendship.test.ts.
 *
 * The database stores one `friendships` row per pair with user_a < user_b,
 * and `requested_by` says who asked (supabase/migrations/0001_init.sql).
 */
import type { Profile } from '../services/auth';

export type FriendStatus = 'friend' | 'incoming' | 'outgoing';

export type FriendEntry = {
  profile: Profile;
  status: FriendStatus;
};

export type FriendshipRow = {
  user_a: string;
  user_b: string;
  requested_by: string;
  status: 'pending' | 'accepted';
  a: Profile;
  b: Profile;
};

/** Order a pair the way the database stores it. */
export function orderedPair(a: string, b: string): { user_a: string; user_b: string } {
  return a < b ? { user_a: a, user_b: b } : { user_a: b, user_b: a };
}

/** Turn raw friendship rows into the list the screen shows, from `me`'s point of view, sorted by name. */
export function toFriendEntries(rows: FriendshipRow[], me: string): FriendEntry[] {
  return rows
    .map((r): FriendEntry => {
      const other = r.user_a === me ? r.b : r.a;
      const status: FriendStatus =
        r.status === 'accepted' ? 'friend' : r.requested_by === me ? 'outgoing' : 'incoming';
      return { profile: other, status };
    })
    .sort((x, y) => x.profile.display_name.localeCompare(y.profile.display_name));
}
