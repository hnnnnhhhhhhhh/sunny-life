import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import PF from 'pathfinding';
import { Box3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { findPath, navigationGrid, newGame } from '../src/game.js';
import { LANDMARKS, restoreWorldPosition, terrainHeight, terrainSurface, terrainWalkable } from '../src/terrain.js';

test('the complete editable lot remains flat and above water', () => {
  for (let x = -10.5; x <= 10.5; x += 0.5) for (let z = -8.5; z <= 8.5; z += 0.5) {
    assert.equal(terrainHeight(x, z), 0, `${x},${z}`);
    assert.equal(terrainSurface(x, z).kind, 'land');
  }
});

test('water and unreachable cliffs cannot be chosen as walk targets', () => {
  const game = newGame();
  assert.equal(terrainSurface(0, 14).kind, 'water');
  assert.equal(terrainWalkable(0, 14), false);
  assert.equal(terrainWalkable(-31, -22), false);
  assert.deepEqual(findPath(game.home, game.sim, { x: 0, z: 14 }), []);
});

test('all destinations have continuous routes on land, ramps, or bridges', () => {
  const game = newGame(), grid = navigationGrid(game.home);
  for (const landmark of LANDMARKS) {
    const path = findPath(game.home, game.sim, landmark, grid);
    assert.ok(path.length, landmark.id);
    const kinds = new Set();
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1], b = path[i];
      const cells = PF.Util.interpolate(Math.round((a.x + 38) * 2), Math.round((a.z + 38) * 2), Math.round((b.x + 38) * 2), Math.round((b.z + 38) * 2));
      let previousHeight;
      for (const [x, z] of cells) {
        assert.ok(grid.isWalkableAt(x, z), `Blocked route to ${landmark.id}`);
        const surface = terrainSurface(x / 2 - 38, z / 2 - 38);
        assert.notEqual(surface.kind, 'water');
        kinds.add(surface.kind);
        if (previousHeight !== undefined) assert.ok(Math.abs(surface.height - previousHeight) < 0.45, `Cliff crossing on route to ${landmark.id}`);
        previousHeight = surface.height;
      }
    }
    if (landmark.id === 'camp' || landmark.id === 'park') assert.ok(kinds.has('bridge'), landmark.id);
    if (landmark.id === 'village') assert.ok(kinds.has('ramp'));
  }
});

test('legacy saves on new water preserve the home and character while recovering position', () => {
  const original = newGame();
  original.sim.x = 0;
  original.sim.z = 14;
  const recovered = restoreWorldPosition(original);
  assert.equal(recovered.home, original.home);
  assert.equal(recovered.avatar, original.avatar);
  assert.equal(recovered.budget, original.budget);
  assert.deepEqual([recovered.sim.x, recovered.sim.z], [0, 7]);
  assert.equal(original.sim.z, 14);
  assert.equal(restoreWorldPosition(newGame()).sim.z, 2.55);
});

const root = new URL('../', import.meta.url);
const manifest = JSON.parse(await readFile(new URL('src/assets/world-manifest.json', root), 'utf8'));
test('the ten-piece Blender world kit has a real editable source', async () => {
  assert.equal(manifest.assets.length, 10);
  const source = await readFile(new URL(manifest.source, root));
  assert.ok(source.length > 50000);
  assert.ok(manifest.assets.reduce((sum, item) => sum + item.bytes, 0) < 700000);
});

for (const asset of manifest.assets) {
  test(`world asset ${asset.type} parses, is grounded, and matches its manifest`, async () => {
    const bytes = await readFile(new URL(`public/${asset.file}`, root));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), asset.sha256);
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    const gltf = await new GLTFLoader().parseAsync(buffer, '');
    const bounds = new Box3().setFromObject(gltf.scene, true);
    assert.ok(Math.abs(bounds.min.y) < 0.012, asset.type);
    assert.ok(Math.max(Math.abs(bounds.min.x), Math.abs(bounds.max.x)) < asset.footprint[0] / 2 + 0.03);
    assert.ok(Math.max(Math.abs(bounds.min.z), Math.abs(bounds.max.z)) < asset.footprint[1] / 2 + 0.03);
    let triangles = 0;
    gltf.scene.traverse(mesh => {
      if (mesh.isMesh) triangles += (mesh.geometry.index?.count || mesh.geometry.attributes.position.count) / 3;
    });
    assert.equal(triangles, asset.triangles);
    assert.ok(triangles < 16000);
  });
}
