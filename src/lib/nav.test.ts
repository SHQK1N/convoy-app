/// <reference types="node" />
/** Tests for turn-by-turn navigation. Run with: npm test */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { RouteStep } from '../services/route';
import { navPrompt, nextManeuver, spokenInstruction, stepStarts } from './nav';

const step = (type: number, instruction: string, fromIndex: number): RouteStep => ({ type, instruction, name: '', distance: 0, fromIndex });
const steps = [
  step(11, 'Head east on Πλατεία Ομονοίας', 0),
  step(0, 'Turn left onto Πανεπιστημίου', 1),
  step(1, 'Turn right onto Kifisias Avenue', 2),
  step(10, 'Arrive at your destination', 3),
];
const cum = [0, 1000, 1200, 5000];
const starts = stepStarts(steps, cum);

test('next maneuver skips "depart" and the turns already passed', () => {
  assert.equal(nextManeuver(0, steps, starts)!.index, 1);
  assert.equal(nextManeuver(0, steps, starts)!.distanceM, 1000);
  assert.equal(nextManeuver(1100, steps, starts)!.index, 2);
  assert.equal(nextManeuver(4000, steps, starts)!.step.type, 10);
});

test('"then" is shown when two turns come close together', () => {
  assert.equal(nextManeuver(500, steps, starts)!.then?.instruction, 'Turn right onto Kifisias Avenue');
  assert.equal(nextManeuver(1100, steps, starts)!.then, null); // next after is "arrive", far away
});

test('Greek street names are left out of what is spoken', () => {
  assert.equal(spokenInstruction(steps[1]), 'turn left');
  assert.equal(spokenInstruction(steps[2]), 'turn right onto Kifisias Avenue');
});

test('prompts: each once, earlier when driving fast, then "now"', () => {
  const said = new Set<string>();
  const at = (d: number) => ({ ...nextManeuver(0, steps, starts)!, distanceM: d });
  assert.equal(navPrompt(at(900), 10, said), null); // slow: first prompt at 400 m
  assert.equal(navPrompt(at(390), 10, said), 'In 400 metres, turn left.');
  assert.equal(navPrompt(at(380), 10, said), null);
  assert.equal(navPrompt(at(100), 10, said), 'In 100 metres, turn left.');
  assert.match(navPrompt(at(20), 10, said)!, /^Now turn left\. Then turn right onto Kifisias Avenue\.$/);
  assert.equal(navPrompt(at(10), 10, said), null);

  const fast = new Set<string>();
  assert.equal(navPrompt(at(1900), 30, fast), 'In 1.9 kilometres, turn left.');
});
