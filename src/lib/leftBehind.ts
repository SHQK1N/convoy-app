/**
 * Left-behind detection — SPEC §6.
 *
 * Runs on every phone with the same inputs, so every phone reaches the same answer.
 * A car is "behind" if ANY rule fires:
 *   1. distance  — more than behindKm along the route behind the car directly ahead of it
 *   2. time      — more than behindMinutes behind it (distance gap ÷ the slower car's speed)
 *   3. off route — more than offRouteMeters from the route line for offRouteSeconds
 *
 * The leading car is never "behind".
 */
import { CONFIG, TripSettings } from '../config';
import { cumulativeDistances, LatLng, projectOnRoute } from './geo';

export type CarState = {
  userId: string;
  position: LatLng;
  /** metres per second */
  speed: number | null;
  /** epoch ms when this car first went off-route; null if on route. Kept by the caller between calls. */
  offRouteSince: number | null;
};

export type BehindReason = 'distance' | 'time' | 'offRoute';

export type BehindResult = {
  userId: string;
  alongMeters: number;
  offsetMeters: number;
  /** gap to the car directly ahead, metres (0 for the leader) */
  gapMeters: number;
  reasons: BehindReason[];
};

/**
 * Lowest pace the time rule assumes (15 km/h). Stops a car waiting at a red light (speed 0)
 * from looking "infinitely" far behind. Above this, the faster of the two cars' speeds is used.
 */
const MIN_PACE_MS = 15 / 3.6;

export function detectLeftBehind(
  cars: CarState[],
  route: LatLng[],
  settings: TripSettings,
  now: number,
): BehindResult[] {
  if (route.length < 2) return cars.map((c) => ({ userId: c.userId, alongMeters: 0, offsetMeters: 0, gapMeters: 0, reasons: [] }));
  const cum = cumulativeDistances(route);

  const projected = cars
    .map((c) => ({ car: c, ...projectOnRoute(c.position, route, cum) }))
    .sort((a, b) => b.alongMeters - a.alongMeters); // leader first

  return projected.map((p, i) => {
    const reasons: BehindReason[] = [];
    const ahead = i > 0 ? projected[i - 1] : null;
    const gapMeters = ahead ? ahead.alongMeters - p.alongMeters : 0;

    if (ahead) {
      if (gapMeters > settings.behindKm * 1000) reasons.push('distance');

      // Time gap: how long this car needs to cover the gap at the convoy's pace.
      const pace = Math.max(ahead.car.speed ?? 0, p.car.speed ?? 0, MIN_PACE_MS);
      if (gapMeters / pace > settings.behindMinutes * 60) reasons.push('time');
    }

    const offFor = p.car.offRouteSince == null ? 0 : (now - p.car.offRouteSince) / 1000;
    if (p.offsetMeters > settings.offRouteMeters && offFor >= CONFIG.behind.offRouteSeconds) {
      reasons.push('offRoute');
    }

    return { userId: p.car.userId, alongMeters: p.alongMeters, offsetMeters: p.offsetMeters, gapMeters, reasons };
  });
}

/**
 * Update a car's offRouteSince timer from a new position. Call on every position update.
 * Returns the new offRouteSince value to store on the car.
 */
export function updateOffRouteTimer(
  prevSince: number | null,
  position: LatLng,
  route: LatLng[],
  settings: TripSettings,
  now: number,
): number | null {
  if (route.length < 2) return null;
  const off = projectOnRoute(position, route).offsetMeters > settings.offRouteMeters;
  if (!off) return null;
  return prevSince ?? now;
}
