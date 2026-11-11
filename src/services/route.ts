/**
 * Driving route from OpenRouteService (free tier: 2,000 routes/day). Key: EXPO_PUBLIC_ORS_KEY.
 *
 * The leader calculates the shared route (start → stops → destination) and saves it on the trip
 * (trips.route_geojson); everyone else just reads it. See useConvoy (src/state/useConvoy.ts).
 *
 * Docs: https://openrouteservice.org/dev/#/api-docs/v2/directions/{profile}/geojson/post
 */
import type { LatLng } from '../lib/geo';

const ORS_KEY = process.env.EXPO_PUBLIC_ORS_KEY ?? '';

/** One turn-by-turn instruction (from OpenRouteService). */
export type RouteStep = {
  /** ORS maneuver type: 0 left, 1 right, 2 sharp left, 3 sharp right, 4 slight left, 5 slight right,
   *  6 straight, 7 enter roundabout, 8 exit roundabout, 9 U-turn, 10 arrive, 11 depart, 12 keep left, 13 keep right */
  type: number;
  /** e.g. "Turn left onto Πανεπιστημίου" */
  instruction: string;
  /** street name ("-" when unnamed) */
  name: string;
  /** length of this step, metres */
  distance: number;
  /** index into coordinates where this step (and its maneuver) starts */
  fromIndex: number;
  /** roundabout exit number, when type is 7 */
  exit?: number;
};

/** What we store in trips.route_geojson. Coordinates are [lng, lat] like GeoJSON. */
export type StoredRoute = {
  coordinates: [number, number][];
  /** Turn-by-turn steps. Missing on routes saved before navigation existed ("New route" adds them). */
  steps?: RouteStep[];
  distanceM: number;
  durationS: number;
  computedAt: string;
};

export async function fetchRoute(points: LatLng[]): Promise<StoredRoute> {
  if (!ORS_KEY) throw new Error('Routing is not configured (EXPO_PUBLIC_ORS_KEY missing in .env).');
  if (points.length < 2) throw new Error('A route needs a start and a destination.');

  const res = await fetch('https://api.openrouteservice.org/v2/directions/driving-car/geojson', {
    method: 'POST',
    headers: { Authorization: ORS_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ coordinates: points.map((p) => [p.lng, p.lat]), instructions: true, language: 'en', units: 'm' }),
  });
  if (!res.ok) {
    const body = await res.text();
    if (res.status === 404 || body.includes('2010')) throw new Error('No road route found to that place.');
    if (res.status === 429) throw new Error('Too many route requests — try again in a minute.');
    throw new Error(`Route failed (${res.status}).`);
  }
  const json = await res.json();
  const f = json.features?.[0];
  if (!f) throw new Error('No route found.');
  return {
    coordinates: f.geometry.coordinates.map((c: number[]) => [c[0], c[1]] as [number, number]),
    steps: (f.properties?.segments ?? []).flatMap((seg: any) =>
      (seg.steps ?? []).map(
        (st: any): RouteStep => ({
          type: st.type,
          instruction: st.instruction,
          name: st.name,
          distance: st.distance,
          fromIndex: st.way_points?.[0] ?? 0,
          ...(st.exit_number ? { exit: st.exit_number } : {}),
        }),
      ),
    ),
    distanceM: f.properties?.summary?.distance ?? 0,
    durationS: f.properties?.summary?.duration ?? 0,
    computedAt: new Date().toISOString(),
  };
}

/** Stored route → points the geo maths and the map use. */
export function routePoints(route: StoredRoute | null | undefined): LatLng[] {
  return (route?.coordinates ?? []).map(([lng, lat]) => ({ lat, lng }));
}
