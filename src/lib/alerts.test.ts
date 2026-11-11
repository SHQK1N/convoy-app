/// <reference types="node" />
/** Tests for alert events. Run with: npm test */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../config';
import { AlertMemory, CarStatus, nextAlerts } from './alerts';

const eleni = (over: Partial<CarStatus> = {}): CarStatus => ({
  userId: 'e', name: 'Eleni', isMe: false, behindReasons: [], gapMeters: 1000, fixAgeMs: 0, ...over,
});

test('fires once when a car falls behind, not every second', () => {
  const mem: AlertMemory = new Map();
  assert.equal(nextAlerts([eleni()], mem, 0).length, 0);
  const first = nextAlerts([eleni({ behindReasons: ['distance'], gapMeters: 6200 })], mem, 1000);
  assert.equal(first.length, 1);
  assert.equal(first[0].text, 'Eleni is falling behind, 6.2 kilometres back. Slow down so they can catch up.');
  assert.equal(nextAlerts([eleni({ behindReasons: ['distance'], gapMeters: 6500 })], mem, 2000).length, 0);
});

test('repeats while the problem lasts', () => {
  const mem: AlertMemory = new Map();
  const behind = eleni({ behindReasons: ['time'], gapMeters: 4000 });
  nextAlerts([behind], mem, 0);
  assert.equal(nextAlerts([behind], mem, CONFIG.alerts.repeatEveryMs - 1).length, 0);
  assert.equal(nextAlerts([behind], mem, CONFIG.alerts.repeatEveryMs).length, 1);
});

test('"caught up" only after the problem has stayed gone for clearAfterMs', () => {
  const mem: AlertMemory = new Map();
  nextAlerts([eleni({ behindReasons: ['distance'] })], mem, 0);
  assert.equal(nextAlerts([eleni()], mem, 1000).length, 0); // just recovered
  nextAlerts([eleni({ behindReasons: ['distance'] })], mem, 2000); // flips back: no new alert, timer reset
  assert.equal(nextAlerts([eleni()], mem, 3000).length, 0);
  const ok = nextAlerts([eleni()], mem, 3000 + CONFIG.alerts.clearAfterMs);
  assert.equal(ok.length, 1);
  assert.equal(ok[0].problem, false);
  assert.equal(ok[0].text, 'Eleni has caught up.');
});

test('offline alert, and no distance alerts based on a guessed position', () => {
  const mem: AlertMemory = new Map();
  const ev = nextAlerts([eleni({ fixAgeMs: CONFIG.alerts.offlineAfterMs, behindReasons: ['distance'] })], mem, 0);
  assert.deepEqual(ev.map((e) => e.kind), ['offline']);
});

test('a stale position never triggers a distance alert', () => {
  const mem: AlertMemory = new Map();
  assert.equal(nextAlerts([eleni({ fixAgeMs: CONFIG.alerts.staleAfterMs, behindReasons: ['distance'] })], mem, 0).length, 0);
});

test('messages for my own car', () => {
  const mem: AlertMemory = new Map();
  const ev = nextAlerts([eleni({ isMe: true, behindReasons: ['distance', 'offRoute'], gapMeters: 12400 })], mem, 0);
  assert.deepEqual(ev.map((e) => e.text), ['You have left the route.', 'You are falling behind, 12 kilometres from the car ahead.']);
});
