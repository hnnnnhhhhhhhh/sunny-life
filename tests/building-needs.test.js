import { test } from 'node:test';
import assert from 'node:assert/strict';
import { allWalls, removeWall, roomFromPoints, setWallOpening, wallColliders } from '../src/architecture.js';
import { createRoom, findPath, migrateGame, navigationGrid, newGame, surfaceHeight, validateSave } from '../src/game.js';
import { autonomousCandidates } from '../src/autonomy.js';
import { planActivity } from '../src/interactions.js';

const empty = () => ({ ...newGame().home, foundation: false, rooms: [], furniture: [], walls: [] });

test('rooms create floors and doors whose visual gaps agree with navigation', () => {
  const { home, price, error } = createRoom(empty(), roomFromPoints({ x: 3, z: 3 }, { x: -3, z: -2 }, 'room'));
  assert.equal(error, undefined);
  assert.ok(price > 0);
  assert.equal(home.walls.length, 4);
  assert.equal(surfaceHeight(home, 0, 0), 0.25);
  const path = findPath(home, { x: 0, z: 5 }, { x: 0, z: 0 });
  assert.deepEqual(path.at(-1), { x: 0, z: 0 });
  assert.ok(path.length > 1);
  const closed = { ...home, walls: home.walls.map(w => ({ ...w, kind: 'wall' })) };
  assert.equal(findPath(closed, { x: 0, z: 5 }, { x: 0, z: 0 }).length, 0);
  const open = setWallOpening(closed, 'room-south', 'door', { x: 0, z: 3 }).home;
  assert.ok(findPath(open, { x: 0, z: 5 }, { x: 0, z: 0 }).length > 0);
  assert.ok(findPath(removeWall(closed, 'room-south'), { x: 0, z: 5 }, { x: 0, z: 0 }).length > 0);
});

test('rooms reject overlaps, out-of-lot coordinates and blocked walls', () => {
  const home = newGame().home;
  assert.match(createRoom(home, { id: 'r', x1: -2, x2: 2, z1: -2, z2: 2 }).error, /覆盖/);
  assert.match(createRoom(empty(), { id: 'r', x1: 10, x2: 13, z1: 0, z2: 3 }).error, /地块/);
  assert.match(createRoom(empty(), { id: 'r', x1: 0, x2: 1, z1: 0, z2: 3 }).error, /至少/);
});

test('original exterior walls have stable deletion IDs and no remaining ghost collisions', () => {
  const home = newGame().home;
  const removed = removeWall(home, 'exterior-north');
  assert.equal(allWalls(removed).some(w => w.id === 'exterior-north'), false);
  assert.equal(wallColliders(removed).some(w => w.wallId === 'exterior-north'), false);
  assert.equal(home.removedExterior.length, 0);
});

test('default bathroom has reachable actual seat and shower stand locations', () => {
  const game = newGame(), grid = navigationGrid(game.home);
  for (const type of ['toilet', 'shower']) {
    const plan = planActivity(game.home, game.home.furniture.find(f => f.type === type), game.sim, grid);
    assert.equal(plan.error, undefined, type);
    assert.equal(plan.floor, 0.25);
    assert.ok(plan.seat || plan.stand);
  }
});

test('autonomy ranks urgent needs without fabricating inaccessible furniture', () => {
  const game = newGame();
  game.sim.needs.bladder = 7; game.sim.needs.hunger = 35;
  const candidates = autonomousCandidates(game, game.sim, navigationGrid(game.home));
  assert.equal(candidates[0].type, 'toilet');
  assert.ok(candidates.some(c => c.type === 'eat'));
  game.home.furniture = game.home.furniture.filter(f => !['toilet', 'dining'].includes(f.type));
  const unavailable = autonomousCandidates(game, game.sim, navigationGrid(game.home));
  assert.equal(unavailable.some(c => c.type === 'toilet' || c.type === 'eat'), false);
  assert.equal(game.sim.needs.bladder, 7);
});

test('legacy migration adds only missing fields and rejects malformed new fields', () => {
  const game = newGame(), old = structuredClone(game);
  delete old.home.rooms; old.home.walls = old.home.walls.filter(w => !w.roomId);
  delete old.home.foundation; delete old.home.exteriorEdits; delete old.home.removedExterior;
  delete old.sim.needs.hygiene; delete old.sim.needs.bladder; delete old.sim.autonomy;
  assert.equal(validateSave(old), true);
  const migrated = migrateGame(old);
  assert.deepEqual(migrated.home.furniture, old.home.furniture);
  assert.deepEqual(migrated.avatar, old.avatar);
  assert.ok(migrated.sim.needs.hygiene > 0);
  assert.equal(migrated.sim.autonomy, true);
  for (const mutate of [
    g => { g.sim.needs.bladder = -1; }, g => { g.sim.autonomy = 'yes'; },
    g => { g.home.rooms[0].x2 = NaN; }, g => { g.home.removedExterior = ['invalid']; },
    g => { g.home.exteriorEdits = { 'exterior-north': { kind: 'unknown' } }; },
  ]) {
    const bad = structuredClone(game); mutate(bad); assert.equal(validateSave(bad), false);
  }
});
