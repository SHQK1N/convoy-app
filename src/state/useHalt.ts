/**
 * Group break ("halt") for the map screens — SPEC §7.
 *
 *   const brk = useHalt({ halt, saveHalt, cars, route, me, notify });
 *   brk.requestBreak('toilet');   brk.endBreak();
 *   brk.myDistanceM, brk.arrived, brk.total
 *
 * - requestBreak: finds the next stop AHEAD OF THE FRONT CAR (OpenStreetMap, src/services/stops.ts
 *   + pickStop in src/lib/halt.ts) and saves the break for everyone via `saveHalt`
 *   (the trip in the database, or local state in the demo).
 * - Every phone then: announces the break, counts down its own distance to the stop and speaks
 *   reminders at 5 km / 2 km / 500 m / arrived, and announces when the break ends.
 * - Anyone can end the break ("Continue trip") — nobody has authority (SPEC §4).
 * - Anti-spam: one break at a time, and none for CONFIG.cooldowns.breakMs after one ends
 *   (also enforced by the database, 0007_button_limits.sql).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { MapCar } from '../components/map/types';
import { CONFIG } from '../config';
import { cumulativeDistances, LatLng, projectOnRoute } from '../lib/geo';
import { ARRIVED_M, BREAK_LABELS, BreakReason, distanceToStop, fmtKm, Halt, pickStop, reminderFor } from '../lib/halt';
import { findStopsAhead } from '../services/stops';

type Args = {
  halt: Halt | null;
  saveHalt: (h: Halt | null) => Promise<void>;
  cars: MapCar[];
  route: LatLng[];
  me: { id: string; name: string } | null;
  notify: (text: string, problem?: boolean) => void;
};

export function useHalt({ halt, saveHalt, cars, route, me, notify }: Args) {
  const cum = useMemo(() => cumulativeDistances(route), [route]);
  const [busy, setBusy] = useState(false);
  const said = useRef(new Set<number>());
  const lastHaltId = useRef<string | null>(halt?.id ?? null);
  /** When the last break ended (anti-spam: no new break for CONFIG.cooldowns.breakMs). */
  const endedAt = useRef<number | null>(null);

  const alongOf = (p: LatLng) => projectOnRoute(p, route, cum).alongMeters;
  const myCar = cars.find((c) => c.isMe);
  const myDistanceM = halt && myCar ? distanceToStop(alongOf(myCar.position), halt.stop) : null;
  const arrived = halt ? cars.filter((c) => distanceToStop(alongOf(c.position), halt.stop) <= ARRIVED_M).length : 0;

  // Announce start / end of a break (once per break, on every phone).
  useEffect(() => {
    const prev = lastHaltId.current;
    lastHaltId.current = halt?.id ?? null;
    if (halt && halt.id !== prev) {
      said.current = new Set();
      // The announcement already gives the distance, so skip reminders we're already past.
      if (myDistanceM != null) for (const t of CONFIG.haltReminderMeters) if (myDistanceM <= t) said.current.add(t);
      const what = BREAK_LABELS[halt.reason].text.toLowerCase();
      const who = halt.by === me?.id ? 'You' : halt.byName;
      const dist = myDistanceM != null ? `, ${fmtKm(myDistanceM)} ahead` : '';
      notify(`${who} called a ${what} break. Pull over at ${halt.stop.label}${dist}.`, true);
    } else if (!halt && prev) {
      endedAt.current = Date.now();
      notify("Break over. Let's go!");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [halt?.id]);

  // Countdown reminders for MY car.
  useEffect(() => {
    if (!halt || myDistanceM == null) return;
    const text = reminderFor(myDistanceM, said.current, halt.stop.label);
    if (text) notify(text, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [halt?.id, myDistanceM != null ? Math.round(myDistanceM / 50) : null]);

  const breakLeftMs = endedAt.current == null ? 0 : Math.max(0, endedAt.current + CONFIG.cooldowns.breakMs - Date.now());

  async function requestBreak(reason: BreakReason) {
    if (!me || route.length < 2 || busy || halt || breakLeftMs > 0) return;
    setBusy(true);
    try {
      // Front car = furthest along among cars with a live position (fall back to all cars).
      const live = cars.filter((c) => !c.predicted);
      const front = Math.max(0, ...(live.length ? live : cars).map((c) => alongOf(c.position)));
      const candidates = await findStopsAhead(route, front);
      const stop = pickStop(route, front, candidates, cum);
      await saveHalt({ id: `${me.id}:${Date.now()}`, by: me.id, byName: me.name, reason, stop, at: Date.now() });
    } catch (e) {
      notify(`Couldn't start the break: ${(e as Error).message}`, true);
    } finally {
      setBusy(false);
    }
  }

  async function endBreak() {
    try {
      await saveHalt(null);
    } catch (e) {
      notify(`Couldn't end the break: ${(e as Error).message}`, true);
    }
  }

  return { requestBreak, endBreak, busy, myDistanceM, arrived, total: cars.length, breakLeftMs };
}
