/**
 * Everything the live map needs, in one hook:
 *
 *   const { cars, route, trackingNote } = useConvoy(trip, me, simulate);
 *
 * - Starts sharing MY position (src/services/location.ts) and sends it live to the trip channel.
 * - Listens to everyone else's live positions (src/services/live.ts).
 * - Seeds positions from the database (last saved ~30 s) so cars appear straight away.
 * - Every second, works out where each car is NOW — real position if fresh, otherwise a
 *   prediction along the route (src/lib/prediction.ts) drawn faded.
 * - `simulate` adds fake cars (src/lib/simulate.ts) and drives "You" along the route too,
 *   so the map can be tested on a PC. Fake cars are never sent to anyone.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { MapCar } from '../components/map/types';
import { cumulativeDistances } from '../lib/geo';
import { estimateCar } from '../lib/prediction';
import { SIM_CARS, simulateConvoy } from '../lib/simulate';
import { joinTripChannel, PositionMessage } from '../services/live';
import { setPositionListener, startTracking } from '../services/location';
import { routePoints } from '../services/route';
import type { Trip } from '../services/trips';

const TICK_MS = 1000;

export function useConvoy(trip: Trip | null, me: string | undefined, simulate: boolean) {
  const fixes = useRef(new Map<string, PositionMessage>());
  const [now, setNow] = useState(Date.now());
  const [trackingNote, setTrackingNote] = useState<string | null>(null);
  const [simStart, setSimStart] = useState<number | null>(null);
  const tripId = trip?.id;

  const keepNewest = (p: PositionMessage) => {
    const old = fixes.current.get(p.userId);
    if (!old || p.at >= old.at) fixes.current.set(p.userId, p);
  };

  // Seed from the database whenever the trip data refreshes.
  useEffect(() => {
    trip?.members.forEach((m) => m.lastFix && keepNewest(m.lastFix));
  }, [trip]);

  // Live channel + my GPS.
  useEffect(() => {
    if (!tripId || !me) return;
    let live: Awaited<ReturnType<typeof joinTripChannel>> | null = null;
    let cancelled = false;

    joinTripChannel(tripId, keepNewest).then((l) => {
      if (cancelled) l.leave();
      else live = l;
    });

    setPositionListener((p) => {
      keepNewest(p);
      live?.send(p);
    });
    startTracking(tripId, me).then(setTrackingNote).catch((e) => setTrackingNote((e as Error).message));

    return () => {
      cancelled = true;
      live?.leave();
      // Tracking itself keeps running in the background on purpose (screen off, other app).
      // It stops when you leave the trip — see stopTracking() calls in the lobby / sign-out.
      setPositionListener(null);
    };
  }, [tripId, me]);

  // Clock.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(t);
  }, []);

  // Simulator on/off.
  useEffect(() => setSimStart(simulate ? Date.now() : null), [simulate]);

  const route = useMemo(() => routePoints(trip?.route), [trip?.route]);
  const cum = useMemo(() => cumulativeDistances(route), [route]);

  const cars: MapCar[] = useMemo(() => {
    if (!trip) return [];
    const out: MapCar[] = [];
    const simFixes =
      simStart != null && route.length > 1
        ? simulateConvoy(route, simStart, now, [
            ...SIM_CARS,
            { id: me ?? 'me', name: 'You', colour: '#FF4D26', kmh: 100, startOffsetM: 600 },
          ], cum)
        : [];
    const simMine = simFixes.find((f) => f.userId === me);

    for (const m of trip.members) {
      const fix = m.profile.id === me && simMine ? simMine : fixes.current.get(m.profile.id);
      if (!fix) continue; // hasn't shared a position yet
      const est = estimateCar(fix, route, now, cum);
      out.push({
        id: m.profile.id,
        name: m.profile.display_name,
        colour: m.profile.colour,
        position: est.position,
        speed: fix.speed,
        predicted: est.predicted,
        ageMs: est.ageMs,
        isMe: m.profile.id === me,
      });
    }
    for (const f of simFixes) {
      if (f.userId === me) continue;
      const car = SIM_CARS.find((c) => c.id === f.userId)!;
      const est = estimateCar(f, route, now, cum);
      out.push({ id: f.userId, name: car.name, colour: car.colour, position: est.position, speed: f.speed, predicted: est.predicted, ageMs: est.ageMs, isMe: false });
    }
    return out;
  }, [trip, me, now, route, cum, simStart]);

  return { cars, route, trackingNote };
}
