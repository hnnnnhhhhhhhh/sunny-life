import { test } from 'node:test';
import assert from 'node:assert/strict';
import PF from 'pathfinding';
import {
  DEFAULT_AVATAR, ITEM_MAP, SAVE_KEY, findPath, footprint, loadGame, navigationGrid,
  newGame, saveGame, validatePlacement, validateResize, validateSave, validateWall,
} from '../src/game.js';

const object = (type, x, z, rotation = 0) => ({ id: 'test-object', type, x, z, rotation, color: ITEM_MAP[type].color });

test('the initial world is valid and every piece of furniture fits', () => {
  const game = newGame();
  assert.equal(validateSave(game), true);
  for (const f of game.home.furniture) assert.equal(validatePlacement(game.home, f, f.id), null, f.id);
  game.avatar.name = 'Changed';
  assert.notEqual(newGame().avatar.name, 'Changed');
  assert.notEqual(DEFAULT_AVATAR.name, 'Changed');
});

test('furniture collision respects quarter turns and floor coverings', () => {
  const { home } = newGame();
  assert.ok(validatePlacement(home, object('sofa', -3.1, -2.75)));
  assert.ok(validatePlacement(home, object('bed', 10, 8)));
  assert.equal(validatePlacement(home, object('plant', -3.1, 1.5)), null);
  const rotated = footprint(object('sofa', 0, 0, Math.PI / 2));
  assert.ok(Math.abs(rotated.width - 1.15) < 0.001);
  assert.ok(Math.abs(rotated.depth - 3) < 0.001);
});

test('furniture cannot intersect walls or exceed the lot capacity', () => {
  const { home } = newGame();
  assert.match(validatePlacement(home, object('plant', -6, -3)), /墙/);
  assert.match(validatePlacement({ ...home, furniture: [] }, object('plant', 1.2, -3)), /墙/);
  const full = { ...home, furniture: Array.from({ length: 120 }, (_, i) => object('plant', -9, -8 + i / 100)) };
  assert.match(validatePlacement(full, object('chair', 8, 5)), /120/);
});

test('walls require a nonzero orthogonal segment clear of furniture', () => {
  const { home } = newGame();
  assert.match(validateWall(home, { x1: 0, z1: 0, x2: 1, z2: 1 }), /网格/);
  assert.match(validateWall(home, { x1: 0, z1: 0, x2: 0, z2: 0 }), /一格/);
  assert.match(validateWall(home, { x1: 0, z1: -2.75, x2: -5, z2: -2.75 }), /家具/);
  assert.equal(validateWall(home, { x1: 0.5, z1: 0, x2: 0.5, z2: 2 }), null);
  assert.match(validateWall(home, { x1: 11, z1: 0, x2: 11, z2: 2 }), /地块/);
  assert.equal(validateWall(home, { x1: 4, z1: 6, x2: 6, z2: 6 }), null);
});

test('shrinking a house cannot strand its furniture outside', () => {
  const { home } = newGame();
  assert.equal(typeof validateResize(home, 10, 8), 'string');
  assert.match(validateResize(home, 14, 10), /扩建/);
  const original = { ...home, rooms: [], walls: home.walls.filter(w => !w.roomId), furniture: home.furniture.filter(f => !['shower', 'toilet'].includes(f.type)) };
  assert.equal(validateResize(original, 14, 10).width, 14);
  assert.match(validateResize(original, 16, 9), /新墙体/);
  assert.equal(typeof validateResize(home, 100, 100), 'string');
});

test('A* navigation reaches the street through the doorway without crossing obstacles', () => {
  const { home, sim } = newGame();
  const grid = navigationGrid(home);
  const path = findPath(home, sim, { x: 7, z: 10 }, grid);
  assert.ok(path.length > 2);
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i];
    const cells = PF.Util.interpolate(Math.round((a.x + 38) * 2), Math.round((a.z + 38) * 2), Math.round((b.x + 38) * 2), Math.round((b.z + 38) * 2));
    for (const [x, z] of cells) assert.equal(grid.isWalkableAt(x, z), true, `blocked cell ${x},${z}`);
  }
  assert.equal(findPath(home, sim, { x: 100, z: 0 }).length, 0);
});

test('activities choose reachable approach points around every default object', () => {
  const { home, sim } = newGame(), grid = navigationGrid(home);
  for (const f of home.furniture.filter(item => ITEM_MAP[item.type].activity)) {
    assert.ok(findPath(home, sim, f, grid).length > 0, `${f.type} should be reachable`);
  }
  assert.ok(findPath(home, { x: 1, z: 7 }, home.furniture.find(f => f.type === 'bed'), grid).length > 0);
});

test('local save round-trips the character, house, budget and simulation', () => {
  const storage = new Map();
  const adapter = { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) };
  const game = newGame();
  game.avatar.hair = 'curly';
  game.avatar.glasses = true;
  game.home.floor = 'tile';
  assert.equal(saveGame(adapter, game), true);
  assert.deepEqual(loadGame(adapter), { data: game, recovered: false });
  storage.set(SAVE_KEY, '{broken json');
  const fallback = loadGame(adapter);
  assert.equal(fallback.recovered, true);
  assert.equal(validateSave(fallback.data), true);
});

test('malformed imports and unavailable storage fail without replacing valid data', () => {
  for (const corrupt of [
    g => { g.avatar.height = -20; },
    g => { g.budget = '1000'; },
    g => { g.home.furniture[0].type = 'unknown'; },
    g => { g.home.furniture[0].x = Infinity; },
    g => { g.avatar.name = ''; },
    g => { g.sim.needs.energy = NaN; },
  ]) {
    const bad = newGame(); corrupt(bad); assert.equal(validateSave(bad), false);
  }
  assert.equal(saveGame({ setItem() { throw new Error('quota'); } }, newGame()), false);
  assert.equal(loadGame({ getItem() { throw new Error('blocked'); } }).recovered, true);
});
