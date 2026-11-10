/**
 * Tests for the pure logic in src/lib. Run with:  npm test
 * Uses Node's built-in test runner (no extra framework).
 *
 * Test route: a straight line going north from Athens, ~111 km per degree of latitude.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { distance, projectOnRoute, pointAlongRoute, cumulativeDistances } from './geo';
import { estimateCar } from './prediction';
import { detectLeftBehind, updateOffRouteTimer } from './leftBehind';
import { DEFAULT_TRIP_SETTINGS } from '../config';

const route = [
  { lat: 38.0, lng: 23.7 },
  { lat: 38.5, lng: 23.7 },
  { lat: 39.0, lng: 23.7 },
];
const KM_PER_DEG = 111.2;
const near = (a: number, b: number, tol: number) => assert.ok(Math.abs(a - b) <= tol, `${a} not within ${tol} of ${b}`);

test('distance: one degree of latitude ≈ 111 km', () => {
  near(distance(route[0], route[2]) / 1000, KM_PER_DEG, 0.5);
});

test('projectOnRoute: point beside the route projects onto it', () => {
  const p = { lat: 38.25, lng: 23.71 }; // ~0.9 km east of the line, 1/4 of the way
  const r = projectOnRoute(p, route);
  near(r.alongMeters / 1000, KM_PER_DEG / 4, 0.5);
  near(r.offsetMeters, 875, 50);
});

test('pointAlongRoute: inverse of projectOnRoute', () => {
  const cum = cumulativeDistances(route);
  const p = pointAlongRoute(route, 80000, cum);
  near(projectOnRoute(p, route, cum).alongMeters, 80000, 1);
});

test('estimateCar: fresh fix is shown as-is', () => {
  const now = 1_000_000;
  const e = estimateCar({ lat: 38.1, lng: 23.7, speed: 25, at: now - 5000 }, route, now);
  assert.equal(e.predicted, false);
  assert.equal(e.position.lat, 38.1);
});

test('estimateCar: offline car is moved forward along the route at its last speed', () => {
  const now = 10_000_000;
  // 25 m/s for 120 s = 3 km further along
  const e = estimateCar({ lat: 38.1, lng: 23.7, speed: 25, at: now - 120_000 }, route, now);
  assert.equal(e.predicted, true);
  near(distance({ lat: 38.1, lng: 23.7 }, e.position), 3000, 20);
});

test('estimateCar: stationary offline car stays put', () => {
  const now = 10_000_000;
  const e = estimateCar({ lat: 38.1, lng: 23.7, speed: 0, at: now - 120_000 }, route, now);
  assert.equal(e.predicted, true);
  assert.equal(e.position.lat, 38.1);
});

test('detectLeftBehind: car 6 km behind trips the distance rule', () => {
  const cum = cumulativeDistances(route);
  const lead = pointAlongRoute(route, 50000, cum);
  const back = pointAlongRoute(route, 44000, cum);
  const res = detectLeftBehind(
    [
      { userId: 'lead', position: lead, speed: 30, offRouteSince: null },
      { userId: 'back', position: back, speed: 30, offRouteSince: null },
    ],
    route, DEFAULT_TRIP_SETTINGS, 0,
  );
  const b = res.find((r) => r.userId === 'back')!;
  assert.deepEqual(b.reasons, ['distance']);
  assert.deepEqual(res.find((r) => r.userId === 'lead')!.reasons, []);
});

test('detectLeftBehind: slow traffic trips the time rule before the distance rule', () => {
  const cum = cumulativeDistances(route);
  // 4 km gap (under 5 km) but both crawling at 5 m/s → 13 min > 10 min
  const res = detectLeftBehind(
    [
      { userId: 'lead', position: pointAlongRoute(route, 50000, cum), speed: 5, offRouteSince: null },
      { userId: 'back', position: pointAlongRoute(route, 46000, cum), speed: 5, offRouteSince: null },
    ],
    route, DEFAULT_TRIP_SETTINGS, 0,
  );
  assert.deepEqual(res.find((r) => r.userId === 'back')!.reasons, ['time']);
});

test('detectLeftBehind: same 4 km gap at motorway speed is fine', () => {
  const cum = cumulativeDistances(route);
  // 4 km at 30 m/s = 2.2 min → no alert
  const res = detectLeftBehind(
    [
      { userId: 'lead', position: pointAlongRoute(route, 50000, cum), speed: 30, offRouteSince: null },
      { userId: 'back', position: pointAlongRoute(route, 46000, cum), speed: 30, offRouteSince: null },
    ],
    route, DEFAULT_TRIP_SETTINGS, 0,
  );
  assert.deepEqual(res.find((r) => r.userId === 'back')!.reasons, []);
});

test('off-route rule needs 60 s before firing', () => {
  const off = { lat: 38.25, lng: 23.75 }; // ~4 km east
  const since = updateOffRouteTimer(null, off, route, DEFAULT_TRIP_SETTINGS, 1000);
  assert.equal(since, 1000);
  const car = { userId: 'x', position: off, speed: 20, offRouteSince: since };
  assert.deepEqual(detectLeftBehind([car], route, DEFAULT_TRIP_SETTINGS, 30_000)[0].reasons, []);
  assert.deepEqual(detectLeftBehind([car], route, DEFAULT_TRIP_SETTINGS, 62_000)[0].reasons, ['offRoute']);
  // Back on route resets the timer
  assert.equal(updateOffRouteTimer(since, route[1], route, DEFAULT_TRIP_SETTINGS, 70_000), null);
});
