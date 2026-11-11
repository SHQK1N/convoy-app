/**
 * Offline car prediction ("dead reckoning") — SPEC §5.
 *
 * When a car stops sending positions (no signal), we keep drawing it where it PROBABLY is:
 * its last known position, moved forward along the shared route at its last known speed.
 * The prediction stops after CONFIG.maxPredictionMs (the car may have parked).
 */
import { CONFIG } from '../config';
import { cumulativeDistances, LatLng, pointAlongRoute, projectOnRoute } from './geo';

export type CarFix = {
  lat: number;
  lng: number;
  /** metres per second (from GPS; may be null when stationary/unknown) */
  speed: number | null;
  /** epoch ms when this fix was taken */
  at: number;
};

export type CarEstimate = {
  position: LatLng;
  /** true = this is a guess, draw the car faded with "last seen X min ago" */
  predicted: boolean;
  /** how old the real fix is, ms */
  ageMs: number;
};

/**
 * Move a position forward along the route by speed × age (capped at CONFIG.maxPredictionMs).
 * Unchanged if there is no route, no speed, or the car is off the route.
 * Used to compare cars "at the same moment" even when their fixes are a few seconds apart.
 */
export function advanceAlongRoute(
  pos: LatLng,
  speed: number | null,
  ageMs: number,
  route: LatLng[],
  cum: number[] = cumulativeDistances(route),
): LatLng {
  if (route.length < 2 || !speed || speed <= 0 || ageMs <= 0) return pos;
  const proj = projectOnRoute(pos, route, cum);
  if (proj.offsetMeters > CONFIG.behind.offRouteMeters) return pos;
  return pointAlongRoute(route, proj.alongMeters + speed * (Math.min(ageMs, CONFIG.maxPredictionMs) / 1000), cum);
}

/**
 * Estimate where a car is right now.
 * @param fix   last real position received
 * @param route shared trip route (may be empty → no prediction possible, return last fix)
 * @param now   current time, epoch ms (passed in so tests can control time)
 */
export function estimateCar(
  fix: CarFix,
  route: LatLng[],
  now: number,
  cum: number[] = cumulativeDistances(route),
): CarEstimate {
  const ageMs = Math.max(0, now - fix.at);
  const last = { lat: fix.lat, lng: fix.lng };

  // Fresh enough → show the real position.
  if (ageMs < CONFIG.offlineAfterMs) return { position: last, predicted: false, ageMs };

  // Offline but can't predict (no route, or not moving) → keep the last position, mark as stale.
  if (route.length < 2 || !fix.speed || fix.speed <= 0) return { position: last, predicted: true, ageMs };

  // If the car was far off the route, moving it along the route would teleport it — don't.
  const proj = projectOnRoute(last, route, cum);
  if (proj.offsetMeters > CONFIG.behind.offRouteMeters) return { position: last, predicted: true, ageMs };

  const travelMs = Math.min(ageMs, CONFIG.maxPredictionMs);
  const along = proj.alongMeters + fix.speed * (travelMs / 1000);
  return { position: pointAlongRoute(route, along, cum), predicted: true, ageMs };
}
