/**
 * Left-behind / off-route / lost-signal alerts for the map screens (SPEC §6).
 *
 *   const { alerts, dismiss, muted, setMuted } = useAlerts(cars, route, settings);
 *
 * Every second: run the rules (src/lib/leftBehind.ts) on all cars → turn them into alert
 * events (src/lib/alerts.ts) → show them as banners and SPEAK them (expo-speech), so the
 * driver never has to look. Banners disappear after BANNER_MS.
 *
 * Note: this runs while the map screen is open. Alerts with the app in the background
 * (screen off) are a later step — they need the checks to run in the background task.
 */
import * as Speech from 'expo-speech';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { MapCar } from '../components/map/types';
import type { TripSettings } from '../config';
import { AlertEvent, AlertMemory, CarStatus, nextAlerts } from '../lib/alerts';
import { cumulativeDistances, type LatLng } from '../lib/geo';
import { detectLeftBehind, updateOffRouteTimer } from '../lib/leftBehind';
import { advanceAlongRoute } from '../lib/prediction';

const BANNER_MS = 12000;
const MAX_BANNERS = 3;

export function useAlerts(cars: MapCar[], route: LatLng[], settings: TripSettings) {
  const memory = useRef<AlertMemory>(new Map());
  const offRouteSince = useRef(new Map<string, number | null>());
  const [alerts, setAlerts] = useState<AlertEvent[]>([]);
  const [muted, setMuted] = useState(false);
  const mutedRef = useRef(muted);
  mutedRef.current = muted;

  const cum = useMemo(() => cumulativeDistances(route), [route]);

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
      return {
        userId: r.userId,
        name: car.name,
        isMe: car.isMe,
        behindReasons: r.reasons,
        gapMeters: r.gapMeters,
        fixAgeMs: car.ageMs,
      };
    });

    const events = nextAlerts(statuses, memory.current, now);
    if (!events.length) return;
    setAlerts((old) => [...events, ...old].slice(0, MAX_BANNERS));
    if (!mutedRef.current) for (const e of events) Speech.speak(e.text, { language: 'en-GB', rate: 1.0 });
  }, [cars, route, cum, settings]);

  // Auto-hide banners.
  useEffect(() => {
    if (!alerts.length) return;
    const t = setInterval(() => setAlerts((old) => old.filter((a) => Date.now() - a.at < BANNER_MS)), 1000);
    return () => clearInterval(t);
  }, [alerts.length]);

  // Stop talking when leaving the screen.
  useEffect(() => () => void Speech.stop(), []);

  return {
    alerts,
    dismiss: (id: string) => setAlerts((old) => old.filter((a) => a.id !== id)),
    muted,
    setMuted: (m: boolean) => {
      setMuted(m);
      if (m) Speech.stop();
    },
  };
}
