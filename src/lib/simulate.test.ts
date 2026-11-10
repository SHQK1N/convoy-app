/// <reference types="node" />
/** Tests for the convoy simulator. Run with: npm test */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cumulativeDistances, projectOnRoute } from './geo';
import { SIM_CARS, simulateConvoy, SPEEDUP } from './simulate';

const route = [
  { lat: 38.0, lng: 23.7 },
  { lat: 39.0, lng: 23.7 },
];
const cum = cumulativeDistances(route);
const along = (f: { lat: number; lng: number }) => projectOnRoute(f, route, cum).alongMeters;

test('cars move forward at their (sped-up) speed', () => {
  const [nikos] = simulateConvoy(route, 0, 10_000);
  const expected = SIM_CARS[0].startOffsetM + (105 / 3.6) * SPEEDUP * 10;
  assert.ok(Math.abs(along(nikos) - expected) < 5);
});

test('offline car freezes its last fix during the gap, then resumes', () => {
  const g = (now: number) => simulateConvoy(route, 0, now).find((f) => f.userId === 'sim-giorgos')!;
  assert.equal(g(30_000).at, 15_000); // in the gap: fix is from t = 15 s
  assert.equal(g(30_000).lat, g(40_000).lat); // not moving while offline
  assert.equal(g(65_000).at, 65_000); // back online
});

test('the slow car falls further behind over time', () => {
  const gap = (now: number) => {
    const fs = simulateConvoy(route, 0, now);
    return along(fs.find((f) => f.userId === 'sim-maria')!) - along(fs.find((f) => f.userId === 'sim-eleni')!);
  };
  assert.ok(gap(30_000) > gap(5_000));
});

test('cars stop at the end of the route', () => {
  const fs = simulateConvoy(route, 0, 10 * 60_000);
  for (const f of fs) assert.equal(f.speed, 0);
});
