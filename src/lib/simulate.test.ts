/// <reference types="node" />
/** Tests for the convoy simulator. Run with: npm test */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../config';
import { cumulativeDistances, projectOnRoute } from './geo';
import { CATCH_UP_M, ConvoySim, REGROUP_MS, SIM_CARS, SPEEDUP } from './simulate';

const route = [
  { lat: 38.0, lng: 23.7 },
  { lat: 40.0, lng: 23.7 },
];
const cum = cumulativeDistances(route);
const along = (f: { lat: number; lng: number }) => projectOnRoute(f, route, cum).alongMeters;
const byId = (fs: { userId: string }[], id: string) => fs.find((f) => f.userId === id)! as any;

/** Run the sim in 1 s real-time steps up to `seconds`, returning the last fixes. */
function run(sim: ConvoySim, seconds: number, halt: number | null = null, from = 0) {
  let fs: any[] = [];
  for (let t = from + 1; t <= seconds; t++) fs = sim.step(t * 1000, halt);
  return fs;
}

test('cars move forward at their (sped-up) speed', () => {
  const sim = new ConvoySim(route, [SIM_CARS[0]], 0);
  const fs = run(sim, 10);
  const expected = SIM_CARS[0].startOffsetM + (105 / 3.6) * SPEEDUP * 10;
  assert.ok(Math.abs(along(fs[0]) - expected) < 5);
});

test('offline car keeps showing its old fix during the gap', () => {
  const sim = new ConvoySim(route, SIM_CARS, 0);
  const at30 = byId(run(sim, 30), 'sim-giorgos');
  const at40 = byId(run(sim, 40, null, 30), 'sim-giorgos');
  assert.equal(at30.at, at40.at);
  assert.equal(byId(run(sim, 80, null, 40), 'sim-giorgos').at, 80_000); // back online
});

test('when someone falls behind, the cars ahead wait until they catch up', () => {
  const sim = new ConvoySim(route, SIM_CARS, 0);
  let sawWaiting = false;
  let maxGap = 0;
  for (let t = 1; t <= 150; t++) { // ~125 km: stays mid-route (cars park at the end)
    const fs = sim.step(t * 1000, null);
    sawWaiting ||= sim.waiting;
    const a = fs.filter((f) => f.userId !== 'sim-giorgos').map((f) => along(f)).sort((x, y) => y - x); // Giorgos's fix is frozen while offline
    for (let i = 1; i < a.length; i++) maxGap = Math.max(maxGap, a[i - 1] - a[i]);
  }
  assert.ok(sawWaiting, 'group never slowed down');
  // Gaps get caught: never far beyond the alert distance (one step of overshoot allowed).
  assert.ok(maxGap < CONFIG.behind.km * 1000 + 2000, `gap grew to ${Math.round(maxGap)} m`);
  assert.ok(CATCH_UP_M < CONFIG.behind.km * 1000);
});

test('during a break every car parks at the stop', () => {
  const sim = new ConvoySim(route, SIM_CARS, 0);
  const stop = sim.frontAlong() + 20000;
  const fs = run(sim, 120, stop);
  for (const f of fs) if (f.userId !== 'sim-giorgos') assert.ok(Math.abs(along(f) - stop) < 5, f.userId);
});

test('after a break everyone leaves together and stays together for the regroup time', () => {
  const sim = new ConvoySim(route, SIM_CARS, 0);
  const stop = sim.frontAlong() + 20000;
  run(sim, 120, stop); // everyone parked
  const fs = run(sim, 120 + REGROUP_MS / 1000 - 1, null, 120); // drive on, just before regroup ends
  const a = fs.filter((f) => f.userId !== 'sim-giorgos').map((f) => along(f));
  assert.ok(Math.max(...a) - Math.min(...a) < 5, 'cars spread out right after the break');
  assert.ok(Math.min(...a) > stop + 1000, 'cars did not move on');
});
