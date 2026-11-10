/**
 * Geo maths on a route polyline. Pure functions, no React, no network — unit-tested in geo.test.ts.
 *
 * Coordinates are { lat, lng } in degrees. Distances are metres.
 * A "route" is an ordered array of points (the shared trip route line).
 */

export type LatLng = { lat: number; lng: number };

const EARTH_RADIUS_M = 6371008.8;
const toRad = (d: number) => (d * Math.PI) / 180;
const toDeg = (r: number) => (r * 180) / Math.PI;

/** Great-circle distance between two points (haversine), metres. */
export function distance(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Cumulative distance from the route start to each vertex. cum[0] = 0. */
export function cumulativeDistances(route: LatLng[]): number[] {
  const cum = [0];
  for (let i = 1; i < route.length; i++) cum.push(cum[i - 1] + distance(route[i - 1], route[i]));
  return cum;
}

/**
 * Where a point sits relative to the route.
 * - alongMeters: distance from the route start to the closest point on the route ("progress").
 * - offsetMeters: distance from the point to the route line ("how far off-route").
 *
 * Uses a local flat-earth projection per segment — accurate to well under 1% for road-scale segments.
 */
export function projectOnRoute(
  p: LatLng,
  route: LatLng[],
  cum: number[] = cumulativeDistances(route),
): { alongMeters: number; offsetMeters: number; segmentIndex: number } {
  if (route.length === 0) return { alongMeters: 0, offsetMeters: Infinity, segmentIndex: -1 };
  if (route.length === 1) return { alongMeters: 0, offsetMeters: distance(p, route[0]), segmentIndex: 0 };

  let best = { alongMeters: 0, offsetMeters: Infinity, segmentIndex: 0 };
  for (let i = 0; i < route.length - 1; i++) {
    const a = route[i];
    const b = route[i + 1];
    // Project onto segment in a local metric plane centred on a.
    const kx = Math.cos(toRad(a.lat)) * toRad(1) * EARTH_RADIUS_M; // metres per degree lng
    const ky = toRad(1) * EARTH_RADIUS_M; // metres per degree lat
    const bx = (b.lng - a.lng) * kx;
    const by = (b.lat - a.lat) * ky;
    const px = (p.lng - a.lng) * kx;
    const py = (p.lat - a.lat) * ky;
    const len2 = bx * bx + by * by;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, (px * bx + py * by) / len2));
    const dx = px - t * bx;
    const dy = py - t * by;
    const off = Math.sqrt(dx * dx + dy * dy);
    if (off < best.offsetMeters) {
      best = { alongMeters: cum[i] + t * (cum[i + 1] - cum[i]), offsetMeters: off, segmentIndex: i };
    }
  }
  return best;
}

/** The point on the route at a given distance from the start (clamped to the route ends). */
export function pointAlongRoute(
  route: LatLng[],
  alongMeters: number,
  cum: number[] = cumulativeDistances(route),
): LatLng {
  if (route.length === 0) throw new Error('empty route');
  if (alongMeters <= 0) return route[0];
  const total = cum[cum.length - 1];
  if (alongMeters >= total) return route[route.length - 1];
  // Binary search for the segment containing alongMeters.
  let lo = 0;
  let hi = cum.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (cum[mid] <= alongMeters) lo = mid;
    else hi = mid;
  }
  const segLen = cum[hi] - cum[lo];
  const t = segLen === 0 ? 0 : (alongMeters - cum[lo]) / segLen;
  return {
    lat: route[lo].lat + t * (route[hi].lat - route[lo].lat),
    lng: route[lo].lng + t * (route[hi].lng - route[lo].lng),
  };
}

/** Initial bearing from a to b, degrees 0–360 (0 = north). */
export function bearing(a: LatLng, b: LatLng): number {
  const y = Math.sin(toRad(b.lng - a.lng)) * Math.cos(toRad(b.lat));
  const x =
    Math.cos(toRad(a.lat)) * Math.sin(toRad(b.lat)) -
    Math.sin(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.cos(toRad(b.lng - a.lng));
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}
