/**
 * Turns car statuses into alert EVENTS (what to show and say) — SPEC §6.
 * Pure logic, unit-tested in alerts.test.ts. The hook useAlerts() feeds it every second.
 *
 * For each car and problem kind it remembers whether the problem is active, so that:
 *   - an alert fires once when a problem starts (not every second),
 *   - it repeats every CONFIG.alerts.repeatEveryMs while the problem lasts,
 *   - "caught up" / "back online" fires only after the problem has been gone for
 *     CONFIG.alerts.clearAfterMs (GPS jitter around a threshold won't spam alerts).
 *
 * Every phone runs this on the same shared data, so every phone alerts — no server needed.
 */
import { CONFIG } from '../config';
import type { BehindReason } from './leftBehind';

export type ProblemKind = 'behind' | 'offRoute' | 'offline';

export type CarStatus = {
  userId: string;
  name: string;
  isMe: boolean;
  behindReasons: BehindReason[];
  /** distance to the car ahead along the route, metres */
  gapMeters: number;
  /** ms since the last REAL position was received */
  fixAgeMs: number;
};

export type AlertEvent = {
  id: string;
  userId: string;
  kind: ProblemKind;
  /** true = problem started/continues; false = problem resolved ("caught up") */
  problem: boolean;
  text: string;
  at: number;
};

type Memory = { active: boolean; firedAt: number; clearSince: number | null };
export type AlertMemory = Map<string, Memory>;

const km = (m: number) => (m >= 10000 ? `${Math.round(m / 1000)} kilometres` : `${(m / 1000).toFixed(1)} kilometres`);

function problemText(kind: ProblemKind, s: CarStatus): string {
  const who = s.isMe ? 'You' : s.name;
  switch (kind) {
    case 'behind':
      return s.isMe
        ? `You are falling behind, ${km(s.gapMeters)} from the car ahead.`
        : `${who} is falling behind, ${km(s.gapMeters)} back. Slow down so they can catch up.`;
    case 'offRoute':
      return s.isMe ? 'You have left the route.' : `${who} has left the route.`;
    case 'offline':
      return s.isMe ? 'You have lost signal.' : `${who} lost signal. Showing an estimated position.`;
  }
}

function clearedText(kind: ProblemKind, s: CarStatus): string {
  const who = s.isMe ? 'You' : s.name;
  switch (kind) {
    case 'behind':
      return s.isMe ? 'You have caught up with the group.' : `${who} has caught up.`;
    case 'offRoute':
      return s.isMe ? 'You are back on the route.' : `${who} is back on the route.`;
    case 'offline':
      return s.isMe ? 'Your signal is back.' : `${who} is back online.`;
  }
}

function isActive(kind: ProblemKind, s: CarStatus): boolean {
  if (kind === 'behind') return s.behindReasons.includes('distance') || s.behindReasons.includes('time');
  if (kind === 'offRoute') return s.behindReasons.includes('offRoute');
  return s.fixAgeMs >= CONFIG.alerts.offlineAfterMs;
}

/**
 * "I'm OK" from a car: treat its problems as already announced, so nothing is said about it
 * again for CONFIG.alerts.repeatEveryMs (unless a NEW kind of problem starts).
 */
export function snooze(memory: AlertMemory, userId: string, now: number) {
  for (const kind of ['behind', 'offRoute', 'offline'] as ProblemKind[]) {
    const key = `${userId}:${kind}`;
    const mem = memory.get(key);
    if (mem?.active) memory.set(key, { ...mem, firedAt: now });
  }
}

/**
 * @param statuses every car right now
 * @param memory   kept by the caller between calls (mutated)
 * @returns        new alert events to show/speak (often none)
 */
export function nextAlerts(statuses: CarStatus[], memory: AlertMemory, now: number): AlertEvent[] {
  const events: AlertEvent[] = [];
  const kinds: ProblemKind[] = ['offline', 'offRoute', 'behind'];

  for (const s of statuses) {
    for (const kind of kinds) {
      // Distance/route checks need a FRESH position. A stale one (tunnel, no signal) or a predicted
      // one would make a car look behind when it isn't — leave those to the 'offline' alert.
      if (kind !== 'offline' && s.fixAgeMs >= CONFIG.alerts.staleAfterMs) continue;

      const key = `${s.userId}:${kind}`;
      const mem = memory.get(key) ?? { active: false, firedAt: 0, clearSince: null };
      const active = isActive(kind, s);

      if (active) {
        mem.clearSince = null;
        if (!mem.active || now - mem.firedAt >= CONFIG.alerts.repeatEveryMs) {
          events.push({ id: `${key}:${now}`, userId: s.userId, kind, problem: true, text: problemText(kind, s), at: now });
          mem.firedAt = now;
        }
        mem.active = true;
      } else if (mem.active) {
        mem.clearSince ??= now;
        if (now - mem.clearSince >= CONFIG.alerts.clearAfterMs) {
          events.push({ id: `${key}:${now}:ok`, userId: s.userId, kind, problem: false, text: clearedText(kind, s), at: now });
          mem.active = false;
          mem.clearSince = null;
        }
      }
      memory.set(key, mem);
    }
  }
  return events;
}
