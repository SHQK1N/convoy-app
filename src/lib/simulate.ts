/**
 * Convoy simulator — fake cars driving along the route, for testing the map (and later the
 * left-behind alerts) on the PC without real phones. Pure function, unit-tested.
 *
 * Time runs SPEEDUP× faster than real life so you can watch a trip unfold in a minute or two.
 * The fake cars are chosen to show every map state:
 *   - "Nikos"  fast, out in front
 *   - "Maria"  steady, in the middle
 *   - "Giorgos" loses signal from 15 s to 60 s (real time) → after CONFIG.offlineAfterMs he is
 *               drawn faded at a predicted position, then snaps back when "online" again
 *   - "Eleni"  slower → gradually falls behind
 * They exist only on your screen; nothing is sent to anyone.
 */
import { bearing, cumulativeDistances, LatLng, pointAlongRoute } from './geo';

export const SPEEDUP = 30;

export type SimFix = {
  userId: string;
  lat: number;
  lng: number;
  speed: number; // m/s (already sped up, so predictions stay consistent)
  heading: number;
  at: number; // epoch ms
};

export type SimCar = {
  id: string;
  name: string;
  colour: string;
  kmh: number;
  /** metres ahead (+) / behind (−) of the start at t = 0 */
  startOffsetM: number;
  /** real-time seconds [from, to] with no signal */
  offline?: [number, number];
};

export const SIM_CARS: SimCar[] = [
  { id: 'sim-nikos', name: 'Nikos', colour: '#1E88E5', kmh: 105, startOffsetM: 1500 },
  { id: 'sim-maria', name: 'Maria', colour: '#8E24AA', kmh: 100, startOffsetM: 800 },
  { id: 'sim-giorgos', name: 'Giorgos', colour: '#43A047', kmh: 98, startOffsetM: 300, offline: [15, 60] },
  { id: 'sim-eleni', name: 'Eleni', colour: '#F9A825', kmh: 80, startOffsetM: -200 },
];

/**
 * Fake fixes at wall-clock time `now`, for a simulation started at `startedAt` (both epoch ms).
 * A car that is "offline" keeps returning the fix from the moment it lost signal.
 */
export function simulateConvoy(
  route: LatLng[],
  startedAt: number,
  now: number,
  cars: SimCar[] = SIM_CARS,
  cum: number[] = cumulativeDistances(route),
): SimFix[] {
  if (route.length < 2) return [];
  const total = cum[cum.length - 1];
  const t = Math.max(0, (now - startedAt) / 1000);

  return cars.map((car) => {
    const inGap = car.offline && t >= car.offline[0] && t < car.offline[1];
    const tFix = inGap ? car.offline![0] : t;
    const v = (car.kmh / 3.6) * SPEEDUP;
    const along = Math.min(total, Math.max(0, car.startOffsetM + v * tFix));
    const pos = pointAlongRoute(route, along, cum);
    const ahead = pointAlongRoute(route, Math.min(total, along + 50), cum);
    return {
      userId: car.id,
      lat: pos.lat,
      lng: pos.lng,
      speed: along >= total ? 0 : v,
      heading: bearing(pos, ahead),
      at: startedAt + tFix * 1000,
    };
  });
}
