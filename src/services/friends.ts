/**
 * Friends list: search, request, accept, decline/remove, and live updates.
 *
 * Database shape (0001_init.sql): one `friendships` row per pair, stored with user_a < user_b
 * so the same two people can never have two rows. `requested_by` says who asked.
 * Who may do what is enforced by row-level security in 0002_signup_and_friends.sql.
 */
import { FriendEntry, FriendshipRow, orderedPair, toFriendEntries } from '../lib/friendship';
import type { Profile } from './auth';
import { friendlyError } from './auth';
import { supabase } from './supabase';

export type { FriendEntry, FriendStatus } from '../lib/friendship';

/** Everyone I'm connected to: friends, requests to me, and requests I've sent. */
export async function listFriends(me: string): Promise<FriendEntry[]> {
  const { data, error } = await supabase
    .from('friendships')
    .select(
      'user_a, user_b, requested_by, status,' +
        ' a:profiles!friendships_user_a_fkey(id, username, display_name, colour),' +
        ' b:profiles!friendships_user_b_fkey(id, username, display_name, colour)',
    )
    .or(`user_a.eq.${me},user_b.eq.${me}`);
  if (error) throw new Error(friendlyError(error.message));
  return toFriendEntries((data ?? []) as unknown as FriendshipRow[], me);
}

/** Find people by username prefix (case-insensitive). Excludes me. Max 20 results. */
export async function searchUsers(query: string, me: string): Promise<Profile[]> {
  const q = query.trim().toLowerCase().replace(/[%_\\]/g, (c) => '\\' + c); // escape LIKE wildcards
  if (q.length < 2) return [];
  const { data, error } = await supabase
    .from('profiles')
    .select('id, username, display_name, colour')
    .ilike('username', `${q}%`)
    .neq('id', me)
    .order('username')
    .limit(20);
  if (error) throw new Error(friendlyError(error.message));
  return data ?? [];
}

export async function sendRequest(me: string, other: string) {
  const { error } = await supabase
    .from('friendships')
    .insert({ ...orderedPair(me, other), requested_by: me, status: 'pending' });
  if (error) {
    if (error.code === '23505') throw new Error('You are already connected or a request is pending.');
    throw new Error(friendlyError(error.message));
  }
}

export async function acceptRequest(me: string, other: string) {
  const { error } = await supabase
    .from('friendships')
    .update({ status: 'accepted' })
    .match(orderedPair(me, other));
  if (error) throw new Error(friendlyError(error.message));
}

/** Decline an incoming request, cancel an outgoing one, or unfriend — all the same delete. */
export async function removeFriendship(me: string, other: string) {
  const { error } = await supabase.from('friendships').delete().match(orderedPair(me, other));
  if (error) throw new Error(friendlyError(error.message));
}

/**
 * Call `onChange` whenever any of my friendships change (new request, accepted, removed).
 * Returns an unsubscribe function.
 */
export function subscribeToFriendships(me: string, onChange: () => void): () => void {
  // supabase.channel(name) RETURNS THE EXISTING CHANNEL if one with that name is open, and you
  // can't add listeners to an already-subscribed channel (it throws). Two screens use the friends
  // list at once (Friends + Add friend), and React re-runs effects in development, so every
  // subscription gets its own unique channel name.
  const channel = supabase
    .channel(`friendships:${me}:${Math.random().toString(36).slice(2, 10)}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'friendships', filter: `user_a=eq.${me}` }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'friendships', filter: `user_b=eq.${me}` }, onChange)
    .subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
}
