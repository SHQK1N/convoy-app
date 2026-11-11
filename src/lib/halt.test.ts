/// <reference types="node" />
/** Tests for group breaks. Run with: npm test */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cumulativeDistances, pointAlongRoute } from './geo';
import { ARRIVED_M, pickStop, reminderFor } from './halt';

const route = [
  { lat: 38.0, lng: 23.7 },
  { lat: 39.0, lng: 23.7 },
];
const cum = cumulativeDistances(route);
const at = (m: number, dx = 0) => {
  const p = pointAlongRoute(route, m, cum);
  return { ...p, lng: p.lng + dx };
};

test('picks the first place ahead of the FRONT car, not behind it', () => {
  const stop = pickStop(route, 20000, [
    { ...at(15000), label: 'Behind the front car' },
    { ...at(30000), label: 'Shell' },
    { ...at(26000, 0.05), label: 'Too far off the road' }, // ~4 km east
    { ...at(40000), label: 'Later' },
  ], cum);
  assert.equal(stop.label, 'Shell');
  assert.ok(Math.abs(stop.alongM - 30000) < 5);
});

test('ignores places too close to react in time', () => {
  const stop = pickStop(route, 20000, [{ ...at(20500), label: 'Too close' }, { ...at(25000), label: 'OK' }], cum);
  assert.equal(stop.label, 'OK');
});

test('falls back to a point on the route when nothing is found', () => {
  const stop = pickStop(route, 20000, [], cum);
  assert.equal(stop.label, 'the next safe place to pull over');
  assert.ok(Math.abs(stop.alongM - 25000) < 5);
});

test('reminders: each distance once, largest skipped when already closer, then "arrived"', () => {
  const said = new Set<number>();
  assert.equal(reminderFor(8000, said, 'Shell'), null);
  assert.equal(reminderFor(4900, said, 'Shell'), 'Stop in 4.9 km: Shell.');
  assert.equal(reminderFor(4500, said, 'Shell'), null);
  assert.equal(reminderFor(1500, said, 'Shell'), 'Stop in 1.5 km: Shell.');
  assert.equal(reminderFor(400, said, 'Shell'), 'Stop in 400 m: Shell.');
  assert.equal(reminderFor(ARRIVED_M - 1, said, 'Shell'), 'You have arrived at the stop. Pull over at Shell.');
  assert.equal(reminderFor(10, said, 'Shell'), null);
});
