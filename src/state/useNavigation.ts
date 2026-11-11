/**
 * Turn-by-turn navigation for MY car (replaces Google Maps during a trip).
 *
 *   const nav = useNavigation(trip.route, myCar);
 *   nav.maneuver  → next turn (arrow, distance, instruction, "then …")
 *   nav.remainingM, nav.etaS → to the destination
 *   nav.joinLine  → dashed line to draw when I'm not on the group route yet
 *
 * Everyone follows the SAME group route (needed for the left-behind / off-route alerts).
 * If I'm more than CONFIG.behind.offRouteMeters away from it — e.g. starting from home, or after
 * a wrong turn — a short "join" route from me to the group route is fetched and navigated first.
 * Voice prompts go through src/state/voice.ts (one mute switch for everything).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { MapCar } from '../components/map/types';
import { CONFIG } from '../config';
import { cumulativeDistances, LatLng, pointAlongRoute, projectOnRoute } from '../lib/geo';
import { Maneuver, navPrompt, nextManeuver, stepStarts } from '../lib/nav';
import { fetchRoute, routePoints, StoredRoute } from '../services/route';
import { speak } from './voice';

/** Join the group route this far ahead of the nearest point on it (so you join going forward). */
const JOIN_AHEAD_M = 500;
/** Don't ask for a new join route more often than this. */
const JOIN_REFETCH_MS = 30000;

type Leg = { route: StoredRoute; points: LatLng[]; cum: number[]; starts: number[]; joinAlongM: number };

function prepare(route: StoredRoute) {
  const points = routePoints(route);
  const cum = cumulativeDistances(points);
  return { points, cum, starts: stepStarts(route.steps ?? [], cum) };
}

export function useNavigation(group: StoredRoute | null | undefined, myCar: MapCar | undefined, enabled = true) {
  const shared = useMemo(() => (group ? prepare(group) : null), [group]);
  const [leg, setLeg] = useState<Leg | null>(null);
  const lastFetch = useRef(0);
  const fetching = useRef(false);
  const said = useRef(new Set<string>());
  const activeKey = useRef('');

  const pos = myCar?.position;
  const onShared = shared && pos ? projectOnRoute(pos, shared.points, shared.cum) : null;
  const offShared = !!onShared && onShared.offsetMeters > CONFIG.behind.offRouteMeters;
  const onLeg = leg && pos ? projectOnRoute(pos, leg.points, leg.cum) : null;
  const legUsable = !!onLeg && onLeg.offsetMeters <= CONFIG.behind.offRouteMeters;

  // Fetch / drop the join leg.
  useEffect(() => {
    if (!enabled || !shared || !pos || shared.points.length < 2) return;
    if (!offShared) {
      if (leg) setLeg(null); // back on the group route
      return;
    }
    if (legUsable || fetching.current || Date.now() - lastFetch.current < JOIN_REFETCH_MS) return;
    fetching.current = true;
    lastFetch.current = Date.now();
    const total = shared.cum[shared.cum.length - 1];
    const joinAlongM = Math.min(total, onShared!.alongMeters + JOIN_AHEAD_M);
    fetchRoute([pos, pointAlongRoute(shared.points, joinAlongM, shared.cum)])
      .then((r) => {
        // The leg's "arrive" is really "join the group".
        r.steps = (r.steps ?? []).map((s) => (s.type === 10 ? { ...s, type: 6, instruction: 'Join the group route', name: '' } : s));
        setLeg({ route: r, ...prepare(r), joinAlongM });
      })
      .catch(() => {})
      .finally(() => (fetching.current = false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, shared, offShared, legUsable, pos?.lat, pos?.lng]);

  // Which route am I navigating right now?
  const usingLeg = offShared && legUsable && leg;
  const active = usingLeg ? leg : shared;
  const steps = (usingLeg ? leg!.route.steps : group?.steps) ?? [];

  let maneuver: Maneuver | null = null;
  let remainingM: number | null = null;
  if (active && pos && steps.length) {
    const myAlong = usingLeg ? onLeg!.alongMeters : onShared!.alongMeters;
    maneuver = nextManeuver(myAlong, steps, active.starts);
    const sharedTotal = shared!.cum[shared!.cum.length - 1];
    remainingM = usingLeg
      ? leg!.cum[leg!.cum.length - 1] - myAlong + (sharedTotal - leg!.joinAlongM)
      : sharedTotal - myAlong;
  }
  const avgSpeed = group && group.durationS > 0 ? group.distanceM / group.durationS : 20;
  const etaS = remainingM != null ? remainingM / avgSpeed : null;

  // Voice prompts (reset when switching between join leg and group route).
  const key = usingLeg ? `leg:${leg!.route.computedAt}` : `group:${group?.computedAt ?? ''}`;
  if (key !== activeKey.current) {
    activeKey.current = key;
    said.current = new Set();
  }
  const promptKey = maneuver ? `${maneuver.index}:${Math.round(maneuver.distanceM / 20)}` : '';
  useEffect(() => {
    if (!enabled || !maneuver) return;
    const text = navPrompt(maneuver, myCar?.speed ?? null, said.current);
    if (text) speak(text);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, promptKey]);

  return {
    /** false = this route was saved before navigation existed: leader should tap "New route". */
    hasSteps: !!group?.steps?.length,
    maneuver,
    remainingM,
    etaS,
    joining: !!usingLeg,
    joinLine: usingLeg ? leg!.points : null,
  };
}
