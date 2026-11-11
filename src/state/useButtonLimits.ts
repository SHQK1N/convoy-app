/**
 * Anti-spam for 🐢 Slow down and 👍 I'm OK (☕ Break is limited in useHalt + the database).
 *
 *   const limits = useButtonLimits();
 *   limits.slowLeftMs > 0  → button disabled, label shows the wait
 *   limits.markUsed('slow') after sending
 *   limits.acceptIncoming(event) → false for repeats from the same person (ignored, not spoken)
 *
 * Cooldown lengths: src/config.ts → cooldowns.
 */
import { useEffect, useRef, useState } from 'react';
import { CONFIG } from '../config';
import { Cooldowns } from '../lib/cooldown';
import type { TripEvent } from '../services/live';

const MS = { slow: CONFIG.cooldowns.slowMs, ok: CONFIG.cooldowns.okMs } as const;

export function useButtonLimits() {
  const cd = useRef(new Cooldowns());
  const [, tick] = useState(0);

  // Re-render every second so the remaining-seconds labels count down.
  useEffect(() => {
    const t = setInterval(() => tick((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const now = Date.now();
  return {
    slowLeftMs: cd.current.left('me:slow', now, MS.slow),
    okLeftMs: cd.current.left('me:ok', now, MS.ok),
    markUsed: (type: TripEvent['type']) => cd.current.use(`me:${type}`, Date.now()),
    acceptIncoming: (e: TripEvent) => cd.current.accept(`${e.by}:${e.type}`, Date.now(), MS[e.type]),
  };
}
