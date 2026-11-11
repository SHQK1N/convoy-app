/**
 * Trips ("lobbies"): create, invite, accept/decline, leave, set destination, live updates.
 *
 * Rules (SPEC §4) are enforced in the DATABASE, not here — see 0001_init.sql and 0004_trips_and_push.sql:
 *   - one trip per person at a time
 *   - only friends can be invited; the car cap is checked when an invite is accepted
 *   - only the leader can change the destination
 *   - leader leaves → earliest-joined member becomes leader; last one out → trip deleted
 * This file just calls those rules and turns errors into readable messages.
 */
import { friendlyError, Profile } from './auth';
import type { Place } from './geocode';
import type { PositionMessage } from './live';
import type { StoredRoute } from './route';
import type { Halt } from '../lib/halt';
import { supabase } from './supabase';
import type { TripSettings } from '../config';

export type TripMember = {
  profile: Profile;
  joinedAt: string;
  /** Last position saved to the database (~every 30 s), or null if never shared. */
  lastFix: PositionMessage | null;
};

export type Trip = {
  id: string;
  leaderId: string;
  destination: Place | null;
  settings: TripSettings;
  members: TripMember[]; // ordered by join time (index 0 = next in line to lead)
  pendingInviteeIds: string[]; // friends invited but not yet answered
  /** Shared route, calculated by the leader (null until "Start driving"). */
  route: StoredRoute | null;
  /** Active group break, or null while driving (0006_breaks.sql). */
  halt: Halt | null;
};

export type Invite = {
  id: string;
  tripId: string;
  from: Profile;
  destinationLabel: string | null;
  createdAt: string;
};

const PROFILE_COLS = 'id, username, display_name, colour';

/** Run a database function and convert its error (our own `raise exception` text) into an Error. */
async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new Error(friendlyError(error.message));
  return data as T;
}

/** The trip I'm currently in, or null. */
export async function getMyTrip(me: string): Promise<Trip | null> {
  const { data: mine, error: e1 } = await supabase
    .from('trip_members')
    .select('trip_id')
    .eq('user_id', me)
    .maybeSingle();
  if (e1) throw new Error(friendlyError(e1.message));
  if (!mine) return null;
  return getTrip(mine.trip_id);
}

export async function getTrip(tripId: string): Promise<Trip | null> {
  const [trip, members, invites] = await Promise.all([
    supabase.from('trips').select('id, leader_id, dest_lat, dest_lng, dest_label, settings, route_geojson, halt').eq('id', tripId).maybeSingle(),
    supabase
      .from('trip_members')
      .select(`joined_at, last_lat, last_lng, last_speed, last_heading, last_seen_at, profile:profiles(${PROFILE_COLS})`)
      .eq('trip_id', tripId)
      .order('joined_at'),
    supabase.from('trip_invites').select('to_user').eq('trip_id', tripId).eq('status', 'pending'),
  ]);
  for (const r of [trip, members, invites]) if (r.error) throw new Error(friendlyError(r.error.message));
  if (!trip.data) return null;

  const t = trip.data;
  return {
    id: t.id,
    leaderId: t.leader_id,
    destination: t.dest_lat != null ? { lat: t.dest_lat, lng: t.dest_lng, label: t.dest_label ?? '' } : null,
    settings: t.settings,
    route: (t.route_geojson as StoredRoute | null) ?? null,
    halt: (t.halt as Halt | null) ?? null,
    members: (members.data ?? []).map((m: any) => ({
      profile: m.profile as Profile,
      joinedAt: m.joined_at,
      lastFix:
        m.last_lat != null && m.last_seen_at
          ? {
              userId: m.profile.id,
              lat: m.last_lat,
              lng: m.last_lng,
              speed: m.last_speed,
              heading: m.last_heading,
              at: new Date(m.last_seen_at).getTime(),
            }
          : null,
    })),
    // Note: you only see invites YOU sent (RLS), so this lists the ones you sent that are still open.
    pendingInviteeIds: (invites.data ?? []).map((i) => i.to_user),
  };
}

export const createTrip = () => rpc<string>('create_trip');
export const inviteToTrip = (tripId: string, friendId: string) => rpc<void>('invite_to_trip', { t: tripId, friend: friendId });
export const acceptInvite = (inviteId: string) => rpc<string>('accept_invite', { invite: inviteId });
export const leaveTrip = (tripId: string) => rpc<void>('leave_trip', { t: tripId });

export async function declineInvite(inviteId: string) {
  const { error } = await supabase.from('trip_invites').update({ status: 'declined' }).eq('id', inviteId);
  if (error) throw new Error(friendlyError(error.message));
}

/** Leader only (enforced by the database). */
export async function setDestination(tripId: string, place: Place) {
  const { error } = await supabase
    .from('trips')
    // New destination → old route is wrong; the leader's map recalculates it.
    .update({ dest_lat: place.lat, dest_lng: place.lng, dest_label: place.label, route_geojson: null })
    .eq('id', tripId);
  if (error) throw new Error(friendlyError(error.message));
}

/** Leader only (enforced by the database). Saving a new destination clears the old route. */
export async function saveRoute(tripId: string, route: StoredRoute | null) {
  const { error } = await supabase.from('trips').update({ route_geojson: route }).eq('id', tripId);
  if (error) throw new Error(friendlyError(error.message));
}

/** Start (halt) or end (null) a group break. Any member may (0006_breaks.sql). */
export const setHalt = (tripId: string, halt: Halt | null) => rpc<void>('set_halt', { t: tripId, h: halt });

/** Trip invites waiting for my answer, newest first. */
export async function listMyInvites(me: string): Promise<Invite[]> {
  const { data, error } = await supabase
    .from('trip_invites')
    .select(`id, trip_id, created_at, from:profiles!trip_invites_from_user_fkey(${PROFILE_COLS}), trip:trips(dest_label)`)
    .eq('to_user', me)
    .eq('status', 'pending')
    .order('created_at', { ascending: false });
  if (error) throw new Error(friendlyError(error.message));
  return (data ?? [])
    .filter((r: any) => r.trip) // trip may have ended since
    .map((r: any) => ({
      id: r.id,
      tripId: r.trip_id,
      from: r.from as Profile,
      destinationLabel: r.trip?.dest_label ?? null,
      createdAt: r.created_at,
    }));
}

/**
 * Live updates for everything trip-related that concerns me.
 * `onChange` fires when: my membership changes, the trip changes (destination, leader),
 * someone joins/leaves, or I get/lose an invite. Returns an unsubscribe function.
 *
 * Channel names are unique per call — see the note in friends.ts (subscribeToFriendships).
 */
export function subscribeToTrips(me: string, tripId: string | null, onChange: () => void): () => void {
  const id = Math.random().toString(36).slice(2, 10);
  let ch = supabase
    .channel(`trips:${me}:${id}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'trip_members', filter: `user_id=eq.${me}` }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'trip_invites', filter: `to_user=eq.${me}` }, onChange);
  if (tripId) {
    ch = ch
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trips', filter: `id=eq.${tripId}` }, onChange)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trip_members', filter: `trip_id=eq.${tripId}` }, onChange)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trip_invites', filter: `trip_id=eq.${tripId}` }, onChange);
  }
  ch.subscribe();
  return () => {
    supabase.removeChannel(ch);
  };
}
