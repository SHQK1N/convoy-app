/// <reference types="node" />
/** Tests for button cooldowns. Run with: npm test */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Cooldowns } from './cooldown';

test('a button is blocked for the cooldown after use', () => {
  const cd = new Cooldowns();
  assert.equal(cd.left('slow', 0, 60_000), 0);
  cd.use('slow', 1000);
  assert.equal(cd.left('slow', 31_000, 60_000), 30_000);
  assert.equal(cd.left('slow', 61_000, 60_000), 0);
});

test('incoming repeats from the same person are ignored, other people are not', () => {
  const cd = new Cooldowns();
  assert.equal(cd.accept('maria:slow', 0, 60_000), true);
  assert.equal(cd.accept('maria:slow', 5_000, 60_000), false);
  assert.equal(cd.accept('maria:slow', 59_000, 60_000), false);
  assert.equal(cd.accept('nikos:slow', 5_000, 60_000), true);
  assert.equal(cd.accept('maria:ok', 5_000, 60_000), true); // different button
  assert.equal(cd.accept('maria:slow', 61_000, 60_000), true);
});
