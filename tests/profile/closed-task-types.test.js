import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { rankFocusModules, visibleFavoriteTiles, withoutClosedTaskTypes } from '../../src/lib/profile-task-filters.js';

const tiles = ['RA', 'RS', 'RL', 'WFD', 'WE', 'DI', 'RTS'].map((type) => ({ type, label: type }));
const counts = { RA: 1, DI: 4, RTS: 2 };

test('focus modules from profile data drop DI when DI is off and keep it when on', () => {
  const stored = ['DI', 'WE', 'RA', 'DI 描述图表', '口语'];
  assert.deepEqual(withoutClosedTaskTypes(stored, { diEnabled: false }), ['WE', 'RA', '口语']);
  assert.deepEqual(withoutClosedTaskTypes(stored, { diEnabled: true }), stored);
  assert.deepEqual(withoutClosedTaskTypes(['WE', 'RADIO'], { diEnabled: false }), ['WE', 'RADIO']);
});

test('ranked focus modules never suggest DI while it is closed', () => {
  const completed = { RA: 9, DI: 0, WFD: 3, RTS: 1, WE: 5, RS: 2 };
  assert.deepEqual(rankFocusModules(completed, { diEnabled: false }), ['RTS', 'RS', 'WFD']);
  assert.deepEqual(rankFocusModules(completed, { diEnabled: true }), ['DI', 'RTS', 'RS']);
  assert.deepEqual(rankFocusModules({}, { diEnabled: false }), ['RA', 'WFD', 'RTS']);
});

test('favorite tiles and their total leave DI out while it is closed', () => {
  const closed = visibleFavoriteTiles(tiles, counts, { diEnabled: false });
  assert.deepEqual(closed.items.map((tile) => tile.type), ['RA', 'RS', 'RL', 'WFD', 'WE', 'RTS']);
  assert.equal(closed.total, 3);
  const open = visibleFavoriteTiles(tiles, counts, { diEnabled: true });
  assert.ok(open.items.some((tile) => tile.type === 'DI' && tile.count === 4));
  assert.equal(open.total, 7);
});

test('the profile page reads task types through the shared filters', () => {
  const source = readFileSync(new URL('../../src/views/ProfileView.vue', import.meta.url), 'utf8');
  assert.match(source, /withoutClosedTaskTypes\(normalizeListValue\(/);
  assert.match(source, /rankFocusModules\(/);
  assert.match(source, /visibleFavoriteTiles\(favoriteTaskTypes/);
  assert.doesNotMatch(source, /RA \/ DI \/ WFD/);
});
