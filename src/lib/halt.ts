/**
 * Group breaks ("halt") — SPEC §7. Pure logic, unit-tested in halt.test.ts.
 *
 * Someone taps Break → we pick ONE stop for everyone: the first suitable place (fuel station,
 * services, rest area) on the route AHEAD OF THE FRONT CAR, so every car can still reach it.
 * Then every phone counts down its own distance to the stop and speaks reminders.
 */
import { CONFIG } from '../config';
import { cumulativeDistances, LatLng, pointAlongRoute, projectOnRoute } from './geo';

export type BreakReason = 'toilet' | 'fuel' | 'food' | 'rest';

export const BREAK_LABELS: Record<BreakReason, { icon: string; text: string }> = {
  toilet: { icon: '🚻', text: 'Toilet' },
  fuel: { icon: '⛽', text: 'Fuel' },
  food: { icon: '🍔', text: 'Food' },
  rest: { icon: '☕', text: 'Rest' },
};

export type Stop = LatLng & { label: string; alongM: number };

/** What trips.halt holds (0006_breaks.sql). */
export type Halt = {
  id: string;
  by: string;
  byName: string;
  reason: BreakReason;
  stop: Stop;
  at: number;
};

/** A place found near the route (from OpenStreetMap — src/services/stops.ts). */
export type Candidate = LatLng & { label: string };

/** Metres from the route a place may be and still count as "on the way". */
export const STOP_MAX_OFFSET_M = 400;
/** Within this distance of the stop, a car counts as "arrived". */
export const ARRIVED_M = 250;

/**
 * Choose the stop: the closest candidate that is at least nextStopMinAheadMeters ahead of the
 * FRONT car and close to the route. Falls back to a plain point on the route ("next safe place").
 */
export function pickStop(route: LatLng[], frontAlongM: number, candidates: Candidate[], cum = cumulativeDistances(route)): Stop {
  const minAlong = frontAlongM + CONFIG.nextStopMinAheadMeters;
  const maxAlong = frontAlongM + CONFIG.nextStopSearchAheadMeters;
  let best: Stop | null = null;
  for (const c of candidates) {
    const p = projectOnRoute(c, route, cum);
    if (p.offsetMeters > STOP_MAX_OFFSET_M || p.alongMeters < minAlong || p.alongMeters > maxAlong) continue;
    if (!best || p.alongMeters < best.alongM) best = { lat: c.lat, lng: c.lng, label: c.label, alongM: p.alongMeters };
  }
  if (best) return best;

  // Nothing found: the next safe place ~5 km ahead (or the destination if closer).
  const total = cum[cum.length - 1] ?? 0;
  const alongM = Math.min(total, frontAlongM + Math.max(CONFIG.nextStopMinAheadMeters, 5000));
  const p = pointAlongRoute(route, alongM, cum);
  return { ...p, label: 'the next safe place to pull over', alongM };
}

/** Distance left to the stop along the route (0 = there or past it). */
export function distanceToStop(myAlongM: number, stop: Stop): number {
  return Math.max(0, stop.alongM - myAlongM);
}

const fmtKm = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(m >= 10000 ? 0 : 1)} km` : `${Math.round(m / 10) * 10} m`);
export { fmtKm };

/**
 * Spoken reminder to give now, if any. Each threshold in CONFIG.haltReminderMeters is spoken once
 * (`said` is kept by the caller per break). Returns null when nothing new to say.
 */
export function reminderFor(distanceM: number, said: Set<number>, stopLabel: string): string | null {
  if (distanceM <= ARRIVED_M) {
    if (said.has(0)) return null;
    said.add(0);
    return `You have arrived at the stop. Pull over at ${stopLabel}.`;
  }
  // The smallest threshold we have crossed and not yet announced.
  const crossed = [...CONFIG.haltReminderMeters].filter((t) => distanceM <= t && !said.has(t)).sort((a, b) => a - b);
  if (!crossed.length) return null;
  // Mark this and all larger thresholds as said (don't announce 5 km after 2 km).
  for (const t of CONFIG.haltReminderMeters) if (t >= crossed[0]) said.add(t);
  return `Stop in ${fmtKm(distanceM)}: ${stopLabel}.`;
}
