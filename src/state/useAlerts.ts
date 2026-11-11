/**
 * Banners + spoken messages for the map screens (SPEC §6, §7).
 *
 *   const { alerts, dismiss, notify, snoozeCar } = useAlerts(cars, route, settings);
 *
 * Every second: run the left-behind rules (src/lib/leftBehind.ts) on all cars → turn them into
 * alert events (src/lib/alerts.ts) → banner + spoken message (src/state/voice.ts).
 * notify() adds a one-off banner (e.g. "Maria asks everyone to slow down").
 * snoozeCar() = that car said "I'm OK": don't repeat its alerts for a while.
 *
 * Runs while the map screen is open. Alerts with the screen off are a later step.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { MapCar } from '../components/map/types';
import type { TripSettings } from '../config';
import { AlertEvent, AlertMemory, CarStatus, nextAlerts, snooze } from '../lib/alerts';
import { cumulativeDistances, type LatLng } from '../lib/geo';
import { detectLeftBehind, updateOffRouteTimer } from '../lib/leftBehind';
import { advanceAlongRoute } from '../lib/prediction';
import { speak, stopSpeaking } from './voice';

const BANNER_MS = 12000;
const MAX_BANNERS = 3;

export function useAlerts(
  cars: MapCar[],
  route: LatLng[],
  settings: TripSettings,
  /** During a group break the cars regroup at the stop anyway, so no "falling behind" alerts. */
  breakActive = false,
) {
  const memory = useRef<AlertMemory>(new Map());
  const offRouteSince = useRef(new Map<string, number | null>());
  const [alerts, setAlerts] = useState<AlertEvent[]>([]);
  const cum = useMemo(() => cumulativeDistances(route), [route]);

  const show = (events: AlertEvent[]) => {
    setAlerts((old) => [...events, ...old].slice(0, MAX_BANNERS));
    events.forEach((e) => speak(e.text));
  };

  // `cars` updates every second (useConvoy's clock), so this runs every second.
  useEffect(() => {
    if (route.length < 2 || cars.length === 0) return;
    const now = Date.now();

    const states = cars.map((c) => {
      // Compare everyone at the SAME moment: a live position that is a few seconds old is moved
      // forward by its own speed (predicted cars are already moved by useConvoy).
      const position = c.predicted ? c.position : advanceAlongRoute(c.position, c.speed, c.ageMs, route, cum);
      const since = updateOffRouteTimer(offRouteSince.current.get(c.id) ?? null, position, route, settings, now);
      offRouteSince.current.set(c.id, since);
      return { userId: c.id, position, speed: c.speed, offRouteSince: since };
    });
    const results = detectLeftBehind(states, route, settings, now);

    const statuses: CarStatus[] = results.map((r) => {
      const car = cars.find((c) => c.id === r.userId)!;
      return { userId: r.userId, name: car.name, isMe: car.isMe, behindReasons: breakActive ? r.reasons.filter((x) => x === 'offRoute') : r.reasons, gapMeters: r.gapMeters, fixAgeMs: car.ageMs };
    });

    const events = nextAlerts(statuses, memory.current, now);
    if (events.length) show(events);
  }, [cars, route, cum, settings, breakActive]);

  // Auto-hide banners.
  useEffect(() => {
    if (!alerts.length) return;
    const t = setInterval(() => setAlerts((old) => old.filter((a) => Date.now() - a.at < BANNER_MS)), 1000);
    return () => clearInterval(t);
  }, [alerts.length]);

  // Stop talking when leaving the screen.
  useEffect(() => () => stopSpeaking(), []);

  return {
    alerts,
    dismiss: (id: string) => setAlerts((old) => old.filter((a) => a.id !== id)),
    /** One-off banner + voice. `problem` = red, otherwise green. */
    notify: (text: string, problem = false) => {
      const now = Date.now();
      show([{ id: `note:${now}:${Math.random()}`, userId: '', kind: 'behind', problem, text, at: now }]);
    },
    snoozeCar: (userId: string) => snooze(memory.current, userId, Date.now()),
  };
}
