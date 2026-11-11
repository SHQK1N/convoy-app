/**
 * Turn-by-turn navigation maths — pure, unit-tested in nav.test.ts.
 *
 * The route comes with steps (src/services/route.ts → RouteStep). Each step's maneuver
 * ("Turn left onto …") happens where the step STARTS on the route line. Knowing how far along
 * the route my car is, the next maneuver is the first step that starts ahead of me.
 */
import type { RouteStep } from '../services/route';

export type Maneuver = {
  index: number;
  step: RouteStep;
  /** metres from my car to the maneuver */
  distanceM: number;
  /** the maneuver right after, if it comes quickly (shown as "then …") */
  then: RouteStep | null;
};

/** How far along the route each step starts, metres. */
export function stepStarts(steps: RouteStep[], cum: number[]): number[] {
  return steps.map((s) => cum[Math.min(s.fromIndex, cum.length - 1)] ?? 0);
}

/** "Then …" is shown only when the following maneuver is this close after the next one. */
const THEN_WITHIN_M = 300;

/** The next maneuver ahead of `myAlongM`, or null if there is none (shouldn't happen: there's always "arrive"). */
export function nextManeuver(myAlongM: number, steps: RouteStep[], starts: number[]): Maneuver | null {
  for (let i = 0; i < steps.length; i++) {
    if (steps[i].type === 11) continue; // "depart" — the start, not a turn
    if (starts[i] > myAlongM + 5) {
      const following = steps[i + 1];
      const then = following && starts[i + 1] - starts[i] < THEN_WITHIN_M && following.type !== 10 ? following : null;
      return { index: i, step: steps[i], distanceM: starts[i] - myAlongM, then };
    }
  }
  return null;
}

/** Arrow for a maneuver type (shown big in the nav banner). */
export function arrowFor(type: number): string {
  switch (type) {
    case 0: return '⬅';
    case 1: return '➡';
    case 2: return '↙';
    case 3: return '↘';
    case 4: case 12: return '↖';
    case 5: case 13: return '↗';
    case 7: case 8: return '⟳';
    case 9: return '↶';
    case 10: return '🏁';
    default: return '⬆';
  }
}

const hasLatin = (s: string) => /[A-Za-z]/.test(s);

/**
 * What to SAY for a maneuver. The English voice can't read Greek street names, so names without
 * Latin letters are left out of the spoken text (the banner still shows them).
 */
export function spokenInstruction(step: RouteStep): string {
  let text = step.instruction.replace(/\s+/g, ' ').trim();
  const onto = text.search(/ (onto|on|towards) /);
  if (onto > 0 && !hasLatin(text.slice(onto).replace(/^ (onto|on|towards) /, ''))) text = text.slice(0, onto);
  return text.charAt(0).toLowerCase() + text.slice(1);
}

/** "800 metres", "1.5 kilometres" — spoken form. */
function spokenDistance(m: number): string {
  if (m >= 1000) return `${(Math.round(m / 100) / 10).toString()} kilometres`;
  return `${Math.max(50, Math.round(m / 50) * 50)} metres`;
}

/**
 * Voice prompt to give now for the next maneuver, or null. Each prompt is given once
 * (`said` holds "<step index>:<threshold>" keys, kept by the caller).
 * Faster driving → earlier warnings.
 */
export function navPrompt(m: Maneuver, speedMs: number | null, said: Set<string>): string | null {
  const fast = (speedMs ?? 0) > 20; // > 72 km/h
  const thresholds = fast ? [2000, 800, 250] : [400, 120];
  const NOW_M = fast ? 60 : 30;

  if (m.distanceM <= NOW_M) {
    const key = `${m.index}:now`;
    if (said.has(key)) return null;
    said.add(key);
    // Mark the earlier prompts as done too, in case we jumped straight here.
    thresholds.forEach((t) => said.add(`${m.index}:${t}`));
    if (m.step.type === 10) return 'You have arrived at your destination.';
    return `Now ${spokenInstruction(m.step)}.${m.then ? ` Then ${spokenInstruction(m.then)}.` : ''}`;
  }

  const crossed = thresholds.filter((t) => m.distanceM <= t && !said.has(`${m.index}:${t}`));
  if (!crossed.length) return null;
  const smallest = Math.min(...crossed);
  thresholds.forEach((t) => t >= smallest && said.add(`${m.index}:${t}`));
  if (m.step.type === 10) return `In ${spokenDistance(m.distanceM)}, you will arrive at your destination.`;
  return `In ${spokenDistance(m.distanceM)}, ${spokenInstruction(m.step)}.`;
}
