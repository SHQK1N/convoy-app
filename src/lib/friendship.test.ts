/// <reference types="node" />
/** Tests for the pure parts of the friendship helpers. Run with: npm test */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { orderedPair, toFriendEntries } from './friendship';

const p = (id: string, name: string) => ({ id, username: name.toLowerCase(), display_name: name, colour: '#000' });

test('orderedPair: same result whichever way round', () => {
  assert.deepEqual(orderedPair('b', 'a'), { user_a: 'a', user_b: 'b' });
  assert.deepEqual(orderedPair('a', 'b'), { user_a: 'a', user_b: 'b' });
});

test('toFriendEntries: status from my point of view, sorted by name', () => {
  const me = 'm';
  const rows = [
    { user_a: 'a', user_b: 'm', requested_by: 'a', status: 'pending' as const, a: p('a', 'Zoe'), b: p('m', 'Me') },
    { user_a: 'm', user_b: 'x', requested_by: 'm', status: 'pending' as const, a: p('m', 'Me'), b: p('x', 'Anna') },
    { user_a: 'c', user_b: 'm', requested_by: 'c', status: 'accepted' as const, a: p('c', 'Kostas'), b: p('m', 'Me') },
  ];
  const out = toFriendEntries(rows, me).map((e) => [e.profile.display_name, e.status]);
  assert.deepEqual(out, [
    ['Anna', 'outgoing'],
    ['Kostas', 'friend'],
    ['Zoe', 'incoming'],
  ]);
});
