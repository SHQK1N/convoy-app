/**
 * GPS tracking for the current trip — keeps going with the screen off (SPEC §4, ARCHITECTURE "Background GPS").
 *
 * Phones: a background location task (expo-location + expo-task-manager). On Android it runs as a
 *         "foreground service" — a permanent notification "Convoy is sharing your location" —
 *         which is what keeps it alive with the screen off. Needs the development build.
 * Web:    the browser's location (watchPositionAsync) while the tab is open. For testing only.
 *
 * Every fix goes to:
 *   1. the listener set with setPositionListener() — the map screen (shares it live), and
 *   2. the database (trip_members.last_*), at most every CONFIG.persistIntervalMs.
 *
 * Tracking stops when you leave the trip or sign out (stopTracking()).
 */
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { Platform } from 'react-native';
import { CONFIG } from '../config';
import type { PositionMessage } from './live';
import { supabase } from './supabase';

const TASK = 'convoy-location';

/** Which trip/user we are tracking for. Kept in memory; recovered from the DB if the OS restarted the app. */
let active: { tripId: string; userId: string } | null = null;
let listener: ((p: PositionMessage) => void) | null = null;
let lastPersist = 0;
let webWatch: Location.LocationSubscription | null = null;

export function setPositionListener(fn: ((p: PositionMessage) => void) | null) {
  listener = fn;
}

async function handleFix(loc: Location.LocationObject) {
  if (!active) {
    // The OS may have restarted the app just to deliver this fix: find out who/where we are.
    const { data } = await supabase.auth.getSession();
    const uid = data.session?.user.id;
    if (!uid) return;
    const { data: m } = await supabase.from('trip_members').select('trip_id').eq('user_id', uid).maybeSingle();
    if (!m) {
      await stopTracking(); // not in a trip any more
      return;
    }
    active = { tripId: m.trip_id, userId: uid };
  }

  const p: PositionMessage = {
    userId: active.userId,
    lat: loc.coords.latitude,
    lng: loc.coords.longitude,
    speed: loc.coords.speed != null && loc.coords.speed >= 0 ? loc.coords.speed : null,
    heading: loc.coords.heading != null && loc.coords.heading >= 0 ? loc.coords.heading : null,
    at: loc.timestamp,
  };
  listener?.(p);

  if (Date.now() - lastPersist >= CONFIG.persistIntervalMs) {
    lastPersist = Date.now();
    await supabase
      .from('trip_members')
      .update({
        last_lat: p.lat,
        last_lng: p.lng,
        last_speed: p.speed,
        last_heading: p.heading,
        last_seen_at: new Date(p.at).toISOString(),
      })
      .match({ trip_id: active.tripId, user_id: active.userId });
  }
}

// Must be defined at app start-up (this file is imported by app/_layout.tsx), not inside a component.
if (Platform.OS !== 'web') {
  TaskManager.defineTask<{ locations: Location.LocationObject[] }>(TASK, async ({ data, error }) => {
    if (error || !data?.locations?.length) return;
    await handleFix(data.locations[data.locations.length - 1]);
  });
}

/**
 * Ask for permission and start sharing. Returns an error message to show, or null when tracking.
 * Asking order matters: "while using" first, then "always" (Android/iOS refuse otherwise).
 */
export async function startTracking(tripId: string, userId: string): Promise<string | null> {
  active = { tripId, userId };
  lastPersist = 0;

  const fg = await Location.requestForegroundPermissionsAsync();
  if (fg.status !== 'granted') return 'Location permission is needed to show your car to the group.';

  if (Platform.OS === 'web') {
    webWatch?.remove();
    webWatch = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.High, timeInterval: CONFIG.broadcastIntervalMs, distanceInterval: 0 },
      handleFix,
    );
    return null;
  }

  const bg = await Location.requestBackgroundPermissionsAsync();
  const note =
    bg.status !== 'granted'
      ? 'Location is shared only while Convoy is open. Allow "All the time" in settings to keep sharing with the screen off.'
      : null;

  if (await Location.hasStartedLocationUpdatesAsync(TASK)) await Location.stopLocationUpdatesAsync(TASK);
  await Location.startLocationUpdatesAsync(TASK, {
    accuracy: Location.Accuracy.BestForNavigation,
    timeInterval: CONFIG.broadcastIntervalMs, // Android
    distanceInterval: 10, // metres
    activityType: Location.ActivityType.AutomotiveNavigation, // iOS
    pausesUpdatesAutomatically: false,
    showsBackgroundLocationIndicator: true, // iOS blue pill
    foregroundService: {
      notificationTitle: 'Convoy is sharing your location',
      notificationBody: 'Your group can see your car. Leave the trip to stop.',
      notificationColor: '#FF4D26',
      killServiceOnDestroy: false,
    },
  });
  return note;
}

export async function stopTracking() {
  active = null;
  webWatch?.remove();
  webWatch = null;
  if (Platform.OS !== 'web' && (await Location.hasStartedLocationUpdatesAsync(TASK).catch(() => false))) {
    await Location.stopLocationUpdatesAsync(TASK);
  }
}

/** One-off position (used by the leader to start the route). Null if unavailable. */
export async function getCurrentPosition(): Promise<{ lat: number; lng: number } | null> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return null;
    const last = await Location.getLastKnownPositionAsync().catch(() => null);
    const loc = last ?? (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));
    return { lat: loc.coords.latitude, lng: loc.coords.longitude };
  } catch {
    return null;
  }
}
